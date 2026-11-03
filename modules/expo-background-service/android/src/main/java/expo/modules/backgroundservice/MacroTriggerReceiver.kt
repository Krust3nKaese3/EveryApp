package expo.modules.backgroundservice

import android.bluetooth.BluetoothDevice
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import com.facebook.react.HeadlessJsTaskService

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
    var name = "Unknown"
    try { name = device?.name ?: "Unknown" } catch (e: SecurityException) {
      Log.w(EveryAppBackgroundService.TAG, "[EveryApp] no BLUETOOTH_CONNECT permission for device name")
    }
    val address = device?.address ?: ""
    Log.i(EveryAppBackgroundService.TAG, "[EveryApp] $event $name $address -> starting background task")

    val service = Intent(context, MacroHeadlessTaskService::class.java).apply {
      putExtra("event", event)
      putExtra("name", name)
      putExtra("address", address)
      putExtra("time", System.currentTimeMillis().toDouble())
    }
    try {
      // Make sure the foreground service is up (e.g. after a crash), then run JS
      try { EveryAppBackgroundService.start(context) } catch (e: Exception) {
        Log.w(EveryAppBackgroundService.TAG, "[EveryApp] could not (re)start foreground service: ${e.message}")
      }
      context.startService(service)
      HeadlessJsTaskService.acquireWakeLockNow(context)
    } catch (e: Exception) {
      Log.e(EveryAppBackgroundService.TAG, "[EveryApp] FEHLER: Hintergrund-Task konnte nicht gestartet werden: ${e.javaClass.simpleName}: ${e.message}", e)
    }
  }
}
