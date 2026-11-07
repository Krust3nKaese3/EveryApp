package expo.modules.backgroundservice

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Alarm from BleManager. Starts the foreground service only when the attempt is due. Not exported. */
class BleRetryReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val addr = intent.getStringExtra("address") ?: return
    if (!EveryAppBackgroundService.isEnabled(context)) return
    try {
      val k = Class.forName("expo.modules.blegatt.BleManager")
      val inst = k.getField("INSTANCE").get(null)
      k.getMethod("markDue", Context::class.java, String::class.java).invoke(inst, context.applicationContext, addr)
    } catch (e: Throwable) {
      NativeLog.add(context, "FEHLER BLE markDue: ${e.javaClass.name}: ${e.message}")
    }
    val already = EveryAppBackgroundService.running
    ServiceGate.sync(context, "ble-retry")
    if (!already) return
    try {
      val k = Class.forName("expo.modules.blegatt.BleManager")
      k.getMethod("restoreSubscriptions", Context::class.java, String::class.java)
        .invoke(k.getField("INSTANCE").get(null), context.applicationContext, addr)
    } catch (e: Throwable) {
      NativeLog.add(context, "FEHLER BLE-Retry: ${e.javaClass.name}: ${e.message}")
    }
  }
}
