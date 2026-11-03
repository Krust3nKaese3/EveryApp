package expo.modules.blegatt

import android.annotation.SuppressLint
import android.bluetooth.*
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.locks.ReentrantLock

/**
 * Process-wide BLE GATT manager: works from UI and headless JS alike (no Activity needed).
 * One connection per address (reused), ops serialized per connection (Android allows only one outstanding GATT op).
 */
@SuppressLint("MissingPermission")
object BleManager {
  const val TAG = "EveryAppBle"
  private val CCCD = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
  var listener: ((Map<String, Any?>) -> Unit)? = null

  class Conn(val address: String) {
    var gatt: BluetoothGatt? = null
    val lock = ReentrantLock()
    @Volatile var connected = false
    @Volatile var servicesReady = false
    @Volatile var latch: CountDownLatch? = null
    @Volatile var status = 0
    @Volatile var value: ByteArray? = null
    @Volatile var lastUsed = System.currentTimeMillis()
  }

  private val conns = ConcurrentHashMap<String, Conn>()
  private lateinit var app: Context

  private fun adapter(ctx: Context): BluetoothAdapter {
    app = ctx.applicationContext
    val a = (app.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter
      ?: throw IllegalStateException("Kein Bluetooth-Adapter")
    if (!a.isEnabled) throw IllegalStateException("Bluetooth ist aus")
    return a
  }

  fun hex(b: ByteArray?) = b?.joinToString("") { "%02x".format(it) }

  // ---------- scan ----------
  fun scan(ctx: Context, durationMs: Long, namePrefix: String?): List<Map<String, Any?>> {
    val sc = adapter(ctx).bluetoothLeScanner ?: throw IllegalStateException("BLE-Scanner nicht verfügbar")
    val found = ConcurrentHashMap<String, Map<String, Any?>>()
    var err: String? = null
    val cb = object : ScanCallback() {
      override fun onScanResult(type: Int, r: ScanResult) {
        val name = r.scanRecord?.deviceName ?: try { r.device.name } catch (e: Exception) { null }
        if (namePrefix != null && !(name ?: "").lowercase().startsWith(namePrefix.lowercase())) return
        found[r.device.address] = mapOf(
          "address" to r.device.address, "name" to name, "rssi" to r.rssi,
          "serviceUuids" to (r.scanRecord?.serviceUuids?.map { it.uuid.toString() } ?: emptyList<String>()),
          "manufacturerData" to r.scanRecord?.manufacturerSpecificData?.let { m -> (0 until m.size()).associate { i -> m.keyAt(i).toString() to hex(m.valueAt(i)) } },
          "connectable" to (if (Build.VERSION.SDK_INT >= 26) r.isConnectable else null))
      }
      override fun onScanFailed(code: Int) { err = "Scan fehlgeschlagen (Code $code)" }
    }
    sc.startScan(null, ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(), cb)
    Thread.sleep(durationMs.coerceIn(500, 30000))
    try { sc.stopScan(cb) } catch (_: Exception) {}
    err?.let { throw IllegalStateException(it) }
    return found.values.sortedByDescending { (it["rssi"] as Int?) ?: -999 }
  }

  // ---------- gatt callback ----------
  private val callback = object : BluetoothGattCallback() {
    override fun onConnectionStateChange(g: BluetoothGatt, status: Int, newState: Int) {
      val c = conns[g.device.address] ?: return
      Log.i(TAG, "[EveryApp] BLE ${g.device.address} state=$newState status=$status")
      if (newState == BluetoothProfile.STATE_CONNECTED && status == BluetoothGatt.GATT_SUCCESS) {
        c.connected = true
        if (!g.discoverServices()) { c.status = -2; c.latch?.countDown() }
      } else {
        c.connected = false; c.servicesReady = false; c.status = if (status == 0) -1 else status
        try { g.close() } catch (_: Exception) {}
        c.gatt = null
        c.latch?.countDown()
        listener?.invoke(mapOf("event" to "bleDisconnected", "address" to g.device.address, "status" to status))
      }
    }
    override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {
      val c = conns[g.device.address] ?: return
      c.servicesReady = status == BluetoothGatt.GATT_SUCCESS; c.status = status; c.latch?.countDown()
    }
    override fun onCharacteristicWrite(g: BluetoothGatt, ch: BluetoothGattCharacteristic, status: Int) { done(g, status, null) }
    @Deprecated("old api") override fun onCharacteristicRead(g: BluetoothGatt, ch: BluetoothGattCharacteristic, status: Int) {
      @Suppress("DEPRECATION") done(g, status, ch.value)
    }
    override fun onCharacteristicRead(g: BluetoothGatt, ch: BluetoothGattCharacteristic, value: ByteArray, status: Int) { done(g, status, value) }
    override fun onDescriptorWrite(g: BluetoothGatt, d: BluetoothGattDescriptor, status: Int) { done(g, status, null) }
    override fun onMtuChanged(g: BluetoothGatt, mtu: Int, status: Int) { done(g, status, null) }
    @Deprecated("old api") override fun onCharacteristicChanged(g: BluetoothGatt, ch: BluetoothGattCharacteristic) {
      if (Build.VERSION.SDK_INT < 33) @Suppress("DEPRECATION") changed(g, ch, ch.value)
    }
    override fun onCharacteristicChanged(g: BluetoothGatt, ch: BluetoothGattCharacteristic, value: ByteArray) { changed(g, ch, value) }
  }

  private fun done(g: BluetoothGatt, status: Int, v: ByteArray?) {
    val c = conns[g.device.address] ?: return
    c.status = status; c.value = v; c.latch?.countDown()
  }

  private fun changed(g: BluetoothGatt, ch: BluetoothGattCharacteristic, v: ByteArray?) {
    val m = mapOf("event" to "bleNotify", "address" to g.device.address, "serviceUuid" to ch.service.uuid.toString(),
      "charUuid" to ch.uuid.toString(), "hex" to hex(v), "bytes" to (v?.map { it.toInt() and 0xff } ?: emptyList<Int>()))
    listener?.invoke(m)
    // also into the headless engine (works with the UI closed)
    try {
      val i = Intent().setClassName(app.packageName, "expo.modules.backgroundservice.MacroHeadlessTaskService")
      i.putExtra("event", "bleNotify"); i.putExtra("address", g.device.address)
      i.putExtra("serviceUuid", ch.service.uuid.toString()); i.putExtra("charUuid", ch.uuid.toString())
      i.putExtra("hex", hex(v)); i.putExtra("time", System.currentTimeMillis().toDouble())
      app.startService(i)
    } catch (e: Exception) { Log.e(TAG, "[EveryApp] FEHLER bleNotify-Task: ${e.message}") }
  }

  private fun <T> op(c: Conn, timeoutMs: Long, what: String, start: (BluetoothGatt) -> Boolean, result: () -> T): T {
    c.lock.lock()
    try {
      val g = c.gatt ?: throw IllegalStateException("BLE $what: nicht verbunden (${c.address})")
      val l = CountDownLatch(1); c.latch = l; c.status = 0; c.value = null
      if (!start(g)) throw IllegalStateException("BLE $what: Start abgelehnt (${c.address})")
      if (!l.await(timeoutMs, TimeUnit.MILLISECONDS)) throw IllegalStateException("BLE $what: Timeout nach ${timeoutMs}ms")
      if (c.status != BluetoothGatt.GATT_SUCCESS) throw IllegalStateException("BLE $what: GATT-Status ${c.status}")
      c.lastUsed = System.currentTimeMillis()
      return result()
    } finally { c.latch = null; c.lock.unlock() }
  }

  // ---------- public api ----------
  fun connect(ctx: Context, address: String, timeoutMs: Long): Map<String, Any?> {
    val a = adapter(ctx)
    val c = conns.getOrPut(address.uppercase()) { Conn(address.uppercase()) }
    c.lock.lock()
    try {
      if (c.gatt == null || !c.connected || !c.servicesReady) {
        try { c.gatt?.close() } catch (_: Exception) {}
        val l = CountDownLatch(1); c.latch = l; c.status = 0
        val dev = a.getRemoteDevice(c.address)
        c.gatt = if (Build.VERSION.SDK_INT >= 23) dev.connectGatt(app, false, callback, BluetoothDevice.TRANSPORT_LE) else dev.connectGatt(app, false, callback)
        if (!l.await(timeoutMs, TimeUnit.MILLISECONDS) || !c.servicesReady) {
          val st = c.status
          try { c.gatt?.disconnect(); c.gatt?.close() } catch (_: Exception) {}
          c.gatt = null; c.connected = false
          throw IllegalStateException("BLE connect ${c.address} fehlgeschlagen (Status $st, Timeout ${timeoutMs}ms) – Gerät an? Andere App (MeRGBW) verbunden?")
        }
        c.latch = null
        try { c.gatt?.requestMtu(185) } catch (_: Exception) {}
        Thread.sleep(300)
      }
      c.lastUsed = System.currentTimeMillis()
      return describe(c)
    } finally { c.latch = null; c.lock.unlock() }
  }

  private fun props(p: Int) = listOfNotNull(
    if (p and BluetoothGattCharacteristic.PROPERTY_READ != 0) "read" else null,
    if (p and BluetoothGattCharacteristic.PROPERTY_WRITE != 0) "write" else null,
    if (p and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE != 0) "writeWithoutResponse" else null,
    if (p and BluetoothGattCharacteristic.PROPERTY_NOTIFY != 0) "notify" else null,
    if (p and BluetoothGattCharacteristic.PROPERTY_INDICATE != 0) "indicate" else null)

  private fun describe(c: Conn): Map<String, Any?> = mapOf(
    "address" to c.address, "name" to try { c.gatt?.device?.name } catch (e: Exception) { null }, "connected" to c.connected,
    "services" to (c.gatt?.services ?: emptyList()).map { s ->
      mapOf("uuid" to s.uuid.toString(), "characteristics" to s.characteristics.map { ch ->
        mapOf("uuid" to ch.uuid.toString(), "properties" to props(ch.properties))
      })
    })

  fun disconnect(address: String) {
    conns.remove(address.uppercase())?.let { c -> try { c.gatt?.disconnect(); c.gatt?.close() } catch (_: Exception) {}; c.gatt = null }
  }

  fun connectedAddresses(): List<String> = conns.values.filter { it.connected }.map { it.address }

  private fun chr(ctx: Context, address: String, svc: String, ch: String, timeoutMs: Long): Pair<Conn, BluetoothGattCharacteristic> {
    connect(ctx, address, timeoutMs) // reuses existing connection
    val c = conns[address.uppercase()]!!
    val s = c.gatt?.getService(uuid(svc)) ?: throw IllegalStateException("Service $svc nicht gefunden")
    val x = s.getCharacteristic(uuid(ch)) ?: throw IllegalStateException("Characteristic $ch nicht gefunden in $svc")
    return c to x
  }

  /** accepts full UUIDs or 16-bit short form ("ffe1") */
  fun uuid(s: String): UUID = if (s.length <= 8) UUID.fromString("%08x-0000-1000-8000-00805f9b34fb".format(s.toLong(16))) else UUID.fromString(s)

  @Suppress("DEPRECATION")
  fun write(ctx: Context, address: String, svc: String, ch: String, data: ByteArray, withResponse: Boolean?, timeoutMs: Long): Boolean {
    val (c, x) = chr(ctx, address, svc, ch, timeoutMs)
    val resp = withResponse ?: (x.properties and BluetoothGattCharacteristic.PROPERTY_WRITE != 0)
    val type = if (resp) BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT else BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
    return op(c, 5000, "write", { g ->
      if (Build.VERSION.SDK_INT >= 33) g.writeCharacteristic(x, data, type) == BluetoothStatusCodes.SUCCESS
      else { x.writeType = type; x.value = data; g.writeCharacteristic(x) }
    }) { true }
  }

  fun read(ctx: Context, address: String, svc: String, ch: String, timeoutMs: Long): ByteArray? {
    val (c, x) = chr(ctx, address, svc, ch, timeoutMs)
    return op(c, 5000, "read", { g -> g.readCharacteristic(x) }) { c.value }
  }

  @Suppress("DEPRECATION")
  fun notify(ctx: Context, address: String, svc: String, ch: String, enable: Boolean, timeoutMs: Long): Boolean {
    val (c, x) = chr(ctx, address, svc, ch, timeoutMs)
    c.gatt!!.setCharacteristicNotification(x, enable)
    val d = x.getDescriptor(CCCD) ?: return true
    val v = if (!enable) BluetoothGattDescriptor.DISABLE_NOTIFICATION_VALUE
      else if (x.properties and BluetoothGattCharacteristic.PROPERTY_INDICATE != 0 && x.properties and BluetoothGattCharacteristic.PROPERTY_NOTIFY == 0) BluetoothGattDescriptor.ENABLE_INDICATION_VALUE
      else BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
    return op(c, 5000, "notify", { g ->
      if (Build.VERSION.SDK_INT >= 33) g.writeDescriptor(d, v) == BluetoothStatusCodes.SUCCESS else { d.value = v; g.writeDescriptor(d) }
    }) { true }
  }
}
