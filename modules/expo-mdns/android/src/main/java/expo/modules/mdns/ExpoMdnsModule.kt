package expo.modules.mdns

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Kündigt den schon offenen TCP-Port an und sucht `_everyapp._tcp`.
 * Der TXT-Record kommt fertig aus JS. Dieses Modul setzt kein Token hinein.
 * Die Multicast-Sperre gilt nur, solange Ankündigung oder Suche läuft.
 */
class ExpoMdnsModule : Module() {
  private val main = Handler(Looper.getMainLooper())
  private var registration: NsdManager.RegistrationListener? = null
  private var discovery: NsdManager.DiscoveryListener? = null
  private var lock: WifiManager.MulticastLock? = null
  private val resolvers = mutableListOf<NsdManager.ResolveListener>()

  override fun definition() = ModuleDefinition {
    Name("ExpoMdns")
    Events("services")

    AsyncFunction("publish") { name: String, port: Int, txt: Map<String, String> ->
      val manager = nsd()
      mainRun {
        unpublishNow(manager)
        val info = NsdServiceInfo()
        info.serviceName = name.take(50)
        info.serviceType = "_everyapp._tcp."
        info.port = port
        txt.forEach { (key, value) ->
          if (key.length <= 9) info.setAttribute(key, value)
        }
        val listener = object : NsdManager.RegistrationListener {
          override fun onServiceRegistered(service: NsdServiceInfo) {}
          override fun onRegistrationFailed(service: NsdServiceInfo, code: Int) {}
          override fun onServiceUnregistered(service: NsdServiceInfo) {}
          override fun onUnregistrationFailed(service: NsdServiceInfo, code: Int) {}
        }
        registration = listener
        holdLock(true)
        manager.registerService(info, NsdManager.PROTOCOL_DNS_SD, listener)
      }
    }

    AsyncFunction("unpublish") {
      val manager = nsd()
      mainRun { unpublishNow(manager) }
    }

    AsyncFunction("browse") {
      val manager = nsd()
      mainRun {
        stopBrowseNow(manager)
        val listener = object : NsdManager.DiscoveryListener {
          override fun onStartDiscoveryFailed(type: String, code: Int) {}
          override fun onStopDiscoveryFailed(type: String, code: Int) {}
          override fun onDiscoveryStarted(type: String) {}
          override fun onDiscoveryStopped(type: String) {}
          override fun onServiceFound(service: NsdServiceInfo) {
            val resolver = object : NsdManager.ResolveListener {
              override fun onResolveFailed(info: NsdServiceInfo, code: Int) {}
              override fun onServiceResolved(info: NsdServiceInfo) {
                val host = info.host?.hostAddress ?: return
                val attributes = mutableMapOf<String, String>()
                info.attributes?.forEach { (key, value) ->
                  attributes[key] = value?.toString(Charsets.UTF_8) ?: ""
                }
                sendEvent("services", mapOf(
                  "present" to true,
                  "key" to "${info.serviceName}|$host:${info.port}",
                  "host" to host,
                  "port" to info.port,
                  "txt" to attributes,
                ))
              }
            }
            resolvers.add(resolver)
            manager.resolveService(service, resolver)
          }
          override fun onServiceLost(service: NsdServiceInfo) {
            sendEvent("services", mapOf(
              "present" to false,
              "key" to service.serviceName,
            ))
          }
        }
        discovery = listener
        holdLock(true)
        manager.discoverServices("_everyapp._tcp.", NsdManager.PROTOCOL_DNS_SD, listener)
      }
    }

    AsyncFunction("stopBrowse") {
      val manager = nsd()
      mainRun { stopBrowseNow(manager) }
    }
  }

  private fun nsd(): NsdManager {
    val context = appContext.reactContext ?: throw IllegalStateException("Kontext fehlt")
    return context.getSystemService(Context.NSD_SERVICE) as NsdManager
  }

  private fun mainRun(block: () -> Unit) {
    if (Looper.myLooper() == Looper.getMainLooper()) block()
    else main.post(block)
  }

  private fun unpublishNow(manager: NsdManager) {
    val listener = registration ?: return
    registration = null
    try {
      manager.unregisterService(listener)
    } catch (_: Exception) {
    }
    releaseLockIfIdle()
  }

  private fun stopBrowseNow(manager: NsdManager) {
    val listener = discovery ?: return
    discovery = null
    try {
      manager.stopServiceDiscovery(listener)
    } catch (_: Exception) {
    }
    releaseLockIfIdle()
  }

  private fun holdLock(active: Boolean) {
    if (!active) return
    val context = appContext.reactContext ?: return
    if (lock == null) {
      val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
      lock = wifi.createMulticastLock("everyapp-mdns").apply { setReferenceCounted(false) }
    }
    if (lock?.isHeld != true) lock?.acquire()
  }

  private fun releaseLockIfIdle() {
    if (registration != null || discovery != null) return
    if (lock?.isHeld == true) lock?.release()
  }
}
