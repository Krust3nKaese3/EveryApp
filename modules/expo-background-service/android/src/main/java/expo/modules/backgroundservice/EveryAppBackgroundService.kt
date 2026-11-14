package expo.modules.backgroundservice

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

class EveryAppBackgroundService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val snap = ServiceGate.snapshot(this)
    if (!ServiceGate.needed(snap)) {
      NativeLog.add(this, ServiceGate.line("onStart-unnötig", snap, false))
      running = false
      stopSelf()
      return START_NOT_STICKY
    }
    Log.i(TAG, "[EveryApp] background service start (flags=$flags)")
    createChannel(this)
    try {
      val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceGate.foregroundType(snap) else 0
      ServiceCompat.startForeground(this, NOTIFICATION_ID, createNotification(snap), type)
    } catch (e: Exception) {
      NativeLog.add(this, "FEHLER startForeground: ${e.javaClass.name}: ${e.message}")
      Log.e(TAG, "[EveryApp] startForeground failed: ${e.message}", e)
      running = false
      stopSelf()
      return START_NOT_STICKY
    }
    running = true
    // BLE notify subscriptions (expo-ble-gatt, optional module) – via reflection to avoid a hard module dependency
    try {
      val k = Class.forName("expo.modules.blegatt.BleManager")
      k.getMethod("restoreSubscriptions", Context::class.java, String::class.java).invoke(k.getField("INSTANCE").get(null), this, null)
    } catch (_: ClassNotFoundException) {} catch (e: Exception) {
      NativeLog.add(this, "FEHLER BLE-Restore: ${e.javaClass.name}: ${e.message}")
    }
    if (snap.interval) {
      try { HeadlessStart.event(this, "keepalive") } catch (e: Throwable) {
        NativeLog.add(this, "FEHLER keepalive: ${e.javaClass.name}: ${e.message}")
      }
    }
    return START_STICKY
  }

  private fun createNotification(snap: ServiceGate.Snap): Notification {
    val reasons = mutableListOf<String>()
    if (snap.interval) reasons += "Intervall"
    if (snap.due > 0) reasons += "BLE"
    if (snap.hosting) reasons += "Spielraum"
    val launchIntent = packageManager.getLaunchIntentForPackage(applicationContext.packageName)
    val pendingIntent = PendingIntent.getActivity(
      this, 0, launchIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("EveryApp aktiv")
      .setContentText(if (reasons.isEmpty()) "Hintergrund-Makros" else reasons.joinToString(", "))
      .setSmallIcon(android.R.drawable.ic_menu_compass)
      .setContentIntent(pendingIntent)
      .setOngoing(true)
      .build()
  }

  override fun onDestroy() {
    running = false
    NativeLog.add(this, "DIENST BEENDET | Vordergrunddienst gestoppt")
    Log.i(TAG, "[EveryApp] background service destroyed")
    stopForeground(STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }

  companion object {
    const val TAG = "EveryAppBg"
    const val CHANNEL_ID = "everyapp_background_service"
    const val PREFS = "everyapp_background"
    const val KEY_ENABLED = "enabled"
    private const val NOTIFICATION_ID = 1
    @Volatile var running = false

    fun createChannel(context: Context) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val channel = NotificationChannel(CHANNEL_ID, "EveryApp Hintergrund", NotificationManager.IMPORTANCE_LOW)
        channel.description = "Hält Hintergrund-Makros aktiv"
        (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(channel)
      }
    }

    fun isEnabled(context: Context): Boolean =
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_ENABLED, false)

    fun setEnabled(context: Context, enabled: Boolean) {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_ENABLED, enabled).apply()
    }

    /** Called only by ServiceGate when interval or a due/connected bleNotify needs the process. */
    fun launch(context: Context) {
      createChannel(context)
      val i = Intent(context, EveryAppBackgroundService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(i) else context.startService(i)
    }
  }
}
