import { requireOptionalNativeModule } from 'expo-modules-core';
const Native: any = requireOptionalNativeModule('ExpoMediaControl');
export type MediaAction = 'play' | 'pause' | 'toggle' | 'next' | 'previous' | 'stop';
export async function sendMediaKey(action: MediaAction): Promise<boolean> {
  if (!Native) throw new Error('Media-Steuerung braucht nächsten Build');
  console.log('[EveryApp] media', action);
  return await Native.sendKey(action);
}
