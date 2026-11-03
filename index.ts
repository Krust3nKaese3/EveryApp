import { registerRootComponent } from 'expo';
import { AppRegistry } from 'react-native';

import App from './App';
import { headlessEntry, initBackgroundTasks } from './src/services/BackgroundTasks';

// Generic background task engine (docs/BACKGROUND.md). Started natively by Bluetooth/boot receivers even when the UI is closed.
AppRegistry.registerHeadlessTask('EveryAppBackgroundTask', () => async (data: any) => {
  try {
    initBackgroundTasks(false);
    await headlessEntry(data);
  } catch (e: any) {
    console.error('[EveryApp][BG] FEHLER im Hintergrund-Task:', e?.message, e?.stack);
  }
});

registerRootComponent(App);
