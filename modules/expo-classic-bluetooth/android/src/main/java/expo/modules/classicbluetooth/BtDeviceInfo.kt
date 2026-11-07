package expo.modules.classicbluetooth

import android.bluetooth.BluetoothClass
import android.bluetooth.BluetoothDevice
import android.os.Build

object BtDeviceInfo {
  private fun major(c: Int): String = when (c) {
    BluetoothClass.Device.Major.AUDIO_VIDEO -> "AUDIO_VIDEO"
    BluetoothClass.Device.Major.COMPUTER -> "COMPUTER"
    BluetoothClass.Device.Major.HEALTH -> "HEALTH"
    BluetoothClass.Device.Major.IMAGING -> "IMAGING"
    BluetoothClass.Device.Major.MISC -> "MISC"
    BluetoothClass.Device.Major.NETWORKING -> "NETWORKING"
    BluetoothClass.Device.Major.PERIPHERAL -> "PERIPHERAL"
    BluetoothClass.Device.Major.PHONE -> "PHONE"
    BluetoothClass.Device.Major.TOY -> "TOY"
    BluetoothClass.Device.Major.WEARABLE -> "WEARABLE"
    BluetoothClass.Device.Major.UNCATEGORIZED -> "UNCATEGORIZED"
    else -> "UNKNOWN($c)"
  }

  fun toMap(d: BluetoothDevice, connected: Boolean): Map<String, Any?> {
    fun <T> safe(f: () -> T): T? = try { f() } catch (e: Exception) { null }
    val name = safe { d.name }
    val alias = if (Build.VERSION.SDK_INT >= 30) safe { d.alias } else null
    val type = when (safe { d.type }) {
      BluetoothDevice.DEVICE_TYPE_CLASSIC -> "classic"
      BluetoothDevice.DEVICE_TYPE_LE -> "le"
      BluetoothDevice.DEVICE_TYPE_DUAL -> "dual"
      else -> "unknown"
    }
    val bond = when (safe { d.bondState }) {
      BluetoothDevice.BOND_BONDED -> "bonded"
      BluetoothDevice.BOND_BONDING -> "bonding"
      else -> "none"
    }
    val cls = safe { d.bluetoothClass }
    return mapOf(
      "name" to (name ?: alias ?: "Unknown"),
      "alias" to (alias ?: name ?: "Unknown"),
      "address" to d.address,
      "type" to type,
      "bondState" to bond,
      "majorClass" to (cls?.let { major(it.majorDeviceClass) } ?: "UNKNOWN"),
      "deviceClass" to (cls?.deviceClass ?: -1),
      "uuids" to (safe { d.uuids?.map { it.toString() } } ?: emptyList<String>()),
      "connected" to connected
    )
  }
}
