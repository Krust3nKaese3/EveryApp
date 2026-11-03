package expo.modules.backgroundservice

import android.content.Context
import android.content.Intent
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import android.util.Log
import com.facebook.react.HeadlessJsTaskService

/** Base for the 5 statically declared Quick Settings tiles. Label comes from SharedPreferences (set via JS setTileLabel). */
open class EveryAppTileBase(private val index: Int) : TileService() {
  override fun onStartListening() {
    super.onStartListening()
    val tile = qsTile ?: return
    val label = labelFor(this, index)
    tile.label = label ?: "EveryApp $index"
    tile.state = if (label != null) Tile.STATE_INACTIVE else Tile.STATE_UNAVAILABLE
    tile.updateTile()
  }

  override fun onClick() {
    super.onClick()
    val label = labelFor(this, index)
    Log.i(EveryAppBackgroundService.TAG, "[EveryApp] quickTile $index ($label) clicked")
    if (label == null) return
    qsTile?.let { it.state = Tile.STATE_ACTIVE; it.updateTile() }
    val i = Intent(this, MacroHeadlessTaskService::class.java).apply {
      putExtra("event", "quickTile")
      putExtra("tileIndex", index.toDouble())
      putExtra("tileName", label)
      putExtra("time", System.currentTimeMillis().toDouble())
    }
    try {
      startService(i)
      HeadlessJsTaskService.acquireWakeLockNow(this)
    } catch (e: Exception) {
      Log.e(EveryAppBackgroundService.TAG, "[EveryApp] FEHLER quickTile-Task: ${e.javaClass.simpleName}: ${e.message}", e)
    }
    qsTile?.let { it.state = Tile.STATE_INACTIVE; it.updateTile() }
  }

  companion object {
    const val PREFS = "everyapp_tiles"
    fun labelFor(ctx: Context, index: Int): String? =
      ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("label_$index", null)

    fun setLabel(ctx: Context, index: Int, label: String?) {
      ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().apply {
        if (label == null) remove("label_$index") else putString("label_$index", label)
      }.apply()
      val cls = when (index) { 1 -> EveryAppTile1::class.java; 2 -> EveryAppTile2::class.java; 3 -> EveryAppTile3::class.java
        4 -> EveryAppTile4::class.java; else -> EveryAppTile5::class.java }
      try { TileService.requestListeningState(ctx, android.content.ComponentName(ctx, cls)) } catch (e: Exception) {}
    }
  }
}

class EveryAppTile1 : EveryAppTileBase(1)
class EveryAppTile2 : EveryAppTileBase(2)
class EveryAppTile3 : EveryAppTileBase(3)
class EveryAppTile4 : EveryAppTileBase(4)
class EveryAppTile5 : EveryAppTileBase(5)
