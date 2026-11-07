package expo.modules.backgroundservice

import android.content.Context
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoBackgroundServiceModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoBackgroundService")

    // Legacy entry points. They no longer pin a permanent foreground service.
    AsyncFunction("startService") { promise: Promise ->
      try {
        val context = reactContextOrReject(promise) ?: return@AsyncFunction
        ServiceGate.sync(context, "startService()")
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("START_SERVICE_FAILED", "${e.javaClass.name}: ${e.message}", e)
      }
    }

    AsyncFunction("stopService") { promise: Promise ->
      try {
        val context = reactContextOrReject(promise) ?: return@AsyncFunction
        context.stopService(android.content.Intent(context, EveryAppBackgroundService::class.java))
        NativeLog.add(context, "stopService() | Vordergrunddienst angehalten | Quelle: stopService")
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("STOP_SERVICE_FAILED", "${e.javaClass.name}: ${e.message}", e)
      }
    }

    AsyncFunction("enableApp") { appId: String, promise: Promise ->
      try {
        val context = reactContextOrReject(promise) ?: return@AsyncFunction
        TaskStore.setEnabled(context, appId, true)
        ServiceGate.sync(context, "enableApp($appId)")
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("ENABLE_APP_FAILED", "${e.javaClass.name}: ${e.message}", e)
      }
    }

    AsyncFunction("disableApp") { appId: String, promise: Promise ->
      try {
        val context = reactContextOrReject(promise) ?: return@AsyncFunction
        TaskStore.setEnabled(context, appId, false)
        ServiceGate.sync(context, "disableApp($appId)")
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("DISABLE_APP_FAILED", "${e.javaClass.name}: ${e.message}", e)
      }
    }

    Function("registerTasks") { appId: String, tasksJson: String ->
      val context = appContext.reactContext ?: return@Function "FEHLER registerTasks: kein Context"
      val warning = TaskStore.setTasks(context, appId, tasksJson)
      ServiceGate.sync(context, "registerTasks($appId)")
      warning ?: ""
    }

    Function("getTaskSnapshot") {
      appContext.reactContext?.let { TaskStore.snapshot(it) } ?: "{}"
    }

    Function("getNativeLog") {
      appContext.reactContext?.let { NativeLog.dump(it) } ?: ""
    }

    Function("addNativeLog") { message: String ->
      val context = appContext.reactContext ?: return@Function false
      NativeLog.add(context, message)
      true
    }

    Function("drainEvents") { appId: String ->
      appContext.reactContext?.let { EventQueue.drain(it, appId) } ?: "[]"
    }

    Function("appendEvent") { event: String, dataJson: String ->
      val context = appContext.reactContext ?: return@Function false
      EventQueue.appendForEnabled(context, event, dataJson)
      true
    }

    Function("noteBleConnected") { deviceId: String ->
      val context = appContext.reactContext ?: return@Function false
      BleReconnect.noteExternalConnect(context, deviceId)
      true
    }

    Function("lockGrantGet") { appId: String ->
      appContext.reactContext?.let { LockScreen.isGranted(it, appId) } ?: false
    }

    Function("lockGrantSet") { appId: String, granted: Boolean ->
      val context = appContext.reactContext ?: return@Function false
      LockScreen.setGranted(context, appId, granted)
      UiStore.tileSlotsFor(context, appId).forEach { EveryAppTileBase.refresh(context, it) }
      true
    }

    Function("setTile") { slot: Int, json: String ->
      val context = appContext.reactContext ?: return@Function false
      if (slot !in 1..5) {
        NativeLog.add(context, "FEHLER setTile | Slot $slot außerhalb 1..5")
        return@Function false
      }
      UiStore.setTile(context, slot, json.ifBlank { null })
      true
    }

    Function("getTiles") {
      appContext.reactContext?.let { UiStore.allTiles(it) } ?: "[]"
    }
  }

  private fun reactContextOrReject(promise: Promise): Context? {
    val context = appContext.reactContext
    if (context == null) {
      promise.reject("NO_CONTEXT", "React context not available", null)
      return null
    }
    return context
  }

  companion object {
    const val CHANNEL_ID = EveryAppBackgroundService.CHANNEL_ID
  }
}
