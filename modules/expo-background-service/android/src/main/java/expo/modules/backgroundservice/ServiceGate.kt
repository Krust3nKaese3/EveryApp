package expo.modules.backgroundservice

import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build

/**
 * Decides whether the long foreground service stays up.
 * It stays for interval timers and for a BLE notify that is connected or due.
 * It does not stay during BLE backoff, after the attempt cap, or for Wi-Fi.
 */
object ServiceGate {
  const val PREFS = "everyapp_runtime"

  data class Snap(
    val interval: Boolean,
    val due: Int,
    val waiting: Int,
    val exhausted: Int,
    val wifi: Boolean,
  )

  fun setNeeds(ctx: Context, interval: Boolean, intervalMs: Long, wifi: Boolean) {
    ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putBoolean("interval", interval)
      .putLong("intervalMs", intervalMs.coerceAtLeast(0L))
      .putBoolean("wifi", wifi)
      .commit()
  }

  fun snapshot(ctx: Context): Snap {
    val app = ctx.applicationContext
    val enabled = EveryAppBackgroundService.isEnabled(app)
    val p = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val ble = if (enabled) bleCounts(app) else intArrayOf(0, 0, 0)
    return Snap(
      interval = enabled && p.getBoolean("interval", false),
      due = ble[0],
      waiting = ble[1],
      exhausted = ble[2],
      wifi = enabled && p.getBoolean("wifi", false),
    )
  }

  fun needed(s: Snap) = s.interval || s.due > 0

  fun line(source: String, s: Snap, running: Boolean): String {
    val reasons = mutableListOf<String>()
    if (s.interval) reasons += "interval"
    if (s.due > 0) reasons += "bleNotify"
    val why = if (reasons.isEmpty()) "Gründe: keine interval-Trigger und kein fälliges/verbundenes bleNotify"
      else "Gründe: ${reasons.joinToString(", ")}"
    val action = when {
      reasons.isNotEmpty() && running -> "DIENST BLEIBT AN"
      reasons.isNotEmpty() -> "DIENST START"
      running -> "DIENST STOPP"
      else -> "DIENST BLEIBT AUS"
    }
    return "$action | $why | interval=${s.interval} bleFälligOderVerbunden=${s.due} bleWartetBackoff=${s.waiting} bleErschöpft=${s.exhausted} wifiWatcher=${if (s.wifi) 1 else 0} (WLAN ohne Vordergrunddienst) | Quelle: $source"
  }

  /** Bitmask for API 29+. Connected-device only while BLE is actually due or connected. */
  fun foregroundType(s: Snap): Int {
    var t = 0
    if (s.interval && Build.VERSION.SDK_INT >= 29) t = t or ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
    if (s.due > 0 && Build.VERSION.SDK_INT >= 29) t = t or ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
    if (t == 0 && Build.VERSION.SDK_INT >= 29) t = ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
    return t
  }

  @Synchronized
  fun sync(ctx: Context, source: String) {
    val app = ctx.applicationContext
    try {
      WifiWatcher.sync(app)
    } catch (e: Throwable) {
      NativeLog.add(app, "FEHLER WLAN sync: ${e.javaClass.name}: ${e.message}")
    }
    val s = snapshot(app)
    val need = needed(s)
    val was = EveryAppBackgroundService.running
    NativeLog.add(app, line(source, s, was))
    if (need && !was) {
      try {
        EveryAppBackgroundService.launch(app)
      } catch (e: Throwable) {
        NativeLog.add(app, "FEHLER DIENST START: ${e.javaClass.name}: ${e.message}")
      }
    } else if (!need && was) {
      try {
        app.stopService(Intent(app, EveryAppBackgroundService::class.java))
      } catch (e: Throwable) {
        NativeLog.add(app, "FEHLER DIENST STOPP: ${e.javaClass.name}: ${e.message}")
      }
    }
  }

  private fun bleCounts(ctx: Context): IntArray {
    return try {
      val k = Class.forName("expo.modules.blegatt.BleManager")
      val inst = k.getField("INSTANCE").get(null)
      val due = k.getMethod("dueCount", Context::class.java).invoke(inst, ctx) as Int
      val wait = k.getMethod("waitingCount", Context::class.java).invoke(inst, ctx) as Int
      val ex = k.getMethod("exhaustedCount", Context::class.java).invoke(inst, ctx) as Int
      intArrayOf(due, wait, ex)
    } catch (_: ClassNotFoundException) {
      intArrayOf(0, 0, 0)
    } catch (e: Exception) {
      NativeLog.add(ctx, "FEHLER BLE-Status: ${e.javaClass.name}: ${e.message}")
      intArrayOf(0, 0, 0)
    }
  }
}
