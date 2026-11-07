package expo.modules.backgroundservice

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Not exported. Alarms, wifi PendingIntent, and in-app widget triggers. */
class InternalTriggerReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    TriggerDispatch.onReceive(context, intent)
  }
}
