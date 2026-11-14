import { requireOptionalNativeModule } from 'expo-modules-core';
const Native: any = requireOptionalNativeModule('ExpoNetworkInfo');
export const isAvailable = () => !!Native;
export async function getInfoAsync(): Promise<any> {
  if (!Native) throw new Error('Netzwerk-Info nicht verfügbar (braucht nächsten Build)');
  return await Native.getInfo();
}
/** {name, ip} für jede IPv4 außer Loopback. Der nächste Build liefert die Liste, auch auf iOS. */
export async function getLanCandidatesAsync(): Promise<{ name: string; ip: string }[]> {
  if (!Native || typeof Native.getLanCandidates !== 'function') throw new Error('Lokale Adressen nicht verfügbar (braucht nächsten Build)');
  const rows = await Native.getLanCandidates();
  return Array.isArray(rows) ? rows : [];
}
/** {ssid,bssid,rssi,frequency,linkSpeed,ip,error?} – needs next build */
export async function getWifiAsync(): Promise<any> {
  if (!Native || typeof Native.getWifi !== 'function') throw new Error('WLAN-Info (BSSID) nicht verfügbar (braucht nächsten Build)');
  return await Native.getWifi();
}
