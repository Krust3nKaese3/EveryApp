package expo.modules.backgroundservice

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.wifi.WifiInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.util.Log

/**
 * Watches the Wi-Fi access point (BSSID) / SSID while the foreground service lives and fires 'wifiChanged'
 * into the headless engine. Needs ACCESS_FINE_LOCATION (+ ACCESS_BACKGROUND_LOCATION when the app is in background),
 * otherwise Android redacts SSID/BSSID (then nothing fires; logged once).
 */
object WifiWatcher {
  private var cb: ConnectivityManager.NetworkCallback? = null
  private var lastBssid: String? = null
  private var lastSsid: String? = null
  private var warned = false
  private var seeded = false

  fun start(ctx: Context) {
    if (cb != null) return
    val app = ctx.applicationContext
    val cm = app.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    val req = NetworkRequest.Builder().addTransportType(NetworkCapabilities.TRANSPORT_WIFI).build()
    val callback = if (Build.VERSION.SDK_INT >= 31) object : ConnectivityManager.NetworkCallback(FLAG_INCLUDE_LOCATION_INFO) {
      override fun onCapabilitiesChanged(n: Network, caps: NetworkCapabilities) { handle(app, caps.transportInfo as? WifiInfo) }
      override fun onLost(n: Network) { handle(app, null) }
    } else object : ConnectivityManager.NetworkCallback() {
      override fun onCapabilitiesChanged(n: Network, caps: NetworkCapabilities) {
        @Suppress("DEPRECATION") handle(app, (app.getSystemService(Context.WIFI_SERVICE) as WifiManager).connectionInfo)
      }
      override fun onLost(n: Network) { handle(app, null) }
    }
    try { cm.registerNetworkCallback(req, callback); cb = callback; Log.i(UiStore.TAG, "[EveryApp] WifiWatcher aktiv") }
    catch (e: Exception) { Log.e(UiStore.TAG, "[EveryApp] FEHLER WifiWatcher: ${e.message}", e) }
  }

  fun stop(ctx: Context) {
    val c = cb ?: return
    try { (ctx.applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager).unregisterNetworkCallback(c) } catch (_: Exception) {}
    cb = null
  }

  @Synchronized private fun handle(ctx: Context, wi: WifiInfo?) {
    val bssid = wi?.bssid?.takeIf { it != "02:00:00:00:00:00" }?.lowercase()
    val ssid = wi?.ssid?.trim('"')?.takeIf { it != "<unknown ssid>" }
    if (wi != null && bssid == null) {
      if (!warned) { warned = true; Log.w(UiStore.TAG, "[EveryApp] FEHLER wifiChanged: BSSID verborgen – Standort 'immer erlauben' + Standort an nötig") }
      return
    }
    if (bssid == lastBssid && ssid == lastSsid) return
    val prevB = lastBssid; val prevS = lastSsid
    lastBssid = bssid; lastSsid = ssid
    if (!seeded) { seeded = true; return } // first observation after service start: just remember
    UiStore.fire(ctx, "wifiChanged", mapOf("bssid" to bssid, "ssid" to ssid, "rssi" to wi?.rssi,
      "frequency" to wi?.frequency, "prevBssid" to prevB, "prevSsid" to prevS))
  }
}
