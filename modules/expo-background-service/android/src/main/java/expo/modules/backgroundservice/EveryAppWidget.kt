package expo.modules.backgroundservice

import android.app.Activity
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.util.Log
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.RemoteViews
import android.widget.TextView

/**
 * Home screen widgets. Config (UiStore "widget_<id>"): { id, title?, size: "small"|"large", columns?, items: [
 *   {type:"button", id, icon, label, value?} | {type:"slider", id, label, icon?, min, max, step, value} ] }
 * Button tap -> MenuActivity(fire) -> 'widgetAction' trigger. Slider tap -> MenuActivity with real SeekBar.
 */
open class EveryAppWidgetBase : AppWidgetProvider() {
  override fun onUpdate(context: Context, mgr: AppWidgetManager, ids: IntArray) {
    for (id in ids) render(context, mgr, id)
  }

  override fun onAppWidgetOptionsChanged(context: Context, mgr: AppWidgetManager, id: Int, newOptions: Bundle?) {
    render(context, mgr, id)
  }

  override fun onDeleted(context: Context, ids: IntArray) { for (id in ids) UiStore.setInstance(context, id, null) }

  companion object {
    fun allInstanceIds(ctx: Context): List<Int> {
      val mgr = AppWidgetManager.getInstance(ctx)
      return listOf(EveryAppWidgetSmall::class.java, EveryAppWidgetLarge::class.java)
        .flatMap { mgr.getAppWidgetIds(ComponentName(ctx, it)).toList() }
    }

    fun updateAll(ctx: Context) {
      val mgr = AppWidgetManager.getInstance(ctx)
      for (id in allInstanceIds(ctx)) render(ctx, mgr, id)
    }

    fun render(ctx: Context, mgr: AppWidgetManager, appWidgetId: Int) {
      try {
        val ids = UiStore.widgetIds(ctx)
        val cfgId = UiStore.getInstance(ctx, appWidgetId)?.takeIf { ids.contains(it) } ?: ids.firstOrNull()
        val cfg = cfgId?.let { UiStore.getWidget(ctx, it) }
        val views = RemoteViews(ctx.packageName, R.layout.ea_widget_root)
        views.removeAllViews(R.id.ea_widget_rows)
        val title = cfg?.optString("title")?.takeIf { it.isNotBlank() }
        views.setViewVisibility(R.id.ea_widget_title, if (title != null) View.VISIBLE else View.GONE)
        views.setTextViewText(R.id.ea_widget_title, title ?: "")
        val items = UiStore.arr(cfg, "items")
        if (cfg == null || items.isEmpty()) {
          val row = RemoteViews(ctx.packageName, R.layout.ea_widget_row)
          val item = RemoteViews(ctx.packageName, R.layout.ea_widget_item)
          item.setTextViewText(R.id.ea_item_label, if (cfg == null) "Kein Widget konfiguriert" else "Keine Einträge")
          row.addView(R.id.ea_widget_row, item)
          views.addView(R.id.ea_widget_rows, row)
        } else {
          val cols = cfg.optInt("columns", if (cfg.optString("size") == "small") 4 else 4).coerceIn(1, 6)
          items.chunked(cols).forEachIndexed { r, chunk ->
            val row = RemoteViews(ctx.packageName, R.layout.ea_widget_row)
            chunk.forEachIndexed { c, it ->
              val item = RemoteViews(ctx.packageName, R.layout.ea_widget_item)
              val isSlider = it.optString("type") == "slider"
              val label = it.optString("label", it.optString("id")) + if (isSlider && it.has("value")) " ${it.optDouble("value").let { v -> if (v % 1.0 == 0.0) v.toInt().toString() else v.toString() }}" else ""
              item.setTextViewText(R.id.ea_item_label, label)
              val iconSpec = it.optString("icon").takeIf { s -> s.isNotBlank() } ?: if (isSlider) "volume_up" else null
              UiStore.iconBitmap(ctx, iconSpec, 72)?.let { b -> item.setImageViewBitmap(R.id.ea_item_icon, b) }
              if (it.optString("state") == "on") item.setInt(R.id.ea_item, "setBackgroundColor", Color.parseColor("#662196F3"))
              val intent = Intent(ctx, MenuActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_ANIMATION)
                putExtra(MenuActivity.EXTRA_SOURCE, "widget")
                putExtra(MenuActivity.EXTRA_WIDGET, cfgId)
                putExtra(MenuActivity.EXTRA_ITEM, it.optString("id"))
                if (!isSlider) {
                  putExtra(MenuActivity.EXTRA_FIRE, true)
                  if (it.has("value")) putExtra(MenuActivity.EXTRA_VALUE, it.optDouble("value"))
                }
              }
              val req = appWidgetId * 100 + r * 10 + c
              val pi = PendingIntent.getActivity(ctx, req, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
              item.setOnClickPendingIntent(R.id.ea_item, pi)
              row.addView(R.id.ea_widget_row, item)
            }
            views.addView(R.id.ea_widget_rows, row)
          }
        }
        mgr.updateAppWidget(appWidgetId, views)
      } catch (e: Exception) {
        Log.e(UiStore.TAG, "[EveryApp] FEHLER Widget $appWidgetId render: ${e.message}", e)
      }
    }
  }
}

class EveryAppWidgetSmall : EveryAppWidgetBase()
class EveryAppWidgetLarge : EveryAppWidgetBase()

/** Lets the user pick which widget config (from macros) a placed widget shows. */
class WidgetConfigActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val appWidgetId = intent?.extras?.getInt(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
      ?: AppWidgetManager.INVALID_APPWIDGET_ID
    setResult(RESULT_CANCELED, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId))
    val ids = UiStore.widgetIds(this)
    val done = { cfgId: String? ->
      if (cfgId != null) UiStore.setInstance(this, appWidgetId, cfgId)
      EveryAppWidgetBase.render(this, AppWidgetManager.getInstance(this), appWidgetId)
      setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId))
      finish()
    }
    if (ids.size <= 1) { done(ids.firstOrNull()); return }
    val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(40, 40, 40, 40) }
    root.addView(TextView(this).apply { text = "Welches Widget anzeigen?"; textSize = 18f })
    for (id in ids) {
      val title = UiStore.getWidget(this, id)?.optString("title")?.takeIf { it.isNotBlank() } ?: id
      root.addView(Button(this).apply { text = title; setOnClickListener { done(id) } })
    }
    setContentView(root)
  }
}
