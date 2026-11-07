/**
 * Pure decisions for the background service. The Kotlin objects ServicePolicy /
 * WifiWatcher / BleReconnect implement the same rules (see comments there).
 * Wifi never keeps a foreground service; interval and due/connected bleNotify do.
 */

export const WIFI_DEBOUNCE_MS = 30_000;
export const BLE_MAX_ATTEMPTS = 10;
export const BLE_BACKOFF_CAP_MS = 5 * 60 * 1000;
export const BLE_BACKOFF_BASE_MS = 1000;
export const MIN_INTERVAL_MS = 15_000;

export function bleBackoffMs(attempt: number): number {
  const n = Math.max(1, Math.floor(attempt));
  const shift = Math.min(n - 1, 16);
  return Math.min(BLE_BACKOFF_BASE_MS * 2 ** shift, BLE_BACKOFF_CAP_MS);
}

/** `attempt` is the number of failures so far. After BLE_MAX_ATTEMPTS, stop. */
export function bleShouldRetry(attempt: number): boolean {
  return attempt < BLE_MAX_ATTEMPTS;
}

export function clampIntervalMs(everyMs: number): number {
  if (!Number.isFinite(everyMs)) return MIN_INTERVAL_MS;
  return Math.min(24 * 60 * 60 * 1000, Math.max(MIN_INTERVAL_MS, Math.floor(everyMs)));
}

export function needsForegroundService(input: {
  intervalCount: number;
  dueOrConnectedBle: number;
}): { needed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (input.intervalCount > 0) reasons.push('interval');
  if (input.dueOrConnectedBle > 0) reasons.push('bleNotify');
  return { needed: reasons.length > 0, reasons };
}

export function serviceDecisionLine(
  source: string,
  input: {
    intervalCount: number;
    dueOrConnectedBle: number;
    waitingBle: number;
    exhaustedBle: number;
    wifiWatchers: number;
  },
  running: boolean,
): string {
  const decision = needsForegroundService(input);
  const why = decision.needed
    ? `Gründe: ${decision.reasons.join(', ')}`
    : 'Gründe: keine interval-Trigger und kein fälliges/verbundenes bleNotify';
  const action = decision.needed
    ? running
      ? 'DIENST BLEIBT AN'
      : 'DIENST START'
    : running
      ? 'DIENST STOPP'
      : 'DIENST BLEIBT AUS';
  return `${action} | ${why} | interval=${input.intervalCount} bleFälligOderVerbunden=${input.dueOrConnectedBle} bleWartetBackoff=${input.waitingBle} bleErschöpft=${input.exhaustedBle} wifiWatcher=${input.wifiWatchers} (WLAN ohne Vordergrunddienst) | Quelle: ${source}`;
}

export type WifiIdentity = { ssid: string | null; bssid: string | null };

export type WifiState = {
  hasSeen: boolean;
  seen: WifiIdentity;
  emitted: WifiIdentity;
  lastEmitAt: number;
  pending: boolean;
};

export function initialWifiState(): WifiState {
  return {
    hasSeen: false,
    seen: { ssid: null, bssid: null },
    emitted: { ssid: null, bssid: null },
    lastEmitAt: 0,
    pending: false,
  };
}

function sameId(a: WifiIdentity, b: WifiIdentity): boolean {
  return a.ssid === b.ssid && a.bssid === b.bssid;
}

function label(id: WifiIdentity): string {
  return `${id.ssid ?? 'null'}/${id.bssid ?? 'null'}`;
}

export type WifiDecision =
  | { type: 'ignore'; reason: string; state: WifiState }
  | { type: 'schedule'; at: number; reason: string; state: WifiState }
  | { type: 'emit'; reason: string; state: WifiState; identity: WifiIdentity };

export function decideWifi(
  state: WifiState,
  next: WifiIdentity,
  now: number,
  debounceMs = WIFI_DEBOUNCE_MS,
): WifiDecision {
  if (!state.hasSeen) {
    const seeded: WifiState = { ...state, hasSeen: true, seen: next };
    if (next.ssid == null && next.bssid == null) {
      return { type: 'ignore', reason: 'WLAN Baseline ohne SSID/BSSID, kein Event', state: seeded };
    }
    return {
      type: 'emit',
      reason: `WLAN erste SSID/BSSID ${label(next)}`,
      state: { ...seeded, emitted: next, lastEmitAt: now, pending: false },
      identity: next,
    };
  }
  if (sameId(state.seen, next)) {
    return {
      type: 'ignore',
      reason: `WLAN ignoriert | SSID/BSSID unverändert ${label(next)} | doppelter Callback, kein Event`,
      state,
    };
  }
  const seenState: WifiState = { ...state, seen: next };
  if (sameId(state.emitted, next) && state.lastEmitAt !== 0) {
    return {
      type: 'ignore',
      reason: `WLAN ignoriert | wieder ${label(next)}, identisch zum letzten Event`,
      state: { ...seenState, pending: false },
    };
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
  };
}

export function decideWifiAlarm(state: WifiState, now: number, debounceMs = WIFI_DEBOUNCE_MS): WifiDecision {
  if (!state.pending) {
    return { type: 'ignore', reason: 'WLAN Alarm ohne ausstehendes Event', state };
  }
  if (sameId(state.seen, state.emitted)) {
    return {
      type: 'ignore',
      reason: 'WLAN Alarm | nichts mehr geändert',
      state: { ...state, pending: false },
    };
  }
  if (state.lastEmitAt !== 0 && now - state.lastEmitAt < debounceMs) {
    return {
      type: 'schedule',
      at: state.lastEmitAt + debounceMs,
      reason: 'WLAN Alarm zu früh, erneut planen',
      state,
    };
  }
  return {
    type: 'emit',
    reason: `WLAN Event nach Debounce | SSID/BSSID -> ${label(state.seen)}`,
    state: { ...state, emitted: state.seen, lastEmitAt: now, pending: false },
    identity: state.seen,
  };
}
