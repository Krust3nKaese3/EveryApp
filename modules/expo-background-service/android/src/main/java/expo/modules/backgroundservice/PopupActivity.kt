package expo.modules.backgroundservice

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.Window
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.TextView
import org.json.JSONObject
import java.lang.ref.WeakReference
import kotlin.math.roundToInt

/**
 * Generic popup host (full-screen translucent activity: scrim + styled card + transparent WebView).
 * Spec JSON (EXTRA_POPUP): { id, appId?, html? | url? (https only), throttleMs? (300), state? {},
 *   style?: { width, height: dp number | "NN%" | "auto"; position: center|bottom|top; margin (dp, 16);
 *     background "#RRGGBB"/"#AARRGGBB"/"rgba(r,g,b,a)"; backgroundAlpha 0..1; scrim color; scrimAlpha 0..1 (0.4);
 *     blur dp (Android 12+, else ignored); cornerRadius dp (22); borderWidth dp; borderColor; elevation dp (12);
 *     animation fade|slide|scale|none; dismissOnOutsideTap (true) } }
 * Page API: window.EveryAppPopup = { id, state, send(event, value), close(), onMessage(cb), resize(heightDp?) }
 * Events -> headless extras: event=popup, popupId, appId, popupEvent, valueJson, slot?, widgetId?
 */
class PopupActivity : Activity() {
  companion object {
    const val EXTRA_POPUP = "popup"
    const val EXTRA_SLOT = "slot"
    const val EXTRA_WIDGET = "widgetId"
    private const val PREFS = "everyapp_popup"
    private var current: WeakReference<PopupActivity>? = null

    fun open(ctx: Context, popupJson: String, slot: Int = 0, widgetId: String? = null): Intent =
      Intent(ctx, PopupActivity::class.java).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        putExtra(EXTRA_POPUP, popupJson); putExtra(EXTRA_SLOT, slot); widgetId?.let { putExtra(EXTRA_WIDGET, it) }
      }

    private fun key(appId: String?, id: String) = "state_${appId ?: ""}_$id"

    /** Merge `json` into the stored state of popup (appId,id) and deliver it live if that popup is open. */
    fun send(ctx: Context, appId: String?, id: String, json: String): Boolean {
      val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val st = storedState(ctx, appId, id)
      val d = try { JSONObject(json) } catch (e: Exception) { throw IllegalArgumentException("popup.send: Daten müssen ein JSON-Objekt sein") }
      d.keys().forEach { st.put(it, d.get(it)) }
      p.edit().putString(key(appId, id), st.toString()).apply()
      val a = current?.get() ?: return false
      if (a.popupId != id || a.appId != appId || a.isFinishing) return false
      a.runOnUiThread { a.web?.evaluateJavascript("window.__eaPopupRecv && window.__eaPopupRecv($json);", null) }
      return true
    }

    fun close(appId: String?, id: String?): Boolean {
      val a = current?.get() ?: return false
      if (a.appId != appId || (id != null && a.popupId != id)) return false
      a.runOnUiThread { a.dismiss() }; return true
    }

    fun storedState(ctx: Context, appId: String?, id: String): JSONObject =
      try { JSONObject(ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(key(appId, id), "{}") ?: "{}") } catch (e: Exception) { JSONObject() }

