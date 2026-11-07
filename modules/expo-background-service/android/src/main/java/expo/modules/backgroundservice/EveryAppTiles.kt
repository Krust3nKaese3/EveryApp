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
 * { label, icon, state: "on"|"off"|"active"|"inactive"|"unavailable", subtitle? (Android 10+), popup?: {popup spec}, menu?: [ {type:"button",id,icon,label} | {type:"slider",id,label,min,max,step,value} ] }
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
      if (Build.VERSION.SDK_INT >= 29) tile.subtitle = cfg?.optString("subtitle")?.takeIf { it.isNotBlank() }
      UiStore.iconBitmap(this, cfg?.optString("icon")?.takeIf { it.isNotBlank() })?.let { tile.icon = Icon.createWithBitmap(UiStore.alphaMask(it)) }
      tile.state = when {
        label == null -> Tile.STATE_UNAVAILABLE
        cfg?.optString("state") == "unavailable" -> Tile.STATE_UNAVAILABLE
        cfg?.optString("state") == "on" || cfg?.optString("state") == "active" -> Tile.STATE_ACTIVE
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
    val locked = try { isLocked } catch (e: Throwable) { LockScreen.isLocked(this) }
    if (!locked) { doClick(cfg, label, false); return }
    val appId = LockScreen.appIdOf(cfg)
    val requested = LockScreen.requested(cfg)
    val granted = LockScreen.isGranted(this, appId)
    val secure = try { isSecure } catch (e: Throwable) { LockScreen.isSecure(this) }
    val isMenu = cfg?.optJSONObject("popup") == null && (cfg?.optJSONArray("menu")?.length() ?: 0) > 0
    val allowed = requested && granted && !isMenu
    val path = when { allowed -> "direkt (Sperrbildschirm)"; secure -> "unlockAndRun"; else -> "direkt (keine sichere Sperre)" }
    NativeLog.add(this, "Kachel $index ($label) gesperrt=true sicher=$secure allowLocked=$requested freigegeben=$granted appId=${appId ?: "null"}${if (isMenu) " menu=ja(nie gesperrt)" else ""} -> $path" +
      (if (requested && !granted) " | HINWEIS: allowLocked gesetzt, aber Freigabe fehlt – EveryApp öffnen und Sperrbildschirm-Dialog bestätigen" else ""))
    when {
      allowed -> doClick(cfg, label, true)
      secure -> try { unlockAndRun { doClick(cfg, label, false) } } catch (e: Throwable) {
        NativeLog.add(this, "FEHLER Kachel $index unlockAndRun: ${e.javaClass.name}: ${e.message}")
      }
      else -> doClick(cfg, label, false)
    }
  }

  private fun doClick(cfg: org.json.JSONObject?, label: String, overLock: Boolean) {
    val menu = cfg?.optJSONArray("menu")
    val popup = cfg?.optJSONObject("popup")
    if (popup != null || (menu != null && menu.length() > 0)) {
      val intent = if (popup != null) PopupActivity.open(this, popup.toString(), index, null, overLock) else Intent(this, MenuActivity::class.java).apply {
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
        if (overLock) NativeLog.add(this, "Kachel $index: Popup über Sperrbildschirm gestartet")
      } catch (e: Exception) {
        Log.e(EveryAppBackgroundService.TAG, "[EveryApp] FEHLER Tile-Menü öffnen: ${e.message}", e)
        NativeLog.add(this, "FEHLER Kachel $index Popup/Menü öffnen (overLock=$overLock): ${e.javaClass.name}: ${e.message}")
      }
      return
    }
    val err = try { UiStore.fire(this, "quickTile", mapOf("tileIndex" to index, "tileName" to label)) } catch (e: Throwable) { "${e.javaClass.name}: ${e.message}" }
    if (err != null) NativeLog.add(this, "FEHLER Kachel $index Task-Start (overLock=$overLock): $err")
    else if (overLock) NativeLog.add(this, "Kachel $index: Aktion im gesperrten Zustand an Headless-Task übergeben")
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
