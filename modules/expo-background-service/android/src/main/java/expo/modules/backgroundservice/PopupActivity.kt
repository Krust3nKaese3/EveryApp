package expo.modules.backgroundservice

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.Window
import android.view.WindowManager
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.TextView
import org.json.JSONObject
import java.lang.ref.WeakReference

class PopupActivity : Activity() {
  /** true = shown over the keyguard: no navigation away from the popup page, never opens the app. */
  var overLock = false
  private var webView: WebView? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    requestWindowFeature(Window.FEATURE_NO_TITLE)
    current = WeakReference(this)
    applyLockMode()
    try {
      build()
    } catch (e: Exception) {
      Log.e(UiStore.TAG, "[EveryApp] FEHLER Popup: ${e.message}", e)
      NativeLog.add(this, "FEHLER Popup: ${e.javaClass.name}: ${e.message}")
      setContentView(TextView(this).apply {
        text = "FEHLER Popup: ${e.message}"
        setTextIsSelectable(true)
        setTextColor(Color.WHITE)
      })
    }
  }

  /** Over-lock only when the tile asked for it (allowLocked + user grant, checked in EveryAppTileBase) – re-verified here. */
  private fun applyLockMode() {
    val req = intent?.getBooleanExtra(EXTRA_OVER_LOCK, false) == true
    val locked = LockScreen.isLocked(this)
    if (!req) {
      if (locked) NativeLog.add(this, "Popup: gesperrt, aber ohne Sperrbildschirm-Freigabe gestartet -> normal (hinter Sperre)")
      return
    }
    val spec = try {
      JSONObject(intent?.getStringExtra(EXTRA_POPUP) ?: "{}")
    } catch (_: Exception) {
      JSONObject()
    }
    val aid = spec.optString("appId").takeIf { it.isNotBlank() }
    if (!LockScreen.isGranted(this, aid)) {
      NativeLog.add(this, "FEHLER Popup ${spec.optString("id")}: overLock angefragt, aber keine Freigabe für appId=${aid ?: "null"} -> nicht über Sperrbildschirm")
      return
    }
    overLock = true
    try {
      if (Build.VERSION.SDK_INT >= 27) {
        setShowWhenLocked(true)
        setTurnScreenOn(true)
      } else {
        @Suppress("DEPRECATION")
        window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
      }
      NativeLog.add(this, "Popup ${spec.optString("id")} (appId=$aid): über Sperrbildschirm angezeigt (gesperrt=$locked)")
    } catch (e: Throwable) {
      NativeLog.add(this, "FEHLER Popup showWhenLocked: ${e.javaClass.name}: ${e.message}")
    }
  }

  private fun build() {
    val spec = try {
      JSONObject(intent?.getStringExtra(EXTRA_POPUP) ?: "{}")
    } catch (e: Exception) {
      throw IllegalArgumentException("Popup-JSON: ${e.message}")
    }
    val wv = WebView(this)
    webView = wv
    wv.setBackgroundColor(Color.TRANSPARENT)
    wv.settings.javaScriptEnabled = true
    wv.settings.domStorageEnabled = true
    wv.webViewClient = object : WebViewClient() {
      override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
        if (!overLock) return false
        NativeLog.add(this@PopupActivity, "Popup über Sperrbildschirm: Navigation zu ${req.url} blockiert")
        return true
      }
    }
    setContentView(wv)
    when {
      spec.has("html") -> wv.loadDataWithBaseURL(null, spec.getString("html"), "text/html", "utf-8", null)
      spec.has("url") -> wv.loadUrl(spec.getString("url"))
      else -> wv.loadData("<p>Popup</p>", "text/html", "utf-8")
    }
  }

  override fun onDestroy() {
    if (current?.get() === this) current = null
    webView?.destroy()
    webView = null
    super.onDestroy()
  }

  companion object {
    const val EXTRA_POPUP = "popup"
    const val EXTRA_SLOT = "slot"
    const val EXTRA_WIDGET = "widgetId"
    const val EXTRA_OVER_LOCK = "overLock"
    private var current: WeakReference<PopupActivity>? = null

    fun open(ctx: Context, popupJson: String, slot: Int = 0, widgetId: String? = null, overLock: Boolean = false): Intent =
      Intent(ctx, PopupActivity::class.java).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        putExtra(EXTRA_POPUP, popupJson)
        putExtra(EXTRA_SLOT, slot)
        widgetId?.let { putExtra(EXTRA_WIDGET, it) }
        putExtra(EXTRA_OVER_LOCK, overLock)
      }
  }
}
