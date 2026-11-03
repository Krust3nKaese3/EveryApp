package expo.modules.classicbluetooth

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
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

    AsyncFunction("getConnectedDevices") { includePaired: Boolean?, promise: Promise ->
      try {
        if (!hasBluetoothPermission()) {
          promise.reject("PERMISSION_DENIED", "Bluetooth-Berechtigung (Geräte in der Nähe) fehlt", null)
          return@AsyncFunction
        }
        val context = appContext.reactContext ?: run { promise.reject("NO_CONTEXT", "no context", null); return@AsyncFunction }
        val adapter = bluetoothAdapter ?: run { promise.resolve(emptyList<Any>()); return@AsyncFunction }
        val connected = java.util.concurrent.ConcurrentHashMap<String, BluetoothDevice>()
        val profiles = listOf(BluetoothProfile.A2DP, BluetoothProfile.HEADSET, 4 /*HID_HOST*/, 22 /*LE_AUDIO*/, 21 /*HEARING_AID*/)
        val latch = java.util.concurrent.CountDownLatch(profiles.size)
        for (p in profiles) {
          val ok = try {
            adapter.getProfileProxy(context, object : BluetoothProfile.ServiceListener {
              override fun onServiceConnected(profile: Int, proxy: BluetoothProfile) {
                try { proxy.connectedDevices.forEach { connected[it.address] = it } } catch (e: Exception) {}
                try { adapter.closeProfileProxy(profile, proxy) } catch (e: Exception) {}
                latch.countDown()
              }
              override fun onServiceDisconnected(profile: Int) {}
            }, p)
          } catch (e: Exception) { false }
          if (!ok) latch.countDown()
        }
        latch.await(2, java.util.concurrent.TimeUnit.SECONDS)
        try {
          val bm = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
          bm.getConnectedDevices(BluetoothProfile.GATT).forEach { connected[it.address] = it }
        } catch (e: Exception) {}
        val bonded = try { adapter.bondedDevices ?: emptySet() } catch (e: Exception) { emptySet<BluetoothDevice>() }
        bonded.forEach { if (isDeviceConnected(it)) connected[it.address] = it }
        val result = connected.values.map { BtDeviceInfo.toMap(it, true) }.toMutableList()
        if (includePaired == true) {
          bonded.filter { !connected.containsKey(it.address) }.forEach { result.add(BtDeviceInfo.toMap(it, false)) }
        }
        promise.resolve(result)
      } catch (e: Exception) {
        promise.reject("GET_DEVICES_FAILED", "${e.javaClass.simpleName}: ${e.message}", e)
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
          val deviceInfo = BtDeviceInfo.toMap(it, intent.action == BluetoothDevice.ACTION_ACL_CONNECTED)

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
