package expo.modules.backgroundservice

import android.content.Context
import android.util.Log
import org.json.JSONArray
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Native diagnostics ring buffer, merged into EveryApp's Debug-Log (prefix "NATIV"). */
object NativeLog {
  private const val PREFS = "everyapp_nativelog"
  private const val KEY = "lines"
  private const val MAX = 100

  @Synchronized fun add(ctx: Context, text: String) {
    Log.i("EveryAppNative", text)
    try {
      val p = ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val arr = try { JSONArray(p.getString(KEY, "[]")) } catch (e: Exception) { JSONArray() }
      val ts = SimpleDateFormat("dd.MM. HH:mm:ss.SSS", Locale.GERMANY).format(Date())
      arr.put("$ts NATIV $text")
      val out = JSONArray(); val from = maxOf(0, arr.length() - MAX)
      for (i in from until arr.length()) out.put(arr.get(i))
      p.edit().putString(KEY, out.toString()).apply()
    } catch (e: Throwable) { Log.e("EveryAppNative", "NativeLog failed", e) }
  }

  @Synchronized fun read(ctx: Context): String =
    ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "[]") ?: "[]"

  @Synchronized fun clear(ctx: Context) {
    ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(KEY).apply()
  }
}
