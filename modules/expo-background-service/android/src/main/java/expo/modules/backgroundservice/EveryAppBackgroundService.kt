package expo.modules.backgroundservice

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat

class EveryAppBackgroundService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val notification = createNotification()
    startForeground(NOTIFICATION_ID, notification)
    return START_STICKY
  }

  private fun createNotification(): Notification {
    val packageName = applicationContext.packageName
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
    
    val pendingIntent = PendingIntent.getActivity(
      this,
      0,
      launchIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    return NotificationCompat.Builder(this, ExpoBackgroundServiceModule.CHANNEL_ID)
      .setContentTitle("EveryApp Running")
      .setContentText("Background mini-apps are active")
      .setSmallIcon(android.R.drawable.ic_menu_compass)
      .setContentIntent(pendingIntent)
      .setOngoing(true)
      .build()
  }

  override fun onDestroy() {
    super.onDestroy()
    stopForeground(true)
  }

  companion object {
    private const val NOTIFICATION_ID = 1
  }
}
