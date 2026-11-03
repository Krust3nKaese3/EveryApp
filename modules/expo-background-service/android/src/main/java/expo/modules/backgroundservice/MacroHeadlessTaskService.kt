package expo.modules.backgroundservice

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/** Runs the generic JS task "EveryAppBackgroundTask" (src/services/BackgroundTasks.ts) - works even if the UI is closed. */
class MacroHeadlessTaskService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    val extras = intent?.extras ?: return null
    return HeadlessJsTaskConfig("EveryAppBackgroundTask", Arguments.fromBundle(extras), 120_000L, true)
  }
}
