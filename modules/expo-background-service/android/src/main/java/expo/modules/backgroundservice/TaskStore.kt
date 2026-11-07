package expo.modules.backgroundservice

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** Persisted background apps and triggers. Only enabled apps count toward the service gate. */
object TaskStore {
  private const val PREFS = "everyapp_tasks"

  data class BleSub(
    val appId: String,
    val deviceId: String,
    val serviceUUID: String,
    val characteristicUUID: String,
    val attempts: Int,
    val exhausted: Boolean,
    val nextAttemptAt: Long,
  ) {
    val key: String get() = "$appId|$deviceId|$characteristicUUID"
  }

  private fun prefs(ctx: Context) = ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private fun root(ctx: Context): JSONObject {
    val raw = prefs(ctx).getString("root", null) ?: return JSONObject()
    return try {
      JSONObject(raw)
    } catch (_: Exception) {
      JSONObject()
    }
  }

  private fun write(ctx: Context, root: JSONObject) {
    prefs(ctx).edit().putString("root", root.toString()).commit()
  }

  private fun apps(root: JSONObject): JSONObject {
    val existing = root.optJSONObject("apps")
    if (existing != null) return existing
    val created = JSONObject()
    root.put("apps", created)
    return created
  }

  fun setEnabled(ctx: Context, appId: String, enabled: Boolean) {
    val root = root(ctx)
    val app = apps(root).optJSONObject(appId) ?: JSONObject().also { apps(root).put(appId, it) }
    app.put("enabled", enabled)
    write(ctx, root)
    NativeLog.add(ctx, "background.${if (enabled) "enable" else "disable"} | appId=$appId")
  }

  fun setTasks(ctx: Context, appId: String, tasksJson: String): String? {
    val incoming = try {
      JSONArray(tasksJson)
    } catch (e: Exception) {
      val msg = "FEHLER registerTasks | appId=$appId | JSON: ${e.javaClass.name}: ${e.message}"
      NativeLog.add(ctx, msg)
      return msg
    }
    val previousBle = bleSubs(ctx, enabledOnly = false).filter { it.appId == appId }.associateBy { it.key }
    val sanitized = JSONArray()
    val warnings = mutableListOf<String>()
    for (i in 0 until incoming.length()) {
      val item = incoming.optJSONObject(i) ?: continue
      val type = item.optString("type")
      val copy = JSONObject()
      copy.put("type", type)
      if (item.has("action")) copy.put("action", item.opt("action"))
      when (type) {
        "interval" -> {
          val requested = item.optLong("everyMs", ServicePolicy.MIN_INTERVAL_MS)
          val clamped = requested.coerceIn(ServicePolicy.MIN_INTERVAL_MS, 24L * 60L * 60L * 1000L)
          if (clamped != requested) warnings.add("interval everyMs $requested -> $clamped")
          copy.put("everyMs", clamped)
        }
        "wifiChanged", "bluetooth", "boot" -> Unit
        "bleNotify" -> {
          val deviceId = item.optString("deviceId")
          val serviceUUID = item.optString("serviceUUID")
          val characteristicUUID = item.optString("characteristicUUID")
          if (deviceId.isBlank() || serviceUUID.isBlank() || characteristicUUID.isBlank()) {
            warnings.add("bleNotify ohne deviceId/serviceUUID/characteristicUUID übersprungen")
            continue
          }
          copy.put("deviceId", deviceId)
          copy.put("serviceUUID", serviceUUID)
          copy.put("characteristicUUID", characteristicUUID)
          val key = "$appId|$deviceId|$characteristicUUID"
          val prev = previousBle[key]
          copy.put("attempts", prev?.attempts ?: 0)
          copy.put("exhausted", prev?.exhausted ?: false)
          copy.put("nextAttemptAt", prev?.nextAttemptAt ?: 0L)
        }
        else -> {
          warnings.add("unbekannter Task-Typ \"$type\" übersprungen")
          continue
        }
      }
      sanitized.put(copy)
    }
    val root = root(ctx)
    val app = apps(root).optJSONObject(appId) ?: JSONObject().also { apps(root).put(appId, it) }
    app.put("tasks", sanitized)
    write(ctx, root)
    val warning = warnings.joinToString("; ").ifBlank { null }
    NativeLog.add(ctx, "registerTasks | appId=$appId | ${sanitized.length()} Task(s)${warning?.let { " | $it" } ?: ""}")
    return warning
  }

