package expo.modules.backgroundservice

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

object EventQueue {
  private const val PREFS = "everyapp_bg_events"
  private const val MAX = 50

  fun appendForEnabled(ctx: Context, event: String, dataJson: String) {
    val apps = TaskStore.enabledAppIds(ctx)
    if (apps.isEmpty()) {
      NativeLog.add(ctx, "EVENT VERWORFEN | $event | keine Mini-App mit background.enable | data=$dataJson")
      return
    }
    for (appId in apps) append(ctx, appId, event, dataJson)
  }

  fun append(ctx: Context, appId: String, event: String, dataJson: String) {
    val prefs = ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    synchronized(this) {
      val arr = try {
        JSONArray(prefs.getString(appId, "[]"))
      } catch (_: Exception) {
        JSONArray()
      }
      arr.put(JSONObject().put("event", event).put("dataJson", dataJson).put("at", System.currentTimeMillis()))
      while (arr.length() > MAX) arr.remove(0)
      prefs.edit().putString(appId, arr.toString()).commit()
    }
  }

  fun drain(ctx: Context, appId: String): String {
    val prefs = ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    synchronized(this) {
      val raw = prefs.getString(appId, "[]") ?: "[]"
      prefs.edit().remove(appId).commit()
      return raw
    }
  }
}
