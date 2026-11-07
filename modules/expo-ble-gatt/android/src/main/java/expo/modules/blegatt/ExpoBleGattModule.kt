package expo.modules.blegatt

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoBleGattModule : Module() {
  private fun ctx() = appContext.reactContext ?: throw IllegalStateException("React context not available")

  private fun bytes(hex: String): ByteArray {
    val h = hex.replace(Regex("[^0-9a-fA-F]"), "")
    if (h.length % 2 != 0) throw IllegalArgumentException("Hex-String hat ungerade Länge: $hex")
    return ByteArray(h.length / 2) { h.substring(it * 2, it * 2 + 2).toInt(16).toByte() }
  }

  override fun definition() = ModuleDefinition {
    Name("ExpoBleGatt")
    Events("bleNotify", "bleDisconnected")

    OnCreate { BleManager.listener = { m -> try { sendEvent(m["event"] as String, m) } catch (_: Exception) {} } }
    OnDestroy { BleManager.listener = null }

    AsyncFunction("scan") { durationMs: Double, namePrefix: String? -> BleManager.scan(ctx(), durationMs.toLong(), namePrefix) }
    AsyncFunction("connect") { address: String, timeoutMs: Double -> BleManager.connect(ctx(), address, timeoutMs.toLong()) }
    AsyncFunction("disconnect") { address: String -> BleManager.disconnect(address); true }
    Function("connected") { BleManager.connectedAddresses() }
    Function("subscriptions") { BleManager.subscriptions(ctx()) }
    // data as hex string (JS converts arrays)
    AsyncFunction("write") { address: String, svc: String, chr: String, hex: String, withResponse: Boolean?, timeoutMs: Double ->
      BleManager.write(ctx(), address, svc, chr, bytes(hex), withResponse, timeoutMs.toLong())
    }
    AsyncFunction("read") { address: String, svc: String, chr: String, timeoutMs: Double ->
      BleManager.hex(BleManager.read(ctx(), address, svc, chr, timeoutMs.toLong()))
    }
    AsyncFunction("notify") { address: String, svc: String, chr: String, enable: Boolean, timeoutMs: Double ->
      BleManager.notify(ctx(), address, svc, chr, enable, timeoutMs.toLong())
    }
  }
}
