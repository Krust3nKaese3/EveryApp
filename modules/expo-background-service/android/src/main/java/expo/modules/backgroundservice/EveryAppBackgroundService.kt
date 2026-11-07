package expo.modules.backgroundservice

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * Foreground service only while a mini-app has interval triggers or a due/connected bleNotify
 * subscription. Event triggers use EveryAppHeadlessTaskService and do not keep this service alive.
 * Returns START_STICKY only in the needed case so a kill during an active connection can resume.
 * Backoff explicitly stops this service; AlarmScheduler brings it back for the next attempt.
 */
class EveryAppBackgroundService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    running = true
    val counts = TaskStore.counts(this)
    val needed = ServicePolicy.needsForeground(counts)
    try {
      startForegroundWithType(counts)
    } catch (e: Throwable) {
      NativeLog.add(this, "FEHLER DIENST startForeground | ${e.javaClass.name}: ${e.message}")
      running = false
      stopSelf()
      return START_NOT_STICKY
    }
    if (!needed) {
      NativeLog.add(this, "DIENST STOPP | gestartet ohne Bedarf | ${ServicePolicy.decisionLine("onStartCommand", counts, true)}")
      running = false
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
      return START_NOT_STICKY
    }
    NativeLog.add(this, "DIENST LÄUFT | ${ServicePolicy.reasons(counts).joinToString(", ")} | ${ServicePolicy.decisionLine("onStartCommand", counts, true)}")
    BleReconnect.onServiceStarted(this)
    val after = TaskStore.counts(this)
    if (!ServicePolicy.needsForeground(after)) {
      NativeLog.add(this, "DIENST STOPP | nach Start kein Bedarf mehr | ${ServicePolicy.decisionLine("after-start", after, true)}")
      running = false
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
      return START_NOT_STICKY
    }
    return START_STICKY
  }

  private fun startForegroundWithType(counts: ServicePolicy.Counts) {
    ensureChannel()
    val notification = createNotification(counts)
    if (Build.VERSION.SDK_INT >= 34) {
      var type = 0
      if (counts.intervalCount > 0) type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
      if (counts.dueOrConnectedBle > 0) type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
      if (type == 0) type = ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
      startForeground(NOTIFICATION_ID, notification, type)
    } else if (Build.VERSION.SDK_INT >= 29) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel = NotificationChannel(CHANNEL_ID, "EveryApp Background Service", NotificationManager.IMPORTANCE_LOW).apply {
      description = "Läuft nur bei Intervallen oder aktiven BLE-Benachrichtigungen"
    }
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.createNotificationChannel(channel)
  }

  private fun createNotification(counts: ServicePolicy.Counts): Notification {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
    val pendingIntent = PendingIntent.getActivity(
      this,
      0,
      launchIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val why = ServicePolicy.reasons(counts).ifEmpty { listOf("unbekannt") }.joinToString(", ")
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("EveryApp Hintergrund")
      .setContentText("Aktiv wegen: $why")
      .setSmallIcon(android.R.drawable.ic_menu_compass)
      .setContentIntent(pendingIntent)
      .setOngoing(true)
      .build()
  }

  override fun onDestroy() {
    BleReconnect.onServiceDestroyed()
    running = false
    NativeLog.add(this, "DIENST BEENDET | Prozess muss nicht weiterlaufen, außer ein Alarm oder Ereignis startet ihn neu")
    super.onDestroy()
  }

  companion object {
    const val TAG = "EveryApp"
    const val CHANNEL_ID = "everyapp_background_service"
    private const val NOTIFICATION_ID = 1001

    @Volatile
    var running: Boolean = false
  }
}
