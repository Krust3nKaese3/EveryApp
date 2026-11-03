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
        "ip" to ip,
        "prefixLength" to prefix,
        "gateway" to gateway,
        "dns" to (lp?.dnsServers?.mapNotNull { it.hostAddress } ?: emptyList<String>()),
        "interfaceName" to lp?.interfaceName
      )
    }
  }
}
