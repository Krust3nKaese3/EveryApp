package expo.modules.backgroundservice

import android.bluetooth.BluetoothDevice
import android.content.Context
import android.content.Intent
import android.os.Build

object TriggerDispatch {
  fun onReceive(ctx: Context, intent: Intent?) {
    val action = intent?.action ?: return
    try {
      when (action) {
        BluetoothDevice.ACTION_ACL_CONNECTED -> bluetooth(ctx, intent, "bluetooth.connected")
        BluetoothDevice.ACTION_ACL_DISCONNECTED -> bluetooth(ctx, intent, "bluetooth.disconnected")
        Intent.ACTION_BOOT_COMPLETED -> {
          NativeLog.add(ctx, "BOOT | Headless-Task, WLAN-Callback neu, Dienst nur bei interval/bleNotify")
          WifiWatcher.onBoot(ctx)
          ServiceGate.sync(ctx, "boot")
          BackgroundRuntime.wake(ctx, "boot", emptyMap())
        }
        WifiWatcher.ACTION_WIFI -> WifiWatcher.onCallback(ctx)
        AlarmScheduler.ACTION_WIFI_DEBOUNCE -> WifiWatcher.onDebounceAlarm(ctx)
        AlarmScheduler.ACTION_INTERVAL -> {
          AlarmScheduler.markIntervalFired(ctx)
          BackgroundRuntime.wake(ctx, "interval", emptyMap())
          ServiceGate.sync(ctx, "interval-alarm")
        }
        AlarmScheduler.ACTION_BLE_RETRY -> ServiceGate.sync(ctx, "ble-retry")
        "expo.modules.backgroundservice.WIDGET" -> {
          BackgroundRuntime.wake(
            ctx,
            "widget",
            mapOf(
              "widgetId" to (intent.getStringExtra("widgetId") ?: ""),
              "appId" to (intent.getStringExtra("appId") ?: ""),
            ),
          )
        }
        else -> NativeLog.add(ctx, "TRIGGER ignoriert | action=$action")
      }
    } catch (e: Throwable) {
      NativeLog.add(ctx, "FEHLER TRIGGER | action=$action | ${e.javaClass.name}: ${e.message}")
    }
  }

  private fun bluetooth(ctx: Context, intent: Intent, event: String) {
    val device: BluetoothDevice? = if (Build.VERSION.SDK_INT >= 33) {
      intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
    } else {
      @Suppress("DEPRECATION")
      intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
    }
    val address = device?.address ?: ""
    val name = try {
      device?.name ?: ""
    } catch (e: SecurityException) {
      NativeLog.add(ctx, "FEHLER BT Name | $address | SecurityException: ${e.message}")
      ""
    }
    if (event == "bluetooth.connected" && address.isNotBlank()) {
      BleReconnect.noteExternalConnect(ctx, address)
    }
    BackgroundRuntime.wake(ctx, event, mapOf("address" to address, "name" to name))
  }
}
