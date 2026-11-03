import { requireOptionalNativeModule } from 'expo-modules-core';
const Native: any = requireOptionalNativeModule('ExpoNetworkInfo');
export const isAvailable = () => !!Native;
export async function getInfoAsync(): Promise<any> {
  if (!Native) throw new Error('Netzwerk-Info nicht verfügbar (braucht nächsten Build)');
  return await Native.getInfo();
}
