import { registerRootComponent } from 'expo';
import { AppRegistry } from 'react-native';

import App from './App';
import { runMacroTask } from './src/services/MacroEngine';

// Headless task started natively by MacroTriggerReceiver (Bluetooth ACL events) — runs even when the UI is closed.
AppRegistry.registerHeadlessTask('EveryAppMacroTask', () => async (data: any) => {
  try {
    await runMacroTask(data);
  } catch (e: any) {
    console.error('[EveryApp][Macro] FEHLER im Hintergrund-Task:', e?.message, e?.stack);
  }
});

registerRootComponent(App);
