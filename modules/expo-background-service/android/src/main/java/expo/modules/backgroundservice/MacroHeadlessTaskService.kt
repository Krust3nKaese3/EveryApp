package expo.modules.backgroundservice

import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/** Runs the generic JS task "EveryAppBackgroundTask" (src/services/BackgroundTasks.ts) - works even if the UI is closed.
 *  Promotes itself to a short foreground service so a background receiver may start it (Android 12+). */
class MacroHeadlessTaskService : HeadlessJsTaskService() {
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    try {
      promote()
    } catch (e: Throwable) {
      NativeLog.add(this, "FEHLER kurzer Headless-Vordergrund: ${e.javaClass.name}: ${e.message}")
      stopSelf()
      return Service.START_NOT_STICKY
    }
    if (intent?.extras == null) {
      NativeLog.add(this, "HEADLESS LEER | Dienst stoppt")
      stopSelf()
      return Service.START_NOT_STICKY
    }
    return super.onStartCommand(intent, flags, startId)
  }

  override fun onDestroy() {
    try { stopForeground(STOP_FOREGROUND_REMOVE) } catch (_: Throwable) {}
    super.onDestroy()
  }

  private fun promote() {
    if (Build.VERSION.SDK_INT < 26) return
    EveryAppBackgroundService.createChannel(this)
    val type = when {
      Build.VERSION.SDK_INT >= 34 -> ServiceInfo.FOREGROUND_SERVICE_TYPE_SHORT_SERVICE
      Build.VERSION.SDK_INT >= 29 -> ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
      else -> 0
    }
    val n = NotificationCompat.Builder(this, EveryAppBackgroundService.CHANNEL_ID)
      .setContentTitle("EveryApp")
      .setContentText("Kurze Hintergrundaktion")
      .setSmallIcon(android.R.drawable.ic_menu_compass)
      .setPriority(NotificationCompat.PRIORITY_MIN)
      .build()
    ServiceCompat.startForeground(this, NOTIFICATION_ID, n, type)
  }

  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    val extras = intent?.extras ?: return null
    return HeadlessJsTaskConfig("EveryAppBackgroundTask", Arguments.fromBundle(extras), 120_000L, true)
  }

  companion object {
    private const val NOTIFICATION_ID = 1002
  }
}
