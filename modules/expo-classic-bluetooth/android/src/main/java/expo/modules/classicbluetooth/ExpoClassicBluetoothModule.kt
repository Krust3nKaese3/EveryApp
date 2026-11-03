package expo.modules.classicbluetooth

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoClassicBluetoothModule : Module() {
  private var receiver: BroadcastReceiver? = null
  private val bluetoothAdapter: BluetoothAdapter? = BluetoothAdapter.getDefaultAdapter()

  override fun definition() = ModuleDefinition {
    Name("ExpoClassicBluetooth")

    Events("onBluetoothConnected", "onBluetoothDisconnected")

    OnCreate {
      setupBluetoothReceiver()
    }

    OnDestroy {
      teardownBluetoothReceiver()
    }

    AsyncFunction("getConnectedDevices") { promise: Promise ->
      try {
        if (!hasBluetoothPermission()) {
          promise.reject("PERMISSION_DENIED", "Bluetooth permission not granted", null)
          return@AsyncFunction
        }

        val connectedDevices = mutableListOf<Map<String, String>>()
        
        bluetoothAdapter?.bondedDevices?.forEach { device ->
          if (isDeviceConnected(device)) {
            connectedDevices.add(
              mapOf(
                "name" to (device.name ?: "Unknown"),
                "address" to device.address
              )
            )
          }
        }

        promise.resolve(connectedDevices)
      } catch (e: Exception) {
        promise.reject("GET_DEVICES_FAILED", e.message, e)
      }
    }
  }

  private fun setupBluetoothReceiver() {
    if (receiver != null) return

    val filter = IntentFilter().apply {
      addAction(BluetoothDevice.ACTION_ACL_CONNECTED)
      addAction(BluetoothDevice.ACTION_ACL_DISCONNECTED)
    }

    receiver = object : BroadcastReceiver() {
      override fun onReceive(context: Context, intent: Intent) {
        val device: BluetoothDevice? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
        } else {
          @Suppress("DEPRECATION")
          intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
        }

        device?.let {
          val deviceInfo = mapOf(
            "name" to (it.name ?: "Unknown"),
            "address" to it.address
          )

          when (intent.action) {
            BluetoothDevice.ACTION_ACL_CONNECTED -> {
              sendEvent("onBluetoothConnected", deviceInfo)
            }
            BluetoothDevice.ACTION_ACL_DISCONNECTED -> {
              sendEvent("onBluetoothDisconnected", deviceInfo)
            }
          }
        }
      }
    }

    appContext.reactContext?.registerReceiver(receiver, filter)
  }

  private fun teardownBluetoothReceiver() {
    receiver?.let {
      try {
        appContext.reactContext?.unregisterReceiver(it)
      } catch (e: Exception) {
        // Receiver might not be registered
      }
      receiver = null
    }
  }

  private fun hasBluetoothPermission(): Boolean {
    val context = appContext.reactContext ?: return false
    
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      ContextCompat.checkSelfPermission(
        context,
        Manifest.permission.BLUETOOTH_CONNECT
      ) == PackageManager.PERMISSION_GRANTED
    } else {
      ContextCompat.checkSelfPermission(
        context,
        Manifest.permission.BLUETOOTH
      ) == PackageManager.PERMISSION_GRANTED
    }
  }

  private fun isDeviceConnected(device: BluetoothDevice): Boolean {
    return try {
      val method = device.javaClass.getMethod("isConnected")
      method.invoke(device) as? Boolean ?: false
    } catch (e: Exception) {
      false
    }
  }
}