  fun enabledAppIds(ctx: Context): List<String> {
    val apps = root(ctx).optJSONObject("apps") ?: return emptyList()
    return apps.keys().asSequence().filter { apps.optJSONObject(it)?.optBoolean("enabled") == true }.toList()
  }

  fun snapshot(ctx: Context): String = root(ctx).toString()

  private fun enabledTasks(ctx: Context): List<Pair<String, JSONObject>> {
    val apps = root(ctx).optJSONObject("apps") ?: return emptyList()
    val out = mutableListOf<Pair<String, JSONObject>>()
    for (key in apps.keys()) {
      val app = apps.optJSONObject(key) ?: continue
      if (!app.optBoolean("enabled")) continue
      val tasks = app.optJSONArray("tasks") ?: continue
      for (i in 0 until tasks.length()) {
        val task = tasks.optJSONObject(i) ?: continue
        out.add(key to task)
      }
    }
    return out
  }

  fun intervalCount(ctx: Context): Int = enabledTasks(ctx).count { it.second.optString("type") == "interval" }

  fun minIntervalMs(ctx: Context): Long? {
    val values = enabledTasks(ctx).filter { it.second.optString("type") == "interval" }
      .map { it.second.optLong("everyMs", ServicePolicy.MIN_INTERVAL_MS) }
    return values.minOrNull()
  }

  fun wifiCount(ctx: Context): Int = enabledTasks(ctx).count { it.second.optString("type") == "wifiChanged" }

  fun bleSubs(ctx: Context, enabledOnly: Boolean = true): List<BleSub> {
    val apps = root(ctx).optJSONObject("apps") ?: return emptyList()
    val out = mutableListOf<BleSub>()
    for (appId in apps.keys()) {
      val app = apps.optJSONObject(appId) ?: continue
      if (enabledOnly && !app.optBoolean("enabled")) continue
      val tasks = app.optJSONArray("tasks") ?: continue
      for (i in 0 until tasks.length()) {
        val task = tasks.optJSONObject(i) ?: continue
        if (task.optString("type") != "bleNotify") continue
        out.add(
          BleSub(
            appId = appId,
            deviceId = task.optString("deviceId"),
            serviceUUID = task.optString("serviceUUID"),
            characteristicUUID = task.optString("characteristicUUID"),
            attempts = task.optInt("attempts", 0),
            exhausted = task.optBoolean("exhausted", false),
            nextAttemptAt = task.optLong("nextAttemptAt", 0L),
          )
        )
      }
    }
    return out
  }

  fun saveBle(ctx: Context, updated: List<BleSub>) {
    val byKey = updated.associateBy { it.key }
    val root = root(ctx)
    val apps = root.optJSONObject("apps") ?: return
    for (appId in apps.keys()) {
      val app = apps.optJSONObject(appId) ?: continue
      val tasks = app.optJSONArray("tasks") ?: continue
      for (i in 0 until tasks.length()) {
        val task = tasks.optJSONObject(i) ?: continue
        if (task.optString("type") != "bleNotify") continue
        val key = "$appId|${task.optString("deviceId")}|${task.optString("characteristicUUID")}"
        val sub = byKey[key] ?: continue
        task.put("attempts", sub.attempts)
        task.put("exhausted", sub.exhausted)
        task.put("nextAttemptAt", sub.nextAttemptAt)
      }
    }
    write(ctx, root)
  }

  fun counts(ctx: Context, now: Long = System.currentTimeMillis()): ServicePolicy.Counts {
    val subs = bleSubs(ctx)
    val due = subs.count { !it.exhausted && it.nextAttemptAt <= now }
    val waiting = subs.count { !it.exhausted && it.nextAttemptAt > now }
    val exhausted = subs.count { it.exhausted }
    return ServicePolicy.Counts(
      intervalCount = intervalCount(ctx),
      dueOrConnectedBle = due,
      waitingBle = waiting,
      exhaustedBle = exhausted,
      wifiWatchers = wifiCount(ctx),
    )
  }
}
