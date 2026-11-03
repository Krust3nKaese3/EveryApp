package expo.modules.mediacontrol

import android.content.Context
import android.media.AudioManager
import android.os.SystemClock
import android.view.KeyEvent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoMediaControlModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoMediaControl")

    // action: play | pause | toggle | next | previous | stop
    AsyncFunction("sendKey") { action: String ->
      val code = when (action) {
        "play" -> KeyEvent.KEYCODE_MEDIA_PLAY
        "pause" -> KeyEvent.KEYCODE_MEDIA_PAUSE
        "toggle" -> KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
        "next" -> KeyEvent.KEYCODE_MEDIA_NEXT
        "previous" -> KeyEvent.KEYCODE_MEDIA_PREVIOUS
        "stop" -> KeyEvent.KEYCODE_MEDIA_STOP
        else -> throw IllegalArgumentException("Unbekannte Media-Aktion: $action")
      }
      val ctx = appContext.reactContext ?: throw IllegalStateException("React context not available")
      val am = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      val t = SystemClock.uptimeMillis()
      am.dispatchMediaKeyEvent(KeyEvent(t, t, KeyEvent.ACTION_DOWN, code, 0))
      am.dispatchMediaKeyEvent(KeyEvent(t, t, KeyEvent.ACTION_UP, code, 0))
      true
    }
  }
}
