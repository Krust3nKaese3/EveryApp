package expo.modules.backgroundservice

import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.drawable.Icon
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import android.util.Log

/**
 * Base for the 5 statically declared Quick Settings tiles. Config (JSON in UiStore "tile_<n>"):
 * { label, icon, state: "on"|"off", subtitle?, menu?: [ {type:"button",id,icon,label} | {type:"slider",id,label,min,max,step,value} ] }
 * Legacy: plain label from setTileLabel (quickTile name).
 */
open class EveryAppTileBase(private val index: Int) : TileService() {
  override fun onStartListening() {
    super.onStartListening()
    render()
  }

  private fun render() {
    val tile = qsTile ?: return
    try {
      val cfg = UiStore.getTile(this, index)
      val label = cfg?.optString("label")?.takeIf { it.isNotBlank() } ?: labelFor(this, index)
      tile.label = label ?: "EveryApp $index"
      UiStore.iconBitmap(this, cfg?.optString("icon")?.takeIf { it.isNotBlank() })?.let { tile.icon = Icon.createWithBitmap(it) }
      if (Build.VERSION.SDK_INT >= 29) tile.subtitle = cfg?.optString("subtitle")?.takeIf { it.isNotBlank() }
      tile.state = when {
        label == null -> Tile.STATE_UNAVAILABLE
        cfg?.optString("state") == "on" -> Tile.STATE_ACTIVE
        else -> Tile.STATE_INACTIVE
      }
      tile.updateTile()
    } catch (e: Exception) {
      Log.e(EveryAppBackgroundService.TAG, "[EveryApp] FEHLER Tile $index render: ${e.message}", e)
    }
  }

  override fun onClick() {
    super.onClick()
    val cfg = UiStore.getTile(this, index)
    val label = cfg?.optString("label")?.takeIf { it.isNotBlank() } ?: labelFor(this, index)
    Log.i(EveryAppBackgroundService.TAG, "[EveryApp] quickTile $index ($label) clicked")
    if (label == null) return
    val menu = cfg?.optJSONArray("menu")
    if (menu != null && menu.length() > 0) {
      val intent = Intent(this, MenuActivity::class.java).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        putExtra(MenuActivity.EXTRA_SOURCE, "tile")
        putExtra(MenuActivity.EXTRA_SLOT, index)
      }
      try {
        if (Build.VERSION.SDK_INT >= 34) {
          val pi = PendingIntent.getActivity(this, 100 + index, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
          startActivityAndCollapse(pi)
        } else {
          @Suppress("DEPRECATION") startActivityAndCollapse(intent)
        }
      } catch (e: Exception) {
        Log.e(EveryAppBackgroundService.TAG, "[EveryApp] FEHLER Tile-Menü öffnen: ${e.message}", e)
      }
      return
    }
    UiStore.fire(this, "quickTile", mapOf("tileIndex" to index, "tileName" to label))
  }

  companion object {
    const val PREFS = "everyapp_tiles"
    fun labelFor(ctx: Context, index: Int): String? =
      ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("label_$index", null)

    fun setLabel(ctx: Context, index: Int, label: String?) {
      ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().apply {
        if (label == null) remove("label_$index") else putString("label_$index", label)
      }.apply()
      refresh(ctx, index)
    }

    fun refresh(ctx: Context, index: Int) {
      val cls = when (index) { 1 -> EveryAppTile1::class.java; 2 -> EveryAppTile2::class.java; 3 -> EveryAppTile3::class.java
        4 -> EveryAppTile4::class.java; else -> EveryAppTile5::class.java }
      try { TileService.requestListeningState(ctx, ComponentName(ctx, cls)) } catch (e: Exception) {
        Log.w(EveryAppBackgroundService.TAG, "[EveryApp] requestListeningState $index: ${e.message}")
      }
    }
  }
}

class EveryAppTile1 : EveryAppTileBase(1)
class EveryAppTile2 : EveryAppTileBase(2)
class EveryAppTile3 : EveryAppTileBase(3)
class EveryAppTile4 : EveryAppTileBase(4)
class EveryAppTile5 : EveryAppTileBase(5)
