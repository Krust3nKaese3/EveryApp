package expo.modules.backgroundservice

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.wifi.WifiInfo
import android.net.wifi.WifiManager
import android.os.Build
import org.json.JSONObject

/**
 * Wi-Fi changes via ConnectivityManager.registerNetworkCallback(request, PendingIntent).
 * The callback survives process death and does not need the foreground service.
 * Debounce and the last SSID/BSSID live in prefs so a dead process cannot double-fire.
 * The first sample is stored and not emitted (same as the old in-process watcher).
 */
object WifiWatcher {
  const val ACTION_CALLBACK = "expo.modules.backgroundservice.WIFI_CB"
  const val ACTION_DEBOUNCE = "expo.modules.backgroundservice.WIFI_DEBOUNCE"
  private const val PREFS = "everyapp_wifi"
  private const val DEBOUNCE_MS = 30_000L
  @Volatile private var registered = false

  fun sync(ctx: Context) {
    val app = ctx.applicationContext
    val want = EveryAppBackgroundService.isEnabled(app) &&
      app.getSharedPreferences(ServiceGate.PREFS, Context.MODE_PRIVATE).getBoolean("wifi", false)
    val cm = app.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    val pi = callbackPi(app)
    if (!want) {
      if (registered) {
        try { cm.unregisterNetworkCallback(pi) } catch (_: Exception) {}
        registered = false
      }
      cancelAlarm(app)
      return
    }
    if (registered) return
    val req = NetworkRequest.Builder().addTransportType(NetworkCapabilities.TRANSPORT_WIFI).build()
    try {
      cm.registerNetworkCallback(req, pi)
      registered = true
      NativeLog.add(app, "WLAN NetworkCallback registriert (PendingIntent, ohne Vordergrunddienst)")
    } catch (e: Exception) {
      registered = false
      NativeLog.add(app, "FEHLER WLAN NetworkCallback: ${e.javaClass.name}: ${e.message}")
    }
  }

  fun onCallback(ctx: Context) {
    val app = ctx.applicationContext
    if (!EveryAppBackgroundService.isEnabled(app)) return
    handle(app, currentWifi(app))
  }

  fun onDebounce(ctx: Context) {
    val app = ctx.applicationContext
    if (!EveryAppBackgroundService.isEnabled(app)) return
    val st = load(app)
    if (!st.pending) return
    if (st.seenSsid == st.emSsid && st.seenBssid == st.emBssid) {
      save(app, st.copy(pending = false)); return
    }
    val now = System.currentTimeMillis()
    if (st.lastEmit != 0L && now - st.lastEmit < DEBOUNCE_MS) {
      schedule(app, st.lastEmit + DEBOUNCE_MS); return
    }
    emit(app, st, st.seenSsid, st.seenBssid, currentWifi(app), now)
  }

  @Synchronized
  private fun handle(app: Context, wi: WifiInfo?) {
    val bssid = wi?.bssid?.takeIf { it != "02:00:00:00:00:00" }?.lowercase()
    val ssid = wi?.ssid?.trim('"')?.takeIf { it.isNotEmpty() && it != "<unknown ssid>" }
    var st = load(app)
    if (wi != null && bssid == null) {
      if (!st.warned) {
        st = st.copy(warned = true)
        save(app, st)
        NativeLog.add(app, "FEHLER wifiChanged: BSSID verborgen – Standort 'immer erlauben' + Standort an nötig")
      }
      return
    }
    if (!st.hasSeen) {
      save(app, st.copy(hasSeen = true, seenSsid = ssid, seenBssid = bssid, emSsid = ssid, emBssid = bssid, pending = false, dupLogged = false))
      NativeLog.add(app, "WLAN Baseline ${ssid ?: "null"}/${bssid ?: "null"}, kein Event")
      return
    }
    if (st.seenBssid == bssid && st.seenSsid == ssid) {
      if (!st.dupLogged) {
        save(app, st.copy(dupLogged = true))
        NativeLog.add(app, "WLAN ignoriert | SSID/BSSID unverändert ${ssid ?: "null"}/${bssid ?: "null"} | doppelter Callback, kein Event")
      }
      return
    }
    st = st.copy(seenSsid = ssid, seenBssid = bssid, dupLogged = false)
    if (st.emBssid == bssid && st.emSsid == ssid) {
      save(app, st.copy(pending = false))
      NativeLog.add(app, "WLAN ignoriert | wieder ${ssid ?: "null"}/${bssid ?: "null"}, identisch zum letzten Event")
      return
    }
    val now = System.currentTimeMillis()
    if (st.lastEmit != 0L && now - st.lastEmit < DEBOUNCE_MS) {
      save(app, st.copy(pending = true))
      schedule(app, st.lastEmit + DEBOUNCE_MS)
      NativeLog.add(app, "WLAN gedrosselt | geändert auf ${ssid ?: "null"}/${bssid ?: "null"} | Debounce ${DEBOUNCE_MS}ms")
      return
    }
    emit(app, st, ssid, bssid, wi, now)
  }

