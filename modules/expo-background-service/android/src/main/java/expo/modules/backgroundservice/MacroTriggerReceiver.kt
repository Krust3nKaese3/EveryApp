package expo.modules.backgroundservice

import android.bluetooth.BluetoothDevice
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

class MacroTriggerReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val event = when (intent.action) {
      BluetoothDevice.ACTION_ACL_CONNECTED -> "bluetooth.connected"
      BluetoothDevice.ACTION_ACL_DISCONNECTED -> "bluetooth.disconnected"
      else -> return
    }
    if (!EveryAppBackgroundService.isEnabled(context)) {
      Log.i(EveryAppBackgroundService.TAG, "[EveryApp] $event ignored: background mode off")
      return
    }
    val device: BluetoothDevice? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
    } else {
      @Suppress("DEPRECATION") intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
    }
    if (device == null) return
    val info = BtDeviceInfo.toMap(device, event == "bluetooth.connected")
    val name = info["name"]; val address = info["address"]
    Log.i(EveryAppBackgroundService.TAG, "[EveryApp] $event $name (${info["alias"]}) $address -> starting background task")

    val service = Intent(context, MacroHeadlessTaskService::class.java).apply {
      putExtra("event", event)
      putExtra("name", info["name"] as String?)
      putExtra("address", info["address"] as String?)
      putExtra("device", org.json.JSONObject(info).toString())
      putExtra("time", System.currentTimeMillis().toDouble())
    }
    try {
      HeadlessStart.start(context, service)
    } catch (e: Exception) {
      NativeLog.add(context, "FEHLER Trigger-Task (${intent.action}) konnte nicht starten: ${e.javaClass.name}: ${e.message}")
      Log.e(EveryAppBackgroundService.TAG, "[EveryApp] FEHLER: Hintergrund-Task konnte nicht gestartet werden: ${e.javaClass.simpleName}: ${e.message}", e)
    }
  }
}
