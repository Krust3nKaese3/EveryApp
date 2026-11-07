package expo.modules.backgroundservice

import android.content.Context
import android.content.Intent
import android.os.Build
import com.facebook.react.HeadlessJsTaskService
import org.json.JSONObject

object BackgroundRuntime {
  const val TASK = "EveryAppBackgroundTask"
  private var lastKey = ""
  private var lastAt = 0L

  fun wake(ctx: Context, event: String, data: Map<String, String>) {
    val json = JSONObject()
    for ((k, v) in data) json.put(k, v)
    val dataJson = json.toString()
    val app = ctx.applicationContext
    val now = System.currentTimeMillis()
    val key = "$event|$dataJson"
    synchronized(this) {
      if (key == lastKey && now - lastAt < 2000) {
        NativeLog.add(app, "HEADLESS ignoriert | doppeltes Ereignis innerhalb 2s | event=$event | data=$dataJson")
        return
      }
      lastKey = key
      lastAt = now
    }
    val intent = Intent(app, EveryAppHeadlessTaskService::class.java).apply {
      putExtra("event", event)
      putExtra("dataJson", dataJson)
    }
    try {
      HeadlessJsTaskService.acquireWakeLockNow(app)
      if (Build.VERSION.SDK_INT >= 26) app.startForegroundService(intent) else app.startService(intent)
      NativeLog.add(app, "HEADLESS START | event=$event | data=$dataJson")
    } catch (e: Throwable) {
      val message = "FEHLER HEADLESS START | event=$event | ${e.javaClass.name}: ${e.message} | data=$dataJson | Event wird für den nächsten App-Start gespeichert"
      NativeLog.add(app, message)
      EventQueue.appendForEnabled(app, event, dataJson)
    }
  }
}
