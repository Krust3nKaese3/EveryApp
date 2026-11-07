/**
 * When the foreground service may stay up. Wifi never counts: it uses a
 * PendingIntent network callback. Kotlin ServiceGate / WifiWatcher / BleManager
 * follow the same numbers.
 */
export const WIFI_DEBOUNCE_MS = 30_000;
export const BLE_MAX_ATTEMPTS = 10;
export const BLE_BACKOFF_CAP_MS = 5 * 60 * 1000;
export const BLE_BACKOFF_BASE_MS = 2_000;

export function bleBackoffMs(attempt: number): number {
  const n = Math.max(1, Math.floor(attempt));
  const shift = Math.min(n - 1, 16);
  return Math.min(BLE_BACKOFF_BASE_MS * 2 ** shift, BLE_BACKOFF_CAP_MS);
}

/** `attempt` is failures so far. After BLE_MAX_ATTEMPTS, stop. */
export function bleShouldRetry(attempt: number): boolean {
  return attempt < BLE_MAX_ATTEMPTS;
}

export function needsForegroundService(input: { interval: boolean; dueOrConnectedBle: number }): {
  needed: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (input.interval) reasons.push('interval');
  if (input.dueOrConnectedBle > 0) reasons.push('bleNotify');
  return { needed: reasons.length > 0, reasons };
}

export function serviceDecisionLine(
  source: string,
  input: { interval: boolean; dueOrConnectedBle: number; waitingBle: number; exhaustedBle: number; wifi: boolean },
  running: boolean,
): string {
  const decision = needsForegroundService(input);
  const why = decision.needed
    ? `Gründe: ${decision.reasons.join(', ')}`
    : 'Gründe: keine interval-Trigger und kein fälliges/verbundenes bleNotify';
  const action = decision.needed ? (running ? 'DIENST BLEIBT AN' : 'DIENST START') : running ? 'DIENST STOPP' : 'DIENST BLEIBT AUS';
  return `${action} | ${why} | interval=${input.interval} bleFälligOderVerbunden=${input.dueOrConnectedBle} bleWartetBackoff=${input.waitingBle} bleErschöpft=${input.exhaustedBle} wifiWatcher=${input.wifi ? 1 : 0} (WLAN ohne Vordergrunddienst) | Quelle: ${source}`;
}

export type WifiId = { ssid: string | null; bssid: string | null };
export type WifiState = { hasSeen: boolean; seen: WifiId; emitted: WifiId; lastEmitAt: number; pending: boolean };

export function initialWifiState(): WifiState {
  return { hasSeen: false, seen: { ssid: null, bssid: null }, emitted: { ssid: null, bssid: null }, lastEmitAt: 0, pending: false };
}

function same(a: WifiId, b: WifiId): boolean {
  return a.ssid === b.ssid && a.bssid === b.bssid;
}
function label(id: WifiId): string {
  return `${id.ssid ?? 'null'}/${id.bssid ?? 'null'}`;
}

export type WifiDecision =
  | { type: 'seed' | 'ignore'; reason: string; state: WifiState }
  | { type: 'schedule'; at: number; reason: string; state: WifiState }
  | { type: 'emit'; reason: string; state: WifiState; identity: WifiId; prev: WifiId };

/** First sample is remembered and not emitted (same as the old in-process watcher). */
export function decideWifi(state: WifiState, next: WifiId, now: number, debounceMs = WIFI_DEBOUNCE_MS): WifiDecision {
  if (!state.hasSeen) {
    return {
      type: 'seed',
      reason: `WLAN Baseline ${label(next)}, kein Event`,
      state: { hasSeen: true, seen: next, emitted: next, lastEmitAt: 0, pending: false },
    };
  }
  if (same(state.seen, next)) {
    return { type: 'ignore', reason: `WLAN ignoriert | SSID/BSSID unverändert ${label(next)} | doppelter Callback, kein Event`, state };
  }
  const seenState: WifiState = { ...state, seen: next };
  if (same(state.emitted, next)) {
    return { type: 'ignore', reason: `WLAN ignoriert | wieder ${label(next)}, identisch zum letzten Event`, state: { ...seenState, pending: false } };
  }
  if (state.lastEmitAt !== 0 && now - state.lastEmitAt < debounceMs) {
    return {
      type: 'schedule',
      at: state.lastEmitAt + debounceMs,
      reason: `WLAN gedrosselt | geändert auf ${label(next)} | Debounce ${debounceMs}ms`,
      state: { ...seenState, pending: true },
    };
  }
  return {
    type: 'emit',
    reason: `WLAN Event | SSID/BSSID geändert -> ${label(next)}`,
    state: { ...seenState, emitted: next, lastEmitAt: now, pending: false },
    identity: next,
    prev: state.emitted,
  };
}

export function decideWifiAlarm(state: WifiState, now: number, debounceMs = WIFI_DEBOUNCE_MS): WifiDecision {
  if (!state.pending) return { type: 'ignore', reason: 'WLAN Alarm ohne ausstehendes Event', state };
  if (same(state.seen, state.emitted)) {
    return { type: 'ignore', reason: 'WLAN Alarm | nichts mehr geändert', state: { ...state, pending: false } };
  }
  if (state.lastEmitAt !== 0 && now - state.lastEmitAt < debounceMs) {
    return { type: 'schedule', at: state.lastEmitAt + debounceMs, reason: 'WLAN Alarm zu früh, erneut planen', state };
  }
  return {
    type: 'emit',
    reason: `WLAN Event nach Debounce | SSID/BSSID -> ${label(state.seen)}`,
    state: { ...state, emitted: state.seen, lastEmitAt: now, pending: false },
    identity: state.seen,
    prev: state.emitted,
  };
}