    /** "#RGB" "#RRGGBB" "#AARRGGBB" "rgba(r,g,b,a)" "rgb(r,g,b)" ; alpha (0..1) overrides. */
    fun color(s: String?, def: Int, alpha: Double? = null): Int {
      var c = def
      try {
        val t = s?.trim() ?: ""
        val m = Regex("""rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)""").find(t)
        c = when {
          m != null -> Color.argb(((m.groupValues[4].ifEmpty { "1" }.toDouble()) * 255).roundToInt().coerceIn(0, 255),
            m.groupValues[1].toInt(), m.groupValues[2].toInt(), m.groupValues[3].toInt())
          t.length == 4 && t.startsWith("#") -> Color.parseColor("#" + t.drop(1).map { "$it$it" }.joinToString(""))
          t.isNotEmpty() -> Color.parseColor(t)
          else -> def
        }
      } catch (e: Exception) { Log.w(UiStore.TAG, "[EveryApp] Popup: ungültige Farbe '$s'") }
      if (alpha != null) c = Color.argb((alpha.coerceIn(0.0, 1.0) * 255).roundToInt(), Color.red(c), Color.green(c), Color.blue(c))
      return c
    }
  }

  var popupId: String = ""
  var appId: String? = null
  var web: WebView? = null
  private var card: FrameLayout? = null
  private var slot = 0
  private var widgetId: String? = null
  private var throttleMs = 300L
  private var anim = "fade"
  private var position = "center"
  private var autoHeight = false
  private var maxHeightPx = 0
  private var closing = false
  private val handler = Handler(Looper.getMainLooper())
  private val lastFire = HashMap<String, Long>()
  private val pending = HashMap<String, String>()

  private fun dp(v: Double) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).roundToInt()
  private fun dp(v: Int) = dp(v.toDouble())

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    requestWindowFeature(Window.FEATURE_NO_TITLE)
    current = WeakReference(this)
    try { build() } catch (e: Exception) {
      Log.e(UiStore.TAG, "[EveryApp] FEHLER Popup: ${e.message}", e)
      setContentView(TextView(this).apply { text = "FEHLER Popup: ${e.message}"; setTextIsSelectable(true); setTextColor(Color.WHITE)
        setBackgroundColor(Color.parseColor("#CC000000")); setPadding(dp(16), dp(16), dp(16), dp(16)) })
    }
  }

  override fun onDestroy() {
    if (current?.get() === this) current = null
    for ((e, v) in pending.toMap()) fireRaw(e, v); pending.clear()
    if (popupId.isNotEmpty()) fireRaw("close", "null")
    web?.destroy(); web = null
    super.onDestroy()
  }

  @Deprecated("Deprecated in Java")
  override fun onBackPressed() { dismiss() }

  /** size spec: number (dp) | "NN%" | "auto" | null */
  private fun size(spec: Any?, totalPx: Int, def: Int): Int = when {
    spec is Number -> dp(spec.toDouble())
    spec is String && spec.endsWith("%") -> ((spec.dropLast(1).toDoubleOrNull() ?: 100.0) / 100.0 * totalPx).roundToInt()
    spec is String && spec == "auto" -> -2
    spec is String && spec.toDoubleOrNull() != null -> dp(spec.toDouble())
    else -> def
  }

  @SuppressLint("SetJavaScriptEnabled", "ClickableViewAccessibility")
  private fun build() {
    val cfg = JSONObject(intent.getStringExtra(EXTRA_POPUP) ?: "{}")
    val st = cfg.optJSONObject("style") ?: JSONObject()
    popupId = cfg.optString("id", "popup")
    appId = cfg.optString("appId").ifBlank { null }
    slot = intent.getIntExtra(EXTRA_SLOT, 0)
    widgetId = intent.getStringExtra(EXTRA_WIDGET)
    throttleMs = cfg.optLong("throttleMs", 300L).coerceIn(0L, 10_000L)
    anim = st.optString("animation", "fade")
    position = st.optString("position", "center")
    val state = cfg.optJSONObject("state") ?: JSONObject()
    storedState(this, appId, popupId).let { s -> s.keys().forEach { state.put(it, s.get(it)) } }

    window?.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
    window?.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
    val blur = st.optDouble("blur", 0.0)
    if (blur > 0 && Build.VERSION.SDK_INT >= 31) {
      try { window?.addFlags(WindowManager.LayoutParams.FLAG_BLUR_BEHIND); window?.attributes = window?.attributes?.apply { blurBehindRadius = dp(blur) } }
      catch (e: Exception) { Log.w(UiStore.TAG, "[EveryApp] Popup blur nicht unterstützt: ${e.message}") }
    }

    val dm = resources.displayMetrics
    val margin = dp(st.optDouble("margin", 16.0))
    val scrim = FrameLayout(this).apply {
      setBackgroundColor(color(st.optString("scrim", "#000000"), Color.BLACK, st.optDouble("scrimAlpha", 0.4)))
      if (st.optBoolean("dismissOnOutsideTap", true)) setOnClickListener { dismiss() }
    }
    val w = size(st.opt("width"), dm.widthPixels, (dm.widthPixels * 0.92).roundToInt()).let { if (it == -2) (dm.widthPixels * 0.92).roundToInt() else it }
    maxHeightPx = dm.heightPixels - 2 * margin
    var h = size(st.opt("height"), dm.heightPixels, dp(420))
    if (h == -2) { autoHeight = true; h = dp(120) }
    val radius = dp(st.optDouble("cornerRadius", 22.0)).toFloat()
    val c = FrameLayout(this).apply {
      background = GradientDrawable().apply {
        setColor(color(st.optString("background", "#F21E2A44"), Color.parseColor("#F21E2A44"), if (st.has("backgroundAlpha")) st.optDouble("backgroundAlpha") else null))
        cornerRadius = radius
        val bw = dp(st.optDouble("borderWidth", 0.0)); if (bw > 0) setStroke(bw, color(st.optString("borderColor", "#55FFFFFF"), Color.WHITE))
      }
      elevation = dp(st.optDouble("elevation", 12.0)).toFloat()
      clipToOutline = true
      isClickable = true // swallow taps so they don't reach the scrim
    }
    card = c
    val lp = FrameLayout.LayoutParams(w.coerceAtMost(dm.widthPixels), h.coerceAtMost(maxHeightPx)).apply {
      gravity = Gravity.CENTER_HORIZONTAL or when (position) { "bottom" -> Gravity.BOTTOM; "top" -> Gravity.TOP; else -> Gravity.CENTER_VERTICAL }
      setMargins(margin, margin, margin, margin)
    }
    scrim.addView(c, lp)

    val wv = WebView(this).apply {
      setBackgroundColor(Color.TRANSPARENT)
      settings.javaScriptEnabled = true
      settings.domStorageEnabled = true
      webChromeClient = WebChromeClient()
      addJavascriptInterface(Bridge(), "EveryAppPopupNative")
    }
    web = wv
    val shimJs = """(function(){if(window.EveryAppPopup)return;var N=window.EveryAppPopupNative,L=[];
window.EveryAppPopup={id:${JSONObject.quote(popupId)},state:$state,title:${JSONObject.quote(cfg.optString("title"))},
send:function(e,v){N.post(String(e),JSON.stringify(v===undefined?null:v));},close:function(){N.close();},
onMessage:function(cb){L.push(cb);},resize:function(h){N.resize(h==null?Math.ceil(document.documentElement.scrollHeight):Number(h));}};
window.__eaPopupRecv=function(d){for(var k in d)window.EveryAppPopup.state[k]=d[k];L.forEach(function(cb){try{cb(d);}catch(e){console.error(e);}});};
document.documentElement.style.background='transparent';
${if (autoHeight) "var rs=function(){window.EveryAppPopup.resize();};if(window.ResizeObserver)new ResizeObserver(rs).observe(document.documentElement);setTimeout(rs,50);" else ""}
})();"""
    wv.webViewClient = object : WebViewClient() {
      override fun onPageFinished(view: WebView, u: String?) {
        view.evaluateJavascript("$shimJs;window.dispatchEvent(new Event('everyapp:popupready'));", null)
      }
    }
    val url = cfg.optString("url")
    if (url.isNotBlank()) {
      if (!url.startsWith("https://")) throw IllegalArgumentException("Popup \"$popupId\": nur https-URLs erlaubt ($url)")
      wv.loadUrl(url)
    } else {
      val html = cfg.optString("html").ifBlank { "<p style='color:#fff;font-family:sans-serif;padding:16px'>Popup \"$popupId\": kein html/url</p>" }
      wv.loadDataWithBaseURL("https://everyapp.popup/", "<script>$shimJs</script>$html", "text/html", "utf-8", null)
    }
    c.addView(wv, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
    setContentView(scrim)
    animateIn(c, scrim)
  }

  private fun animateIn(c: View, scrim: View) {
    scrim.alpha = 0f; scrim.animate().alpha(1f).setDuration(if (anim == "none") 0 else 180).start()
    when (anim) {
      "slide" -> { c.translationY = (if (position == "top") -1 else 1) * resources.displayMetrics.heightPixels * 0.4f; c.animate().translationY(0f).setDuration(240).start() }
      "scale" -> { c.scaleX = 0.85f; c.scaleY = 0.85f; c.alpha = 0f; c.animate().scaleX(1f).scaleY(1f).alpha(1f).setDuration(200).start() }
      "fade" -> { c.alpha = 0f; c.animate().alpha(1f).setDuration(180).start() }
    }
  }

  fun dismiss() {
    if (closing) return; closing = true
    val c = card; val root = c?.parent as? View
    if (c == null || anim == "none") { finish(); overridePendingTransition(0, 0); return }
    root?.animate()?.alpha(0f)?.setDuration(160)?.start()
    val a = c.animate().setDuration(180)
    when (anim) {
      "slide" -> a.translationY((if (position == "top") -1 else 1) * resources.displayMetrics.heightPixels * 0.4f)
      "scale" -> a.scaleX(0.85f).scaleY(0.85f).alpha(0f)
      else -> a.alpha(0f)
    }
    a.withEndAction { finish(); overridePendingTransition(0, 0) }.start()
  }

  private fun fireRaw(event: String, valueJson: String) {
    lastFire[event] = System.currentTimeMillis()
    UiStore.fire(applicationContext, "popup", mapOf("popupId" to popupId, "appId" to appId, "popupEvent" to event, "valueJson" to valueJson,
      "slot" to (if (slot > 0) slot else null), "widgetId" to widgetId))
  }

  /** Leading + trailing throttle per event name. */
  private fun post(event: String, valueJson: String) {
    val now = System.currentTimeMillis()
    val last = lastFire[event] ?: 0L
    if (throttleMs == 0L || (now - last >= throttleMs && !pending.containsKey(event))) { fireRaw(event, valueJson); return }
    val had = pending.containsKey(event)
    pending[event] = valueJson
    if (!had) handler.postDelayed({ pending.remove(event)?.let { fireRaw(event, it) } }, (throttleMs - (now - last)).coerceAtLeast(10L))
  }

  inner class Bridge {
    @JavascriptInterface fun post(event: String, valueJson: String) { handler.post { post(event, valueJson) } }
    @JavascriptInterface fun close() { handler.post { dismiss() } }
    @JavascriptInterface fun resize(heightCssPx: Double) {
      handler.post {
        val c = card ?: return@post
        val lp = c.layoutParams; lp.height = dp(heightCssPx).coerceIn(dp(40), maxHeightPx); c.layoutParams = lp
      }
    }
  }
}
