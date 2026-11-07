package expo.modules.backgroundservice

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build

object AlarmScheduler {
  const val ACTION_INTERVAL = "expo.modules.backgroundservice.INTERVAL"
  const val ACTION_BLE_RETRY = "expo.modules.backgroundservice.BLE_RETRY"
  const val ACTION_WIFI_DEBOUNCE = "expo.modules.backgroundservice.WIFI_DEBOUNCE"

  private fun pending(ctx: Context, action: String, request: Int): PendingIntent {
    val intent = Intent(ctx, InternalTriggerReceiver::class.java).apply { this.action = action }
    return PendingIntent.getBroadcast(
      ctx,
      request,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun schedule(ctx: Context, at: Long, pi: PendingIntent) {
    val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val canExact = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()
    if (canExact) {
      am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
    } else {
      am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
      NativeLog.add(ctx, "ALARM | exakte Alarme nicht erlaubt, setAndAllowWhileIdle um $at")
    }
  }

  private fun alarmPrefs(ctx: Context) =
    ctx.applicationContext.getSharedPreferences("everyapp_alarms", Context.MODE_PRIVATE)

  fun markIntervalFired(ctx: Context) {
    alarmPrefs(ctx).edit().remove("intervalAt").remove("every").apply()
  }

  fun syncInterval(ctx: Context) {
    val pi = pending(ctx, ACTION_INTERVAL, 11)
    val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val every = TaskStore.minIntervalMs(ctx)
    val prefs = alarmPrefs(ctx)
    if (every == null) {
      am.cancel(pi)
      if (prefs.contains("intervalAt")) prefs.edit().remove("intervalAt").remove("every").apply()
      return
    }
    val existing = prefs.getLong("intervalAt", 0L)
    val prevEvery = prefs.getLong("every", -1L)
    val now = System.currentTimeMillis()
    if (existing > now && prevEvery == every) return
    val at = now + every
    schedule(ctx, at, pi)
    prefs.edit().putLong("intervalAt", at).putLong("every", every).apply()
    NativeLog.add(ctx, "INTERVALL GEPLANT | in ${every}ms | Vordergrunddienst bleibt, solange der Trigger registriert ist")
  }

  fun scheduleBle(ctx: Context, at: Long) {
    schedule(ctx, at, pending(ctx, ACTION_BLE_RETRY, 12))
    NativeLog.add(ctx, "BLE ALARM | nächster Versuch um $at | Dienst läuft dazwischen nicht")
  }

  fun cancelBle(ctx: Context) {
    val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    am.cancel(pending(ctx, ACTION_BLE_RETRY, 12))
  }

  fun scheduleWifiDebounce(ctx: Context, at: Long) {
    schedule(ctx, at, pending(ctx, ACTION_WIFI_DEBOUNCE, 13))
  }

  fun cancelWifiDebounce(ctx: Context) {
    val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    am.cancel(pending(ctx, ACTION_WIFI_DEBOUNCE, 13))
  }
}
