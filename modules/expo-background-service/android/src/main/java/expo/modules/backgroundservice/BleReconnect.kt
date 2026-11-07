package expo.modules.backgroundservice

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothProfile
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Bounded BLE notify reconnect. The foreground service stays up only while a subscription
 * is due or connected. Backoff waits are AlarmManager-driven so the process can die.
 * Attempt counter resets on a successful connection.
 */
object BleReconnect {
  private val handler = Handler(Looper.getMainLooper())
  private val sessions = HashMap<String, GattSession>()
  private var generation = 0

  fun onServiceStarted(ctx: Context) {
    val now = System.currentTimeMillis()
    for (sub in TaskStore.bleSubs(ctx)) {
      if (sub.exhausted || sub.nextAttemptAt > now) continue
      if (sessions.containsKey(sub.key)) continue
      val session = GattSession(ctx.applicationContext, sub, generation)
      sessions[sub.key] = session
      session.connect()
    }
  }

  fun onServiceDestroyed() {
    generation += 1
    val copy = sessions.values.toList()
    sessions.clear()
    copy.forEach { it.close() }
  }

  fun noteExternalConnect(ctx: Context, deviceId: String) {
    val subs = TaskStore.bleSubs(ctx, enabledOnly = false).toMutableList()
    var changed = false
    for (i in subs.indices) {
      val sub = subs[i]
      if (!sub.deviceId.equals(deviceId, ignoreCase = true)) continue
      if (sub.attempts == 0 && !sub.exhausted && sub.nextAttemptAt == 0L) continue
      subs[i] = sub.copy(attempts = 0, exhausted = false, nextAttemptAt = 0L)
      changed = true
    }
    if (!changed) return
    TaskStore.saveBle(ctx, subs)
    NativeLog.add(ctx, "BLE VERSUCHE ZURÜCKGESETZT | Gerät $deviceId | erfolgreiche Verbindung")
    ServiceGate.sync(ctx, "ble-connected:$deviceId")
  }

  fun exhaust(ctx: Context, key: String, error: String) {
    sessions.remove(key)?.close()
    val subs = TaskStore.bleSubs(ctx, enabledOnly = false).toMutableList()
    val index = subs.indexOfFirst { it.key == key }
    if (index < 0) {
      ServiceGate.sync(ctx, "ble-missing:$key")
      return
    }
    val sub = subs[index]
    subs[index] = sub.copy(attempts = ServicePolicy.BLE_MAX_ATTEMPTS, exhausted = true, nextAttemptAt = 0L)
    TaskStore.saveBle(ctx, subs)
    NativeLog.add(
      ctx,
      "BLE RECONNECT STOPP | Gerät ${sub.deviceId} Versuch ${ServicePolicy.BLE_MAX_ATTEMPTS}/${ServicePolicy.BLE_MAX_ATTEMPTS} | $error | kein weiterer Versuch, Dienst wird nicht für dieses Abo gehalten",
    )
    refreshAlarms(ctx, subs)
    ServiceGate.sync(ctx, "ble-exhausted:${sub.deviceId}")
  }

