package expo.modules.backgroundservice

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Delivered by the Wi-Fi PendingIntent callback and by the debounce alarm. Not exported. */
class WifiCallbackReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    try {
      when (intent.action) {
        WifiWatcher.ACTION_DEBOUNCE -> WifiWatcher.onDebounce(context)
        else -> WifiWatcher.onCallback(context)
      }
    } catch (e: Throwable) {
      NativeLog.add(context, "FEHLER WLAN Callback: ${e.javaClass.name}: ${e.message}")
    }
  }
}
