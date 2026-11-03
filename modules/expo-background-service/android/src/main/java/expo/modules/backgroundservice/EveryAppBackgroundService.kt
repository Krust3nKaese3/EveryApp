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
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

class EveryAppBackgroundService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    Log.i(TAG, "[EveryApp] background service start (flags=$flags)")
    createChannel(this)
    try {
      val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE else 0
      ServiceCompat.startForeground(this, NOTIFICATION_ID, createNotification(), type)
    } catch (e: Exception) {
      Log.e(TAG, "[EveryApp] startForeground failed: ${e.message}", e)
      stopSelf()
      return START_NOT_STICKY
    }
    return START_STICKY
  }

  private fun createNotification(): Notification {
    val launchIntent = packageManager.getLaunchIntentForPackage(applicationContext.packageName)
    val pendingIntent = PendingIntent.getActivity(
      this, 0, launchIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("EveryApp aktiv")
      .setContentText("Hintergrund-Makros warten auf Trigger")
      .setSmallIcon(android.R.drawable.ic_menu_compass)
      .setContentIntent(pendingIntent)
      .setOngoing(true)
      .build()
  }

  override fun onDestroy() {
    super.onDestroy()
    Log.i(TAG, "[EveryApp] background service destroyed")
    stopForeground(STOP_FOREGROUND_REMOVE)
  }

  companion object {
    const val TAG = "EveryAppBg"
    const val CHANNEL_ID = "everyapp_background_service"
    const val PREFS = "everyapp_background"
    const val KEY_ENABLED = "enabled"
    private const val NOTIFICATION_ID = 1

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

    fun start(context: Context) {
      createChannel(context)
      val i = Intent(context, EveryAppBackgroundService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(i) else context.startService(i)
    }
  }
}
