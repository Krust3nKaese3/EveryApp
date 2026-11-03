/** Pure trigger matching (no RN imports) – unit tested in tests/triggerMatching.test.js */
import type { Trigger, TriggerEvent } from './BackgroundTasks';

/** x matches if it equals name OR alias OR address (case-insensitive, trimmed). */
export function deviceMatches(x: string, d?: { name?: string; alias?: string; address?: string }) {
  const n = (v: any) => String(v ?? '').trim().toLowerCase();
  const want = n(x);
  return !!d && want !== '' && [d.name, d.alias, d.address].some((v) => n(v) === want);
}

export function matches(t: Trigger, ev: TriggerEvent) {
  if (t.type !== ev.type) return false;
  if ((t.type === 'bluetoothConnected' || t.type === 'bluetoothDisconnected') && t.nameOrAddress) {
    return deviceMatches(t.nameOrAddress, ev.device);
  }
  if (t.type === 'tileMenu' || t.type === 'widgetAction') return !t.id || t.id === ev.id;
  if (t.type === 'bleNotify') {
    const n = (v: any) => String(v ?? '').trim().toLowerCase();
    if (t.address && n(t.address) !== n(ev.ble?.address)) return false;
    if (t.charUuid && !n(ev.ble?.charUuid).includes(n(t.charUuid))) return false;
    return true;
  }
  if (t.type === 'wifiChanged') return !t.bssid || String(t.bssid).toLowerCase() === String(ev.wifi?.bssid ?? '').toLowerCase()
    || String(t.bssid).toLowerCase() === String(ev.wifi?.ssid ?? '').toLowerCase();
  if (t.type === 'quickTile') return String(t.name).trim().toLowerCase() === String(ev.tile?.name ?? '').trim().toLowerCase();
  return true;
}