  private fun emit(app: Context, st: State, ssid: String?, bssid: String?, wi: WifiInfo?, now: Long) {
    val prevS = st.emSsid
    val prevB = st.emBssid
    save(app, st.copy(seenSsid = ssid, seenBssid = bssid, emSsid = ssid, emBssid = bssid, lastEmit = now, pending = false, dupLogged = false))
    NativeLog.add(app, "WLAN Event | SSID/BSSID geändert -> ${ssid ?: "null"}/${bssid ?: "null"}")
    UiStore.fire(app, "wifiChanged", mapOf(
      "bssid" to bssid, "ssid" to ssid, "rssi" to wi?.rssi, "frequency" to wi?.frequency,
      "prevBssid" to prevB, "prevSsid" to prevS,
    ))
  }

  private fun currentWifi(app: Context): WifiInfo? {
    val cm = app.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    val caps = cm.activeNetwork?.let { cm.getNetworkCapabilities(it) } ?: return null
    if (!caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) return null
    if (Build.VERSION.SDK_INT >= 29) {
      val info = caps.transportInfo
      if (info is WifiInfo) return info
    }
    @Suppress("DEPRECATION")
    return (app.getSystemService(Context.WIFI_SERVICE) as WifiManager).connectionInfo
  }

  private fun callbackPi(app: Context): PendingIntent {
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or
      (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
    val i = Intent(app, WifiCallbackReceiver::class.java).setAction(ACTION_CALLBACK)
    return PendingIntent.getBroadcast(app, 21, i, flags)
  }

  private fun alarmPi(app: Context): PendingIntent {
    val i = Intent(app, WifiCallbackReceiver::class.java).setAction(ACTION_DEBOUNCE)
    return PendingIntent.getBroadcast(app, 13, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  private fun schedule(app: Context, at: Long) {
    val am = app.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val pi = alarmPi(app)
    try {
      val exact = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()
      if (exact && Build.VERSION.SDK_INT >= 23) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
      else if (Build.VERSION.SDK_INT >= 23) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
      else am.set(AlarmManager.RTC_WAKEUP, at, pi)
    } catch (e: Throwable) {
      try { am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi) } catch (e2: Throwable) {
        NativeLog.add(app, "FEHLER WLAN Debounce-Alarm: ${e2.javaClass.name}: ${e2.message}")
      }
    }
  }

  private fun cancelAlarm(app: Context) {
    val am = app.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    try { am.cancel(alarmPi(app)) } catch (_: Exception) {}
  }

  private data class State(
    val hasSeen: Boolean, val seenSsid: String?, val seenBssid: String?,
    val emSsid: String?, val emBssid: String?, val lastEmit: Long,
    val pending: Boolean, val warned: Boolean, val dupLogged: Boolean,
  )

  private fun load(app: Context): State {
    val o = try { JSONObject(app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("state", "{}")) } catch (_: Exception) { JSONObject() }
    return State(
      o.optBoolean("hasSeen"),
      o.optString("seenSsid").ifEmpty { null },
      o.optString("seenBssid").ifEmpty { null },
      o.optString("emSsid").ifEmpty { null },
      o.optString("emBssid").ifEmpty { null },
      o.optLong("lastEmit"),
      o.optBoolean("pending"),
      o.optBoolean("warned"),
      o.optBoolean("dupLogged"),
    )
  }

  private fun save(app: Context, s: State) {
    val o = JSONObject()
      .put("hasSeen", s.hasSeen)
      .put("seenSsid", s.seenSsid ?: "")
      .put("seenBssid", s.seenBssid ?: "")
      .put("emSsid", s.emSsid ?: "")
      .put("emBssid", s.emBssid ?: "")
      .put("lastEmit", s.lastEmit)
      .put("pending", s.pending)
      .put("warned", s.warned)
      .put("dupLogged", s.dupLogged)
    app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("state", o.toString()).commit()
  }
}
