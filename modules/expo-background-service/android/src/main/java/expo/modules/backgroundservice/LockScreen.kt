package expo.modules.backgroundservice

import android.app.KeyguardManager
import android.content.Context
import org.json.JSONObject

/**
 * Lock-screen policy. A tile/popup runs over the lock screen only if
 *  1) its config sets allowLocked:true (tile or its popup), AND
 *  2) the user granted "Sperrbildschirm" once for that mini-app (persisted here, set via lockGrantSet from EveryApp UI).
 * Off by default; mini-apps cannot grant themselves (grant only via the in-app confirmation dialog).
 */
object LockScreen {
  private const val PREFS = "everyapp_lockgrant"

  fun keyguard(ctx: Context) = ctx.getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
  fun isLocked(ctx: Context) = keyguard(ctx)?.isKeyguardLocked == true
  fun isSecure(ctx: Context) = keyguard(ctx)?.isKeyguardSecure == true

  fun isGranted(ctx: Context, appId: String?): Boolean =
    appId != null && ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("grant_$appId", false)

  fun setGranted(ctx: Context, appId: String, granted: Boolean) {
    ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().apply {
      if (granted) putBoolean("grant_$appId", true) else remove("grant_$appId")
    }.apply()
    NativeLog.add(ctx, "Sperrbildschirm-Freigabe für \"$appId\": ${if (granted) "ERTEILT" else "ENTZOGEN"}")
  }

  /** Requested by config (tile.allowLocked or tile.popup.allowLocked). */
  fun requested(cfg: JSONObject?): Boolean =
    cfg?.optBoolean("allowLocked", false) == true || cfg?.optJSONObject("popup")?.optBoolean("allowLocked", false) == true

  fun appIdOf(cfg: JSONObject?): String? =
    cfg?.optString("appId")?.takeIf { it.isNotBlank() } ?: cfg?.optJSONObject("popup")?.optString("appId")?.takeIf { it.isNotBlank() }
}
