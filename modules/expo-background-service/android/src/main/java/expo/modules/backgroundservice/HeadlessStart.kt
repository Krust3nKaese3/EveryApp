package expo.modules.backgroundservice

import android.content.Context
import android.content.Intent
import android.os.Build
import com.facebook.react.HeadlessJsTaskService

/** Starts the short headless task without the permanent foreground service. */
object HeadlessStart {
  fun start(ctx: Context, intent: Intent) {
    val app = ctx.applicationContext
    HeadlessJsTaskService.acquireWakeLockNow(app)
    if (Build.VERSION.SDK_INT >= 26) app.startForegroundService(intent) else app.startService(intent)
  }

  fun event(ctx: Context, event: String, extras: Map<String, Any?> = emptyMap()) {
    val intent = Intent(ctx, MacroHeadlessTaskService::class.java).apply {
      putExtra("event", event)
      putExtra("time", System.currentTimeMillis().toDouble())
      for ((k, v) in extras) when (v) {
        is String -> putExtra(k, v)
        is Int -> putExtra(k, v.toDouble())
        is Double -> putExtra(k, v)
        is Float -> putExtra(k, v.toDouble())
        is Boolean -> putExtra(k, v)
        null -> {}
        else -> putExtra(k, v.toString())
      }
    }
    start(ctx, intent)
  }
}
