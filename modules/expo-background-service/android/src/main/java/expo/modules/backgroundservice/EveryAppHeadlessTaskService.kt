package expo.modules.backgroundservice

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * Short-lived entry for boot, Bluetooth, tiles, widgets, wifi and interval ticks.
 * Promoted to a shortService foreground service so Android 14+ allows the start from
 * a broadcast, then stopped when the JS task finishes so the process can die.
 */
class EveryAppHeadlessTaskService : HeadlessJsTaskService() {
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    try {
      promote()
    } catch (e: Throwable) {
      NativeLog.add(this, "FEHLER Headless-Vordergrund (kurz): ${e.javaClass.name}: ${e.message}")
    }
    val config = getTaskConfig(intent)
    if (config == null) {
      NativeLog.add(this, "HEADLESS LEER | kein Task im Intent, Dienst stoppt sofort")
      stopSelf()
      return START_NOT_STICKY
    }
    return super.onStartCommand(intent, flags, startId)
  }

  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    val event = intent?.getStringExtra("event") ?: return null
    val map = Arguments.createMap()
    map.putString("event", event)
    map.putString("dataJson", intent.getStringExtra("dataJson") ?: "{}")
    return HeadlessJsTaskConfig(BackgroundRuntime.TASK, map, 30_000, true)
  }

  override fun onDestroy() {
    try {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } catch (_: Throwable) {
    }
    super.onDestroy()
    NativeLog.add(this, "HEADLESS ENDE | Prozess darf danach beendet werden")
  }

  private fun promote() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(CHANNEL, "EveryApp Ereignisse", NotificationManager.IMPORTANCE_MIN).apply {
        description = "Kurze Hintergrundaktion, endet von selbst"
        setShowBadge(false)
      }
      val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      manager.createNotificationChannel(channel)
    }
    val notification = NotificationCompat.Builder(this, CHANNEL)
      .setContentTitle("EveryApp")
      .setContentText("Kurze Hintergrundaktion")
      .setSmallIcon(android.R.drawable.ic_menu_compass)
      .setPriority(NotificationCompat.PRIORITY_MIN)
      .setOngoing(false)
      .build()
    if (Build.VERSION.SDK_INT >= 34) {
      startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SHORT_SERVICE)
    } else if (Build.VERSION.SDK_INT >= 29) {
      startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
    } else {
      startForeground(NOTIF_ID, notification)
    }
  }

  companion object {
    private const val CHANNEL = "everyapp_background_transient"
    private const val NOTIF_ID = 1002
  }
}
