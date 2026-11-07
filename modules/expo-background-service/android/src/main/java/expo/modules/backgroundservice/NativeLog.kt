package expo.modules.backgroundservice

import android.content.Context
import android.util.Log
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Ring buffer of copyable diagnostic lines (logcat tag EveryApp + SharedPreferences). */
object NativeLog {
  private const val PREFS = "everyapp_nativelog"
  private const val MAX_LINES = 200
  private const val MAX_CHARS = 2000

  fun add(ctx: Context, message: String) {
    val line = "${stamp()} ${message.replace("\n", " ").take(MAX_CHARS)}"
    Log.i(EveryAppBackgroundService.TAG, line)
    val prefs = ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    synchronized(this) {
      val cur = prefs.getString("lines", "") ?: ""
      val lines = cur.lineSequence().filter { it.isNotBlank() }.toMutableList()
      lines.add(line)
      val trimmed = if (lines.size > MAX_LINES) lines.takeLast(MAX_LINES) else lines
      prefs.edit().putString("lines", trimmed.joinToString("\n")).commit()
    }
  }

  fun dump(ctx: Context): String =
    ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("lines", "") ?: ""

  private fun stamp(): String =
    SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSZ", Locale.US).format(Date())
}
