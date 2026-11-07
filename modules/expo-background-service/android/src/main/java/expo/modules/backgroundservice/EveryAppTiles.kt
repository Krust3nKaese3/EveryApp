package expo.modules.backgroundservice

import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import android.util.Log
import org.json.JSONObject

open class EveryAppTileBase(private val index: Int) : TileService() {
  override fun onStartListening() {
    val cfg = UiStore.getTile(this, index)
    val tile = qsTile ?: return
    val label = cfg?.optString("label")?.takeIf { it.isNotBlank() } ?: "EveryApp $index"
    tile.label = label
    if (Build.VERSION.SDK_INT >= 29) tile.subtitle = cfg?.optString("subtitle").orEmpty()
    tile.state = when (cfg?.optString("state")) {
      "active" -> Tile.STATE_ACTIVE
      "unavailable" -> Tile.STATE_UNAVAILABLE
      else -> Tile.STATE_INACTIVE
    }
    tile.updateTile()
  }

  override fun onClick() {
    val cfg = UiStore.getTile(this, index)
    val label = cfg?.optString("label")?.takeIf { it.isNotBlank() } ?: labelFor(index)
    Log.i(EveryAppBackgroundService.TAG, "[EveryApp] quickTile $index ($label) clicked")
    if (label == null) return
    val locked = try {
      isLocked
    } catch (_: Throwable) {
      LockScreen.isLocked(this)
    }
    if (!locked) {
      doClick(cfg, label, false)
      return
    }
    val appId = LockScreen.appIdOf(cfg)
    val requested = LockScreen.requested(cfg)
    val granted = LockScreen.isGranted(this, appId)
    val secure = try {
      isSecure
    } catch (_: Throwable) {
      LockScreen.isSecure(this)
    }
    val isMenu = cfg?.optJSONObject("popup") == null && (cfg?.optJSONArray("menu")?.length() ?: 0) > 0
    val allowed = requested && granted && !isMenu
    val path = when {
      allowed -> "direkt (Sperrbildschirm)"
      secure -> "unlockAndRun"
      else -> "direkt (keine sichere Sperre)"
    }
    NativeLog.add(
      this,
      "Kachel $index ($label) gesperrt=true sicher=$secure allowLocked=$requested freigegeben=$granted appId=${appId ?: "null"}${if (isMenu) " menu=ja(nie gesperrt)" else ""} -> $path" +
        (if (requested && !granted) " | HINWEIS: allowLocked gesetzt, aber Freigabe fehlt – EveryApp öffnen und Sperrbildschirm-Dialog bestätigen" else ""),
    )
    when {
      allowed -> doClick(cfg, label, true)
      secure -> try {
        unlockAndRun { doClick(cfg, label, false) }
      } catch (e: Throwable) {
        NativeLog.add(this, "FEHLER Kachel $index unlockAndRun: ${e.javaClass.name}: ${e.message}")
      }
      else -> doClick(cfg, label, false)
    }
  }

  private fun doClick(cfg: JSONObject?, label: String, overLock: Boolean) {
    val menu = cfg?.optJSONArray("menu")
    val popup = cfg?.optJSONObject("popup")
    if (popup != null || (menu != null && menu.length() > 0)) {
      if (popup == null) {
        NativeLog.add(this, "Kachel $index: Menü ohne Popup, Event quickTile (Menüs nie über der Sperre)")
        val err = try {
          UiStore.fire(this, "quickTile", mapOf("tileIndex" to index, "tileName" to label, "menu" to "1"))
        } catch (e: Throwable) {
          "${e.javaClass.name}: ${e.message}"
        }
        if (err != null) NativeLog.add(this, "FEHLER Kachel $index Task-Start (overLock=$overLock): $err")
        return
      }
      val intent = PopupActivity.open(this, popup.toString(), index, null, overLock)
      try {
        if (Build.VERSION.SDK_INT >= 34) {
          val pi = PendingIntent.getActivity(
            this,
            index,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
          )
          startActivityAndCollapse(pi)
        } else {
          @Suppress("DEPRECATION")
          startActivityAndCollapse(intent)
        }
        if (overLock) NativeLog.add(this, "Kachel $index: Popup über Sperrbildschirm gestartet")
      } catch (e: Exception) {
        Log.e(EveryAppBackgroundService.TAG, "[EveryApp] FEHLER Tile-Menü öffnen: ${e.message}", e)
        NativeLog.add(this, "FEHLER Kachel $index Popup/Menü öffnen (overLock=$overLock): ${e.javaClass.name}: ${e.message}")
      }
      return
    }
    val err = try {
      UiStore.fire(this, "quickTile", mapOf("tileIndex" to index, "tileName" to label))
    } catch (e: Throwable) {
      "${e.javaClass.name}: ${e.message}"
    }
    if (err != null) NativeLog.add(this, "FEHLER Kachel $index Task-Start (overLock=$overLock): $err")
    else if (overLock) NativeLog.add(this, "Kachel $index: Aktion im gesperrten Zustand an Headless-Task übergeben")
  }

  private fun labelFor(index: Int): String = qsTile?.label?.toString() ?: "Kachel $index"

  companion object {
    fun refresh(ctx: Context, slot: Int) {
      val cls = when (slot) {
        1 -> EveryAppTile1::class.java
        2 -> EveryAppTile2::class.java
        3 -> EveryAppTile3::class.java
        4 -> EveryAppTile4::class.java
        5 -> EveryAppTile5::class.java
        else -> return
      }
      try {
        requestListeningState(ctx, ComponentName(ctx, cls))
      } catch (e: Throwable) {
        NativeLog.add(ctx, "FEHLER Kachel $slot refresh: ${e.javaClass.name}: ${e.message}")
      }
    }
  }
}

class EveryAppTile1 : EveryAppTileBase(1)
class EveryAppTile2 : EveryAppTileBase(2)
class EveryAppTile3 : EveryAppTileBase(3)
class EveryAppTile4 : EveryAppTileBase(4)
class EveryAppTile5 : EveryAppTileBase(5)
