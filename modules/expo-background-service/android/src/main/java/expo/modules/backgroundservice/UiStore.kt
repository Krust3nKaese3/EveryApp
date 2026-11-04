package expo.modules.backgroundservice

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffColorFilter
import android.util.Base64
import android.util.Log
import androidx.core.content.ContextCompat
import com.facebook.react.HeadlessJsTaskService
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** Native persistence of tile/widget configs (JSON) so TileService / widgets render while the app is closed. */
object UiStore {
  const val TAG = EveryAppBackgroundService.TAG
  private const val PREFS = "everyapp_ui"

  private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun getTile(ctx: Context, slot: Int): JSONObject? = prefs(ctx).getString("tile_$slot", null)?.let { parse(it) }
  fun tileSlotsFor(ctx: Context, appId: String): List<Int> = (1..5).filter { getTile(ctx, it)?.optString("appId") == appId }
  fun setTile(ctx: Context, slot: Int, json: String?) { prefs(ctx).edit().apply { if (json == null) remove("tile_$slot") else putString("tile_$slot", json) }.apply() }

  fun getWidget(ctx: Context, id: String): JSONObject? = prefs(ctx).getString("widget_$id", null)?.let { parse(it) }
  fun setWidget(ctx: Context, id: String, json: String?) {
    prefs(ctx).edit().apply { if (json == null) remove("widget_$id") else putString("widget_$id", json) }.apply()
  }
  fun widgetIds(ctx: Context): List<String> = prefs(ctx).all.keys.filter { it.startsWith("widget_") }.map { it.removePrefix("widget_") }.sorted()

  /** appWidgetId -> widget config id */
  fun getInstance(ctx: Context, appWidgetId: Int): String? = prefs(ctx).getString("winst_$appWidgetId", null)
  fun setInstance(ctx: Context, appWidgetId: Int, id: String?) {
    prefs(ctx).edit().apply { if (id == null) remove("winst_$appWidgetId") else putString("winst_$appWidgetId", id) }.apply()
  }

  private fun parse(s: String): JSONObject? = try { JSONObject(s) } catch (e: Exception) { Log.e(TAG, "[EveryApp] FEHLER UI-JSON: ${e.message}"); null }

  /** Downloads http(s) icons once and inlines them as data URLs (call on a background thread). */
  fun inlineRemoteIcons(json: String): String {
    val root = try { JSONObject(json) } catch (e: Exception) { return json }
    fun fix(o: JSONObject) {
      val icon = o.optString("icon", "")
      if (icon.startsWith("http://") || icon.startsWith("https://")) {
        try {
          val c = URL(icon).openConnection() as HttpURLConnection
          c.connectTimeout = 5000; c.readTimeout = 8000
          val bytes = c.inputStream.use { it.readBytes() }
          o.put("icon", "data:image/png;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP))
        } catch (e: Exception) { Log.e(TAG, "[EveryApp] FEHLER Icon-Download $icon: ${e.message}") }
      }
      for (k in listOf("menu", "items")) o.optJSONArray(k)?.let { a -> for (i in 0 until a.length()) a.optJSONObject(i)?.let { fix(it) } }
    }
    fix(root)
    return root.toString()
  }

  /** icon spec: built-in name (power, tv, ...), data:image/...;base64,..., or null. Returns white bitmap. */
  fun iconBitmap(ctx: Context, spec: String?, sizePx: Int = 96, tint: Int = Color.WHITE): Bitmap? {
    if (spec.isNullOrBlank()) return null
    try {
      if (spec.startsWith("data:")) {
        val b64 = spec.substringAfter("base64,", "")
        val bytes = Base64.decode(b64, Base64.DEFAULT)
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
      }
      val resId = ctx.resources.getIdentifier("ea_ic_" + spec.lowercase(), "drawable", ctx.packageName)
      if (resId != 0) {
        val d = ContextCompat.getDrawable(ctx, resId) ?: return null
        d.colorFilter = PorterDuffColorFilter(tint, PorterDuff.Mode.SRC_IN)
        val bmp = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
        d.setBounds(0, 0, sizePx, sizePx); d.draw(Canvas(bmp))
        return bmp
      }
    } catch (e: Exception) {
      Log.e(TAG, "[EveryApp] FEHLER Icon '$spec': ${e.message}")
    }
    return letterBitmap(spec, sizePx, tint)
  }

  /** Tile icons are tinted by the system: keep alpha, force white; fully opaque images use luminance as alpha. */
  fun alphaMask(src: Bitmap): Bitmap {
    val w = src.width; val h = src.height
    val px = IntArray(w * h); src.getPixels(px, 0, w, 0, 0, w, h)
    val opaque = px.all { Color.alpha(it) == 255 }
    for (i in px.indices) {
      val p = px[i]
      val a = if (opaque) { val l = (0.299 * Color.red(p) + 0.587 * Color.green(p) + 0.114 * Color.blue(p)).toInt(); 255 - l } else Color.alpha(p)
      px[i] = Color.argb(a, 255, 255, 255)
    }
    return Bitmap.createBitmap(px, w, h, Bitmap.Config.ARGB_8888)
  }

  /** Fallback: first letter of the spec (e.g. an emoji or unknown name). */
  fun letterBitmap(text: String, sizePx: Int, tint: Int): Bitmap {
    val bmp = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
    val p = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = tint; textSize = sizePx * 0.7f; textAlign = Paint.Align.CENTER }
    val t = text.trim().take(if (Character.isSurrogate(text.trim().firstOrNull() ?: 'x')) 2 else 1).uppercase()
    Canvas(bmp).drawText(t, sizePx / 2f, sizePx / 2f - (p.descent() + p.ascent()) / 2f, p)
    return bmp
  }

  /** Fire a trigger into the headless JS engine (same path as the Bluetooth receiver). */
  /** Returns null on success, otherwise an error text (for diagnostics). */
  fun fire(ctx: Context, event: String, extras: Map<String, Any?>): String? {
    val i = Intent(ctx, MacroHeadlessTaskService::class.java).apply {
      putExtra("event", event)
      putExtra("time", System.currentTimeMillis().toDouble())
      for ((k, v) in extras) when (v) {
        is String -> putExtra(k, v)
        is Int -> putExtra(k, v.toDouble())
        is Double -> putExtra(k, v)
        is Float -> putExtra(k, v.toDouble())
        is Boolean -> putExtra(k, v)
        null -> {}
        else -> putExtra(k, v.toString())
      }
    }
    try {
      ctx.startService(i)
      HeadlessJsTaskService.acquireWakeLockNow(ctx)
      Log.i(TAG, "[EveryApp] fired $event $extras")
      return null
    } catch (e: Throwable) {
      NativeLog.add(ctx, "FEHLER $event-Task konnte nicht starten: ${e.javaClass.name}: ${e.message}")
      Log.e(TAG, "[EveryApp] FEHLER $event-Task konnte nicht starten: ${e.javaClass.simpleName}: ${e.message}", e)
      return "${e.javaClass.name}: ${e.message}"
    }
  }

  fun arr(o: JSONObject?, key: String): List<JSONObject> {
    val a: JSONArray = o?.optJSONArray(key) ?: return emptyList()
    return (0 until a.length()).mapNotNull { a.optJSONObject(it) }
  }
}
