package expo.modules.backgroundservice

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Manifest receiver for boot and Bluetooth ACL. Starts a short headless task, not the permanent service. */
class MacroTriggerReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    TriggerDispatch.onReceive(context, intent)
  }
}
