package expo.modules.backgroundservice

import android.content.Intent
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
        EveryAppBackgroundService.start(context)
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
        context.stopService(Intent(context, EveryAppBackgroundService::class.java))
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("STOP_SERVICE_FAILED", e.message, e)
      }
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
