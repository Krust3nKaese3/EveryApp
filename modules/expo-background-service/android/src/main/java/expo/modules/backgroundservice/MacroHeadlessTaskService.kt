package expo.modules.backgroundservice

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/** Runs the JS task "EveryAppMacroTask" (registered in index.ts) - works even if the app UI is closed. */
class MacroHeadlessTaskService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    val extras = intent?.extras ?: return null
    return HeadlessJsTaskConfig("EveryAppMacroTask", Arguments.fromBundle(extras), 120_000L, true)
  }
}
