package expo.modules.backgroundservice

import android.app.Activity
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.ViewGroup
import android.view.Window
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.SeekBar
import android.widget.TextView
import org.json.JSONObject
import kotlin.math.roundToInt

/**
 * Small native dialog for tile menus and widget sliders; also a no-UI "fire" trampoline for widget buttons
 * (activities may always be started from widget clicks; the foreground activity may then start the JS service).
 */
class MenuActivity : Activity() {
  companion object {
    const val EXTRA_SOURCE = "source"      // tile | widget
    const val EXTRA_SLOT = "slot"          // tile slot
    const val EXTRA_WIDGET = "widgetId"    // widget config id
    const val EXTRA_ITEM = "itemId"        // widget: only this item
    const val EXTRA_FIRE = "fire"          // widget button: fire + finish
    const val EXTRA_VALUE = "value"
  }

  private fun dp(v: Int) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).roundToInt()

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    requestWindowFeature(Window.FEATURE_NO_TITLE)
    setFinishOnTouchOutside(true)
    try { build() } catch (e: Exception) {
      Log.e(UiStore.TAG, "[EveryApp] FEHLER Menü: ${e.message}", e)
      setContentView(TextView(this).apply { text = "FEHLER Menü: ${e.message}"; setTextIsSelectable(true); setPadding(dp(16), dp(16), dp(16), dp(16)) })
    }
  }

  private fun build() {
    val source = intent.getStringExtra(EXTRA_SOURCE) ?: "tile"
    val slot = intent.getIntExtra(EXTRA_SLOT, 0)
    val widgetId = intent.getStringExtra(EXTRA_WIDGET)
    val itemId = intent.getStringExtra(EXTRA_ITEM)

    if (intent.getBooleanExtra(EXTRA_FIRE, false)) {
      UiStore.fire(this, "widgetAction", mapOf("widgetId" to widgetId, "id" to itemId,
        "value" to (if (intent.hasExtra(EXTRA_VALUE)) intent.getDoubleExtra(EXTRA_VALUE, 0.0) else null)))
      finish(); return
    }

    val cfg: JSONObject? = if (source == "tile") UiStore.getTile(this, slot) else widgetId?.let { UiStore.getWidget(this, it) }
    var items = UiStore.arr(cfg, if (source == "tile") "menu" else "items")
    if (itemId != null) items = items.filter { it.optString("id") == itemId }

    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(16), dp(12), dp(16), dp(16))
      background = GradientDrawable().apply { setColor(Color.parseColor("#F21E2A44")); cornerRadius = dp(20).toFloat() }
      minimumWidth = dp(280)
    }
    root.addView(TextView(this).apply {
      text = cfg?.optString("label")?.takeIf { it.isNotBlank() } ?: cfg?.optString("title") ?: "EveryApp"
      setTextColor(Color.WHITE); textSize = 16f; setPadding(0, 0, 0, dp(8))
    })

    val fireEvent = { id: String, value: Double? ->
      if (source == "tile") UiStore.fire(this, "tileMenu", mapOf("slot" to slot, "tileName" to cfg?.optString("label"), "id" to id, "value" to value))
      else UiStore.fire(this, "widgetAction", mapOf("widgetId" to widgetId, "id" to id, "value" to value))
    }

    val buttons = items.filter { it.optString("type", "button") == "button" }
    if (buttons.isNotEmpty()) {
      val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
      for (b in buttons) {
        val cell = LinearLayout(this).apply {
          orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER
          setPadding(dp(10), dp(8), dp(10), dp(8))
          background = GradientDrawable().apply { setColor(Color.parseColor("#33FFFFFF")); cornerRadius = dp(14).toFloat() }
          layoutParams = LinearLayout.LayoutParams(dp(76), ViewGroup.LayoutParams.WRAP_CONTENT).apply { setMargins(dp(4), dp(4), dp(4), dp(4)) }
          isClickable = true
          setOnClickListener {
            fireEvent(b.optString("id"), if (b.has("value")) b.optDouble("value") else null)
            if (b.optBoolean("keepOpen", false).not()) finish()
          }
        }
        UiStore.iconBitmap(this, b.optString("icon").takeIf { it.isNotBlank() })?.let {
          cell.addView(ImageView(this).apply { setImageBitmap(it); layoutParams = LinearLayout.LayoutParams(dp(32), dp(32)) })
        }
        cell.addView(TextView(this).apply { text = b.optString("label", b.optString("id")); setTextColor(Color.WHITE); textSize = 12f; gravity = Gravity.CENTER; maxLines = 2 })
        row.addView(cell)
      }
      root.addView(HorizontalScrollView(this).apply { addView(row) })
    }

    for (s in items.filter { it.optString("type") == "slider" }) {
      val min = s.optDouble("min", 0.0); val max = s.optDouble("max", 100.0)
      val step = s.optDouble("step", 1.0).let { if (it <= 0) 1.0 else it }
      val steps = ((max - min) / step).roundToInt().coerceAtLeast(1)
      val start = s.optDouble("value", min)
      val fmt = { v: Double -> if (step % 1.0 == 0.0) v.roundToInt().toString() else String.format("%.1f", v) }
      val title = TextView(this).apply { setTextColor(Color.WHITE); textSize = 14f; setPadding(0, dp(10), 0, 0) }
      val label = s.optString("label", s.optString("id"))
      title.text = "$label: ${fmt(start)}"
      val bar = SeekBar(this).apply {
        this.max = steps
        progress = ((start - min) / step).roundToInt().coerceIn(0, steps)
        setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
          override fun onProgressChanged(sb: SeekBar, p: Int, fromUser: Boolean) { title.text = "$label: ${fmt(min + p * step)}" }
          override fun onStartTrackingTouch(sb: SeekBar) {}
          override fun onStopTrackingTouch(sb: SeekBar) {
            val v = min + sb.progress * step
            // remember value so the slider reopens at the last position
            s.put("value", v)
            if (source == "tile") UiStore.setTile(this@MenuActivity, slot, cfg.toString())
            else widgetId?.let { UiStore.setWidget(this@MenuActivity, it, cfg.toString()) }
            fireEvent(s.optString("id"), v)
          }
        })
      }
      root.addView(title); root.addView(bar)
    }
    if (items.isEmpty()) root.addView(TextView(this).apply { text = "Keine Einträge"; setTextColor(Color.WHITE) })
    setContentView(root)
    window?.setBackgroundDrawableResource(android.R.color.transparent)
  }
}
