package expo.modules.backgroundservice

import android.content.Context
import org.json.JSONObject

object UiStore {
  private const val PREFS = "everyapp_ui"
  const val TAG = EveryAppBackgroundService.TAG

  private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun getTile(ctx: Context, slot: Int): JSONObject? =
    prefs(ctx).getString("tile_$slot", null)?.let { parse(it) }

  fun tileSlotsFor(ctx: Context, appId: String): List<Int> =
    (1..5).filter { getTile(ctx, it)?.optString("appId") == appId }

  fun setTile(ctx: Context, slot: Int, json: String?) {
    prefs(ctx).edit().apply {
      if (json == null) remove("tile_$slot") else putString("tile_$slot", json)
    }.apply()
    if (slot in 1..5) EveryAppTileBase.refresh(ctx, slot)
  }

  fun allTiles(ctx: Context): String {
    val arr = org.json.JSONArray()
    for (slot in 1..5) {
      val raw = prefs(ctx).getString("tile_$slot", null) ?: continue
      arr.put(parse(raw) ?: JSONObject())
    }
    return arr.toString()
  }

  /** @return null on success, otherwise a copyable error string. */
  fun fire(ctx: Context, event: String, data: Map<String, Any?>): String? {
    return try {
      val strings = data.mapValues { it.value?.toString() ?: "" }
      BackgroundRuntime.wake(ctx, event, strings)
      null
    } catch (e: Throwable) {
      "${e.javaClass.name}: ${e.message}"
    }
  }

  private fun parse(raw: String): JSONObject? = try {
    JSONObject(raw)
  } catch (_: Exception) {
    null
  }
}
