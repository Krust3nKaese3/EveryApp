/**
 * Android: der vorhandene Vordergrunddienst hält den Host, solange der Raum läuft.
 * iOS bleibt im Hintergrund nicht wach. Der Raum wird beim nächsten Öffnen neu aufgebaut.
 */
export async function setHostKeepAlive(on: boolean): Promise<void> {
  let platform = '';
  try {
    platform = require('react-native').Platform.OS;
  } catch {
    return;
  }
  if (platform !== 'android') return;
  try {
    const { requireOptionalNativeModule } = require('expo-modules-core');
    const native = requireOptionalNativeModule('ExpoBackgroundService');
    if (native && typeof native.setHosting === 'function') native.setHosting(on);
  } catch {
    /* Alter Build ohne setHosting. Der Raum liegt trotzdem im SecureStore. */
  }
}
