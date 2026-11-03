package expo.modules.backgroundservice

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (!EveryAppBackgroundService.isEnabled(context)) return
    try {
      EveryAppBackgroundService.start(context)
      Log.i(EveryAppBackgroundService.TAG, "[EveryApp] background service started after ${intent.action}")
      val task = Intent(context, MacroHeadlessTaskService::class.java).apply {
        putExtra("event", "boot")
        putExtra("time", System.currentTimeMillis().toDouble())
      }
      context.startService(task)
      com.facebook.react.HeadlessJsTaskService.acquireWakeLockNow(context)
    } catch (e: Exception) {
      Log.e(EveryAppBackgroundService.TAG, "[EveryApp] FEHLER: start after boot failed: ${e.message}", e)
    }
  }
}
