package expo.modules.backgroundservice

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoBackgroundServiceModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoBackgroundService")

    AsyncFunction("startService") { promise: Promise ->
      try {
        val context = appContext.reactContext ?: run {
          promise.reject("NO_CONTEXT", "React context not available", null)
          return@AsyncFunction
        }

        createNotificationChannel(context)

        val serviceIntent = Intent(context, EveryAppBackgroundService::class.java)
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          context.startForegroundService(serviceIntent)
        } else {
          context.startService(serviceIntent)
        }

        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("START_SERVICE_FAILED", e.message, e)
      }
    }

    AsyncFunction("stopService") { promise: Promise ->
      try {
        val context = appContext.reactContext ?: run {
          promise.reject("NO_CONTEXT", "React context not available", null)
          return@AsyncFunction
        }

        val serviceIntent = Intent(context, EveryAppBackgroundService::class.java)
        context.stopService(serviceIntent)

        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("STOP_SERVICE_FAILED", e.message, e)
      }
    }
  }

  private fun createNotificationChannel(context: Context) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "EveryApp Background Service",
        NotificationManager.IMPORTANCE_LOW
      ).apply {
        description = "Keeps mini-apps running in the background"
      }

      val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      notificationManager.createNotificationChannel(channel)
    }
  }

  companion object {
    const val CHANNEL_ID = "everyapp_background_service"
  }
}
