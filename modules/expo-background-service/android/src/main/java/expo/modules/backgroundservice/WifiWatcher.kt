package expo.modules.backgroundservice

import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.wifi.WifiInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.app.PendingIntent
import org.json.JSONObject

/**
 * SSID/BSSID changes via ConnectivityManager.registerNetworkCallback(request, PendingIntent).
 * No foreground service. Duplicate callbacks are ignored. Real changes are debounced (30s).
 * Logic matches decideWifi / decideWifiAlarm in src/services/backgroundPolicy.ts.
 */
object WifiWatcher {
  const val ACTION_WIFI = "expo.modules.backgroundservice.WIFI"
  private const val PREFS = "everyapp_wifi"

  private fun prefs(ctx: Context) = ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private fun pending(ctx: Context): PendingIntent {
    val intent = Intent(ctx, InternalTriggerReceiver::class.java).apply { action = ACTION_WIFI }
    return PendingIntent.getBroadcast(
      ctx,
      21,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  fun onBoot(ctx: Context) {
    prefs(ctx).edit().putBoolean("registered", false).apply()
  }

  fun sync(ctx: Context) {
    val want = TaskStore.wifiCount(ctx) > 0
    val remembered = prefs(ctx).getBoolean("registered", false)
    val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    val pi = pending(ctx)
    if (!want) {
      if (!remembered) return
      try {
        cm.unregisterNetworkCallback(pi)
      } catch (_: Exception) {
      }
      prefs(ctx).edit().putBoolean("registered", false).apply()
      AlarmScheduler.cancelWifiDebounce(ctx)
      NativeLog.add(ctx, "WLAN AUS | kein wifiChanged-Trigger | kein Vordergrunddienst")
      return
    }
    if (remembered) return
    if (Build.VERSION.SDK_INT < 26) {
      prefs(ctx).edit().putBoolean("registered", true).apply()
      NativeLog.add(ctx, "FEHLER WLAN | registerNetworkCallback(PendingIntent) braucht API 26 | kein Vordergrunddienst gestartet")
      return
    }
    val request = NetworkRequest.Builder().addTransportType(NetworkCapabilities.TRANSPORT_WIFI).build()
    try {
      cm.registerNetworkCallback(request, pi)
      prefs(ctx).edit().putBoolean("registered", true).apply()
      NativeLog.add(ctx, "WLAN AN | NetworkCallback per PendingIntent | kein Vordergrunddienst")
    } catch (e: Exception) {
      prefs(ctx).edit().putBoolean("registered", true).apply()
      NativeLog.add(ctx, "WLAN | registerNetworkCallback: ${e.javaClass.name}: ${e.message} | behandle als bereits registriert, kein Vordergrunddienst")
    }
  }

  fun onCallback(ctx: Context) {
    apply(ctx, readIdentity(ctx), alarm = false)
  }

  fun onDebounceAlarm(ctx: Context) {
    apply(ctx, null, alarm = true)
  }

  private data class Id(val ssid: String?, val bssid: String?)

  private data class State(
    val hasSeen: Boolean,
    val seen: Id,
    val emitted: Id,
    val lastEmitAt: Long,
    val pending: Boolean,
  )

  private fun load(ctx: Context): State {
    val o = try {
      JSONObject(prefs(ctx).getString("state", "{}") ?: "{}")
    } catch (_: Exception) {
      JSONObject()
    }
    return State(
      hasSeen = o.optBoolean("hasSeen"),
      seen = Id(o.optString("seenSsid").ifEmpty { null }, o.optString("seenBssid").ifEmpty { null }),
      emitted = Id(o.optString("emittedSsid").ifEmpty { null }, o.optString("emittedBssid").ifEmpty { null }),
      lastEmitAt = o.optLong("lastEmitAt"),
      pending = o.optBoolean("pending"),
    )
  }

  private fun save(ctx: Context, state: State) {
    val o = JSONObject()
      .put("hasSeen", state.hasSeen)
      .put("seenSsid", state.seen.ssid ?: "")
      .put("seenBssid", state.seen.bssid ?: "")
      .put("emittedSsid", state.emitted.ssid ?: "")
      .put("emittedBssid", state.emitted.bssid ?: "")
      .put("lastEmitAt", state.lastEmitAt)
      .put("pending", state.pending)
    prefs(ctx).edit().putString("state", o.toString()).commit()
  }

  private fun same(a: Id, b: Id) = a.ssid == b.ssid && a.bssid == b.bssid
  private fun label(id: Id) = "${id.ssid ?: "null"}/${id.bssid ?: "null"}"

  private fun apply(ctx: Context, next: Id?, alarm: Boolean) {
    if (TaskStore.wifiCount(ctx) == 0) return
    val now = System.currentTimeMillis()
    val state = load(ctx)
    if (alarm) {
      if (!state.pending) {
        NativeLog.add(ctx, "WLAN Alarm ohne ausstehendes Event")
        return
      }
      if (same(state.seen, state.emitted)) {
        save(ctx, state.copy(pending = false))
        NativeLog.add(ctx, "WLAN Alarm | nichts mehr geändert")
        return
      }
      if (state.lastEmitAt != 0L && now - state.lastEmitAt < ServicePolicy.WIFI_DEBOUNCE_MS) {
        val at = state.lastEmitAt + ServicePolicy.WIFI_DEBOUNCE_MS
        AlarmScheduler.scheduleWifiDebounce(ctx, at)
        NativeLog.add(ctx, "WLAN Alarm zu früh, erneut planen")
        return
      }
      val emitted = state.copy(emitted = state.seen, lastEmitAt = now, pending = false)
      save(ctx, emitted)
      NativeLog.add(ctx, "WLAN Event nach Debounce | SSID/BSSID -> ${label(state.seen)}")
      BackgroundRuntime.wake(ctx, "wifiChanged", mapOf("ssid" to (state.seen.ssid ?: ""), "bssid" to (state.seen.bssid ?: "")))
      return
    }
    val id = next ?: Id(null, null)
    if (!state.hasSeen) {
      val seeded = state.copy(hasSeen = true, seen = id)
      if (id.ssid == null && id.bssid == null) {
        save(ctx, seeded)
        NativeLog.add(ctx, "WLAN Baseline ohne SSID/BSSID, kein Event")
        return
      }
      save(ctx, seeded.copy(emitted = id, lastEmitAt = now, pending = false))
      NativeLog.add(ctx, "WLAN erste SSID/BSSID ${label(id)}")
      BackgroundRuntime.wake(ctx, "wifiChanged", mapOf("ssid" to (id.ssid ?: ""), "bssid" to (id.bssid ?: "")))
      return
    }
    if (same(state.seen, id)) {
      val p = prefs(ctx)
      if (!p.getBoolean("dupLogged", false)) {
        NativeLog.add(ctx, "WLAN ignoriert | SSID/BSSID unverändert ${label(id)} | doppelter Callback, kein Event")
        p.edit().putBoolean("dupLogged", true).apply()
      }
      return
    }
    prefs(ctx).edit().putBoolean("dupLogged", false).apply()
    val seenState = state.copy(seen = id)
    if (same(state.emitted, id) && state.lastEmitAt != 0L) {
      save(ctx, seenState.copy(pending = false))
      AlarmScheduler.cancelWifiDebounce(ctx)
      NativeLog.add(ctx, "WLAN ignoriert | wieder ${label(id)}, identisch zum letzten Event")
      return
    }
    if (state.lastEmitAt != 0L && now - state.lastEmitAt < ServicePolicy.WIFI_DEBOUNCE_MS) {
      save(ctx, seenState.copy(pending = true))
      val at = state.lastEmitAt + ServicePolicy.WIFI_DEBOUNCE_MS
      AlarmScheduler.scheduleWifiDebounce(ctx, at)
      NativeLog.add(ctx, "WLAN gedrosselt | geändert auf ${label(id)} | Debounce ${ServicePolicy.WIFI_DEBOUNCE_MS}ms")
      return
    }
    save(ctx, seenState.copy(emitted = id, lastEmitAt = now, pending = false))
    NativeLog.add(ctx, "WLAN Event | SSID/BSSID geändert -> ${label(id)}")
    BackgroundRuntime.wake(ctx, "wifiChanged", mapOf("ssid" to (id.ssid ?: ""), "bssid" to (id.bssid ?: "")))
  }

  private fun readIdentity(ctx: Context): Id {
    try {
      val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
      val network = cm.activeNetwork
      val caps = network?.let { cm.getNetworkCapabilities(it) }
      if (caps == null || !caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
        return Id(null, null)
      }
      if (Build.VERSION.SDK_INT >= 29 && caps.transportInfo is WifiInfo) {
        val info = caps.transportInfo as WifiInfo
        return clean(info.ssid, info.bssid)
      }
      val wm = ctx.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
      @Suppress("DEPRECATION")
      val info = wm.connectionInfo
      return clean(info?.ssid, info?.bssid)
    } catch (e: Throwable) {
      NativeLog.add(ctx, "FEHLER WLAN lesen: ${e.javaClass.name}: ${e.message}")
      return Id(null, null)
    }
  }

  private fun clean(ssid: String?, bssid: String?): Id {
    val s = ssid?.trim('"')?.takeIf { it.isNotBlank() && it != "<unknown ssid>" }
    val b = bssid?.takeIf { it.isNotBlank() && it != "02:00:00:00:00:00" }
    return Id(s, b)
  }
}
