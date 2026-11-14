package expo.modules.networkinfo

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.Inet4Address

class ExpoNetworkInfoModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoNetworkInfo")

    // {ssid,bssid,rssi,frequency,linkSpeed,ip,error?}. BSSID/SSID need ACCESS_FINE_LOCATION + location on.
    AsyncFunction("getWifi") {
      val ctx = appContext.reactContext ?: throw IllegalStateException("React context not available")
      val out = mutableMapOf<String, Any?>()
      try {
        val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val lp = cm.activeNetwork?.let { cm.getLinkProperties(it) }
        out["ip"] = lp?.linkAddresses?.map { it.address }?.firstOrNull { it is Inet4Address }?.hostAddress
        @Suppress("DEPRECATION")
        val wi = (ctx.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager).connectionInfo
        val ssid = wi?.ssid?.trim('"')?.takeIf { it != "<unknown ssid>" }
        val bssid = wi?.bssid?.takeIf { it != "02:00:00:00:00:00" }
        out["ssid"] = ssid; out["bssid"] = bssid
        out["rssi"] = wi?.rssi; out["frequency"] = wi?.frequency; out["linkSpeed"] = wi?.linkSpeed
        if (ssid == null || bssid == null) out["error"] = "SSID/BSSID unbekannt: Standort-Berechtigung (genau) + Standort an nötig"
      } catch (e: Exception) { out["error"] = "FEHLER WLAN-Info: ${e.message}" }
      out
    }

    AsyncFunction("getInfo") {
      val ctx = appContext.reactContext ?: throw IllegalStateException("React context not available")
      val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
      val net = cm.activeNetwork
      val caps = net?.let { cm.getNetworkCapabilities(it) }
      val lp = net?.let { cm.getLinkProperties(it) }
      val ip = lp?.linkAddresses?.map { it.address }?.firstOrNull { it is Inet4Address }?.hostAddress
      val prefix = lp?.linkAddresses?.firstOrNull { it.address is Inet4Address }?.prefixLength
      val gateway = lp?.routes?.firstOrNull { it.isDefaultRoute && it.gateway is Inet4Address }?.gateway?.hostAddress
      var ssid: String? = null
      var ssidError: String? = null
      try {
        @Suppress("DEPRECATION")
        val wi = (ctx.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager).connectionInfo
        ssid = wi?.ssid?.trim('"')
        if (ssid == null || ssid == "<unknown ssid>") { ssid = null; ssidError = "SSID unbekannt (Standort-Berechtigung + Standort an nötig)" }
      } catch (e: Exception) { ssidError = e.message }
      mapOf(
        "transport" to when {
          caps == null -> "none"
          caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
          caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
          caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
          else -> "other"
        },
        "ssid" to ssid,
        "ssidError" to ssidError,
        "bssid" to try { @Suppress("DEPRECATION") (ctx.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager).connectionInfo?.bssid?.takeIf { it != "02:00:00:00:00:00" } } catch (e: Exception) { null },
        "ip" to ip,
        "prefixLength" to prefix,
        "gateway" to gateway,
        "dns" to (lp?.dnsServers?.mapNotNull { it.hostAddress } ?: emptyList<String>()),
        "interfaceName" to lp?.interfaceName
      )
    }

    // Alle IPv4-Adressen außer Loopback. Die JS-Schicht wählt WLAN vor Hotspot.
    AsyncFunction("getLanCandidates") {
      val out = mutableListOf<Map<String, String>>()
      val ifaces = java.net.NetworkInterface.getNetworkInterfaces()
      if (ifaces != null) {
        while (ifaces.hasMoreElements()) {
          val iface = ifaces.nextElement()
          if (iface.isUp && !iface.isLoopback) {
            val addresses = iface.inetAddresses
            while (addresses.hasMoreElements()) {
              val addr = addresses.nextElement()
              if (addr is Inet4Address && !addr.isLoopbackAddress) {
                val host = addr.hostAddress
                if (host != null) out.add(mapOf("name" to iface.name, "ip" to host))
              }
            }
          }
        }
      }
      out
    }
  }
}