  fun onAttemptFailed(ctx: Context, key: String, error: String) {
    sessions.remove(key)?.close()
    val subs = TaskStore.bleSubs(ctx, enabledOnly = false).toMutableList()
    val index = subs.indexOfFirst { it.key == key }
    if (index < 0) {
      ServiceGate.sync(ctx, "ble-missing:$key")
      return
    }
    val sub = subs[index]
    if (sub.exhausted) return
    val attempt = sub.attempts + 1
    if (!ServicePolicy.bleShouldRetry(attempt)) {
      subs[index] = sub.copy(attempts = attempt, exhausted = true, nextAttemptAt = 0L)
      TaskStore.saveBle(ctx, subs)
      NativeLog.add(
        ctx,
        "BLE RECONNECT STOPP | Gerät ${sub.deviceId} Versuch $attempt/${ServicePolicy.BLE_MAX_ATTEMPTS} | $error | kein weiterer Versuch, Dienst wird nicht für dieses Abo gehalten",
      )
      refreshAlarms(ctx, subs)
      ServiceGate.sync(ctx, "ble-exhausted:${sub.deviceId}")
      return
    }
    val delay = ServicePolicy.bleBackoffMs(attempt)
    val at = System.currentTimeMillis() + delay
    subs[index] = sub.copy(attempts = attempt, exhausted = false, nextAttemptAt = at)
    TaskStore.saveBle(ctx, subs)
    NativeLog.add(
      ctx,
      "BLE RECONNECT | Gerät ${sub.deviceId} Versuch $attempt/${ServicePolicy.BLE_MAX_ATTEMPTS} fehlgeschlagen: $error | nächster Versuch in ${delay}ms",
    )
    refreshAlarms(ctx, subs)
    ServiceGate.sync(ctx, "ble-backoff:${sub.deviceId}")
  }

  fun onConnected(ctx: Context, key: String) {
    val subs = TaskStore.bleSubs(ctx, enabledOnly = false).toMutableList()
    val index = subs.indexOfFirst { it.key == key }
    if (index < 0) return
    val sub = subs[index]
    subs[index] = sub.copy(attempts = 0, exhausted = false, nextAttemptAt = 0L)
    TaskStore.saveBle(ctx, subs)
    NativeLog.add(ctx, "BLE VERBUNDEN | Gerät ${sub.deviceId} | Versuche zurückgesetzt")
    refreshAlarms(ctx, subs)
  }

  private fun refreshAlarms(ctx: Context, subs: List<TaskStore.BleSub>) {
    val next = subs.filter { !it.exhausted && it.nextAttemptAt > System.currentTimeMillis() }.minOfOrNull { it.nextAttemptAt }
    val prefs = ctx.applicationContext.getSharedPreferences("everyapp_alarms", Context.MODE_PRIVATE)
    val prev = prefs.getLong("bleAt", 0L)
    if (next == null) {
      if (prev != 0L) {
        AlarmScheduler.cancelBle(ctx)
        prefs.edit().remove("bleAt").apply()
      }
      return
    }
    if (prev == next) return
    AlarmScheduler.scheduleBle(ctx, next)
    prefs.edit().putLong("bleAt", next).apply()
  }

  fun syncAlarms(ctx: Context) {
    refreshAlarms(ctx, TaskStore.bleSubs(ctx))
  }

