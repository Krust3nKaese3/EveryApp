package expo.modules.backgroundservice

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (!EveryAppBackgroundService.isEnabled(context)) return
    try {
      Log.i(EveryAppBackgroundService.TAG, "[EveryApp] boot ${intent.action}")
      ServiceGate.sync(context, "boot")
      HeadlessStart.event(context, "boot")
    } catch (e: Exception) {
      NativeLog.add(context, "FEHLER Start nach Boot: ${e.javaClass.name}: ${e.message}")
      Log.e(EveryAppBackgroundService.TAG, "[EveryApp] FEHLER: start after boot failed: ${e.message}", e)
    }
  }
}
