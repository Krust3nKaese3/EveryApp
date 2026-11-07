import { requireOptionalNativeModule } from 'expo-modules-core';
const Native: any = requireOptionalNativeModule('ExpoNetworkInfo');
export const isAvailable = () => !!Native;
export async function getInfoAsync(): Promise<any> {
  if (!Native) throw new Error('Netzwerk-Info nicht verfügbar (braucht nächsten Build)');
  return await Native.getInfo();
}
/** {ssid,bssid,rssi,frequency,linkSpeed,ip,error?} – needs next build */
export async function getWifiAsync(): Promise<any> {
  if (!Native || typeof Native.getWifi !== 'function') throw new Error('WLAN-Info (BSSID) nicht verfügbar (braucht nächsten Build)');
  return await Native.getWifi();
}