  private class GattSession(
    private val ctx: Context,
    private val sub: TaskStore.BleSub,
    private val gen: Int,
  ) {
    private var gatt: BluetoothGatt? = null
    private val failed = AtomicBoolean(false)
    private var connected = false

    fun connect() {
      if (gen != generation) return
      if (!hasConnectPermission()) {
        exhaust(ctx, sub.key, "BLUETOOTH_CONNECT fehlt")
        return
      }
      val adapter = BluetoothAdapter.getDefaultAdapter()
      if (adapter == null || !adapter.isEnabled) {
        fail("BluetoothAdapter aus oder null")
        return
      }
      val device = try {
        adapter.getRemoteDevice(sub.deviceId)
      } catch (e: IllegalArgumentException) {
        exhaust(ctx, sub.key, "ungültige Adresse ${sub.deviceId}: ${e.javaClass.name}: ${e.message}")
        return
      }
      try {
        gatt = if (Build.VERSION.SDK_INT >= 23) {
          device.connectGatt(ctx, false, callback, BluetoothDevice.TRANSPORT_LE)
        } else {
          @Suppress("DEPRECATION")
          device.connectGatt(ctx, false, callback)
        }
        if (gatt == null) {
          fail("connectGatt returned null")
          return
        }
      } catch (e: SecurityException) {
        exhaust(ctx, sub.key, "SecurityException: ${e.message}")
        return
      }
      handler.postDelayed({
        if (gen == generation && !connected) fail("Timeout 20s ohne Verbindung")
      }, 20_000)
    }

    fun close() {
      failed.set(true)
      try {
        gatt?.close()
      } catch (_: Throwable) {
      }
      gatt = null
    }

    private fun fail(error: String) {
      if (!failed.compareAndSet(false, true)) return
      try {
        gatt?.disconnect()
        gatt?.close()
      } catch (_: Throwable) {
      }
      gatt = null
      if (gen != generation) return
      onAttemptFailed(ctx, sub.key, error)
    }

    private fun hasConnectPermission(): Boolean {
      if (Build.VERSION.SDK_INT < 31) return true
      return ContextCompat.checkSelfPermission(ctx, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
    }

    private val callback = object : BluetoothGattCallback() {
      override fun onConnectionStateChange(g: BluetoothGatt, status: Int, newState: Int) {
        if (gen != generation) return
        if (newState == BluetoothProfile.STATE_CONNECTED) {
          connected = true
          onConnected(ctx, sub.key)
          try {
            g.discoverServices()
          } catch (e: SecurityException) {
            fail("discover SecurityException: ${e.message}")
          }
          return
        }
        if (newState == BluetoothProfile.STATE_DISCONNECTED) {
          connected = false
          fail("getrennt status=$status")
        }
      }

      override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {
        if (gen != generation) return
        try {
          if (status != BluetoothGatt.GATT_SUCCESS) {
            fail("Service-Discovery status=$status")
            return
          }
          val service = g.getService(uuid(sub.serviceUUID))
          if (service == null) {
            fail("Service ${sub.serviceUUID} nicht gefunden")
            return
          }
          val characteristic = service.getCharacteristic(uuid(sub.characteristicUUID))
          if (characteristic == null) {
            fail("Characteristic ${sub.characteristicUUID} nicht gefunden")
            return
          }
          g.setCharacteristicNotification(characteristic, true)
          val desc = characteristic.getDescriptor(uuid("00002902-0000-1000-8000-00805f9b34fb"))
          if (desc != null) {
            if (Build.VERSION.SDK_INT >= 33) {
              g.writeDescriptor(desc, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)
            } else {
              @Suppress("DEPRECATION")
              desc.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
              @Suppress("DEPRECATION")
              g.writeDescriptor(desc)
            }
          }
          NativeLog.add(ctx, "BLE NOTIFY AN | Gerät ${sub.deviceId} | ${sub.characteristicUUID}")
        } catch (e: Throwable) {
          fail("Notify ${e.javaClass.name}: ${e.message}")
        }
      }

      override fun onCharacteristicChanged(g: BluetoothGatt, characteristic: BluetoothGattCharacteristic, value: ByteArray) {
        deliver(value)
      }

      @Deprecated("API < 33")
      override fun onCharacteristicChanged(g: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
        if (Build.VERSION.SDK_INT < 33) {
          @Suppress("DEPRECATION")
          deliver(characteristic.value ?: ByteArray(0))
        }
      }

      private fun deliver(value: ByteArray) {
        if (gen != generation) return
        val hex = value.joinToString("") { "%02x".format(it) }
        BackgroundRuntime.wake(
          ctx,
          "bleNotify",
          mapOf(
            "appId" to sub.appId,
            "deviceId" to sub.deviceId,
            "serviceUUID" to sub.serviceUUID,
            "characteristicUUID" to sub.characteristicUUID,
            "value" to hex,
          ),
        )
      }
    }
  }

  private fun uuid(raw: String): UUID {
    val text = raw.trim()
    if (text.length == 4 || (text.length == 6 && text.startsWith("0x"))) {
      val hex = text.removePrefix("0x").padStart(4, '0')
      return UUID.fromString("0000$hex-0000-1000-8000-00805f9b34fb")
    }
    if (text.length == 8) return UUID.fromString("0000$text-0000-1000-8000-00805f9b34fb")
    return UUID.fromString(text)
  }
}
