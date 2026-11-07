package expo.modules.backgroundservice

import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoBackgroundServiceModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoBackgroundService")

    AsyncFunction("startService") { promise: Promise ->
      try {
        val context = appContext.reactContext ?: run {
          promise.reject("NO_CONTEXT", "React context not available", null); return@AsyncFunction
        }
        EveryAppBackgroundService.setEnabled(context, true)
        ServiceGate.sync(context, "startService")
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("START_SERVICE_FAILED", "${e.javaClass.simpleName}: ${e.message}", e)
      }
    }

    AsyncFunction("stopService") { promise: Promise ->
      try {
        val context = appContext.reactContext ?: run {
          promise.reject("NO_CONTEXT", "React context not available", null); return@AsyncFunction
        }
        EveryAppBackgroundService.setEnabled(context, false)
        ServiceGate.sync(context, "stopService")
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("STOP_SERVICE_FAILED", e.message, e)
      }
    }

    Function("setTileLabel") { index: Int, label: String? ->
      val context = appContext.reactContext ?: return@Function false
      EveryAppTileBase.setLabel(context, index, label)
      true
    }

    AsyncFunction("setTileConfig") { slot: Int, json: String? ->
      val context = appContext.reactContext ?: throw IllegalStateException("React context not available")
      UiStore.setTile(context, slot, json?.let { UiStore.inlineRemoteIcons(it) })
      EveryAppTileBase.refresh(context, slot)
      true
    }

    AsyncFunction("setWidgetConfig") { id: String, json: String? ->
      val context = appContext.reactContext ?: throw IllegalStateException("React context not available")
      UiStore.setWidget(context, id, json?.let { UiStore.inlineRemoteIcons(it) })
      EveryAppWidgetBase.updateAll(context)
      true
    }

    Function("getWidgetIds") {
      val context = appContext.reactContext ?: return@Function emptyList<String>()
      UiStore.widgetIds(context)
    }

    Function("nativeLogRead") { appContext.reactContext?.let { NativeLog.read(it) } ?: "[]" }
    Function("nativeLogClear") { appContext.reactContext?.let { NativeLog.clear(it) }; true }

    // Generic popup host (PopupActivity)
    Function("popupSend") { appId: String, id: String, json: String ->
      val context = appContext.reactContext ?: return@Function false
      PopupActivity.send(context, appId, id, json)
    }
    Function("popupClose") { appId: String, id: String? -> PopupActivity.close(appId, id) }
    Function("popupState") { appId: String, id: String ->
      val context = appContext.reactContext ?: return@Function "{}"
      PopupActivity.storedState(context, appId, id).toString()
    }
    Function("popupOpen") { json: String ->
      val context = appContext.currentActivity ?: appContext.reactContext ?: throw IllegalStateException("Kein Context")
      context.startActivity(PopupActivity.open(context, json)); true
    }
    // Lock-screen grant per mini-app (only set from EveryApp's own confirmation dialog, never from mini-app code)
    Function("lockGrantGet") { appId: String -> appContext.reactContext?.let { LockScreen.isGranted(it, appId) } ?: false }
    Function("lockGrantSet") { appId: String, granted: Boolean ->
      val context = appContext.reactContext ?: return@Function false
      LockScreen.setGranted(context, appId, granted)
      UiStore.tileSlotsFor(context, appId).forEach { EveryAppTileBase.refresh(context, it) }
      true
    }
    Function("setRuntimeNeeds") { interval: Boolean, intervalMs: Double, wifi: Boolean ->
      val context = appContext.reactContext ?: return@Function false
      ServiceGate.setNeeds(context, interval, intervalMs.toLong(), wifi)
      ServiceGate.sync(context, "setRuntimeNeeds")
      true
    }
    Function("isServiceEnabled") {
      val context = appContext.reactContext ?: return@Function false
      EveryAppBackgroundService.isEnabled(context)
    }
  }

  companion object {
    const val CHANNEL_ID = EveryAppBackgroundService.CHANNEL_ID
  }
}
