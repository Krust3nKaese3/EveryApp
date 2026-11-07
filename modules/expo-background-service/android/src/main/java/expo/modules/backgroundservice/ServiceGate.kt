package expo.modules.backgroundservice

import android.content.Context
import android.content.Intent
import android.os.Build

object ServiceGate {
  fun sync(ctx: Context, source: String) {
    val app = ctx.applicationContext
    val counts = TaskStore.counts(app)
    val running = EveryAppBackgroundService.running
    NativeLog.add(app, ServicePolicy.decisionLine(source, counts, running))
    WifiWatcher.sync(app)
    AlarmScheduler.syncInterval(app)
    BleReconnect.syncAlarms(app)
    if (ServicePolicy.needsForeground(counts)) {
      if (!running) {
        val intent = Intent(app, EveryAppBackgroundService::class.java)
        try {
          if (Build.VERSION.SDK_INT >= 26) app.startForegroundService(intent) else app.startService(intent)
        } catch (e: Throwable) {
          NativeLog.add(app, "FEHLER DIENST START | Quelle: $source | ${e.javaClass.name}: ${e.message}")
        }
      }
    } else if (running) {
      app.stopService(Intent(app, EveryAppBackgroundService::class.java))
    }
  }
}
