package expo.modules.spotify

import android.content.Context
import android.util.Log
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/** German user-facing strings. Keep in sync with src/services/spotifyClientId.ts. */
object SpotifyText {
  const val NO_CLIENT_ID = "Keine Spotify Client ID hinterlegt. Bitte in den EveryApp-Einstellungen eintragen."
  const val BAD_CLIENT_ID = "Die Spotify Client ID muss 32 Hex-Zeichen aus dem Developer Dashboard sein."
  const val NOT_INSTALLED = "Spotify ist nicht installiert. Bitte die Spotify-App aus dem Play Store installieren und dich dort anmelden."
  const val NOT_PREMIUM = "Dieser Spotify-Account hat kein Premium. Einen bestimmten Song abspielen geht nur mit Premium."
  const val DISCONNECTED = "Verbindung zu Spotify getrennt."
  const val NOT_CONNECTED = "Nicht mit Spotify verbunden. Bitte spotify.connect() aufrufen."
  const val NEED_LOGIN = "Spotify ist nicht angemeldet. Bitte zuerst spotify.login() aufrufen."
  const val AUTH_CANCELLED = "Spotify-Anmeldung abgebrochen."
  const val AUTH_DENIED = "Die Spotify-Anmeldung wurde abgelehnt."
  const val AUTH_FAILED = "Spotify-Anmeldung fehlgeschlagen. Client ID, Redirect-URI everyapp://spotify-callback und den SHA1 im Spotify-Dashboard prüfen."
  const val NOT_AUTHORIZED = "Spotify hat die Fernsteuerung nicht erlaubt. Bitte die Anmeldung bestätigen."
  const val NOT_LOGGED_IN = "In der Spotify-App ist niemand angemeldet. Bitte Spotify öffnen und anmelden."
  const val OFFLINE = "Spotify ist im Offline-Modus. Bitte online gehen und es erneut versuchen."
  const val BAD_URI = "Ungültige Spotify-URI. Erwartet wird zum Beispiel spotify:track:…"
  const val NO_ACTIVITY = "Spotify-Anmeldung geht nur, solange EveryApp im Vordergrund ist."
  const val RATE_LIMIT = "Spotify-API-Limit erreicht. Bitte kurz warten und erneut versuchen."
  const val QUERY_MISSING = "Suchbegriff fehlt."
  const val QUERY_LONG = "Suchbegriff ist zu lang."
}

class SpotifyUserException(message: String) : Exception(message)

object SpotifyLog {
  fun add(ctx: Context, text: String) {
    Log.i("EveryAppNative", "Spotify $text")
    try {
      val k = Class.forName("expo.modules.backgroundservice.NativeLog")
      k.getMethod("add", Context::class.java, String::class.java)
        .invoke(k.getField("INSTANCE").get(null), ctx.applicationContext, "Spotify $text")
    } catch (_: Throwable) {
    }
  }
}

/**
 * Container-private client id. Precedence matches src/services/spotifyClientId.ts:
 * settings (EveryApp UI) > bridge (mini-app setClientId) > prefill (build extra / env).
 */
object SpotifyClientIdStore {
  private const val PREFS = "everyapp_spotify"
  const val SETTINGS = "settings_client_id"
  const val BRIDGE = "bridge_client_id"
  const val PREFILL = "prefill_client_id"
  private val ID_RE = Regex("^[0-9a-fA-F]{32}$")

  data class Resolved(val clientId: String?, val source: String)

  private fun prefs(ctx: Context) =
    ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun read(ctx: Context, key: String): String = prefs(ctx).getString(key, "")?.trim().orEmpty()

  fun resolve(ctx: Context): Resolved {
    val settings = read(ctx, SETTINGS)
    val bridge = read(ctx, BRIDGE)
    val prefill = read(ctx, PREFILL)
    return when {
      settings.isNotEmpty() -> Resolved(settings, "settings")
      bridge.isNotEmpty() -> Resolved(bridge, "bridge")
      prefill.isNotEmpty() -> Resolved(prefill, "prefill")
      else -> Resolved(null, "none")
    }
  }

  fun require(ctx: Context): String = resolve(ctx).clientId ?: throw SpotifyUserException(SpotifyText.NO_CLIENT_ID)

  fun snapshot(ctx: Context): Map<String, String> {
    val resolved = resolve(ctx)
    return mapOf(
      "clientId" to (resolved.clientId ?: ""),
      "source" to resolved.source,
      "settingsClientId" to read(ctx, SETTINGS),
      "bridgeClientId" to read(ctx, BRIDGE),
      "prefillClientId" to read(ctx, PREFILL),
    )
  }

  fun normalize(raw: String?, allowEmpty: Boolean): String {
    val value = raw?.trim().orEmpty()
    if (value.isEmpty()) {
      if (allowEmpty) return ""
      throw SpotifyUserException(SpotifyText.NO_CLIENT_ID)
    }
    if (!ID_RE.matches(value)) throw SpotifyUserException(SpotifyText.BAD_CLIENT_ID)
    return value
  }

  /** @return true when the id that login/connect/play will use actually changed */
  fun write(ctx: Context, key: String, raw: String?): Boolean {
    val value = normalize(raw, allowEmpty = true)
    if (read(ctx, key) == value) return false
    val before = resolve(ctx).clientId
    prefs(ctx).edit().putString(key, value).commit()
    val after = resolve(ctx)
    val changed = before != after.clientId
    if (changed) SpotifyLog.add(ctx, "Client-ID wirksam geändert (Quelle ${after.source}), Web-API-Tokens gelöscht")
    else SpotifyLog.add(ctx, "Client-ID gespeichert ($key), wirksam bleibt ${after.source}")
    return changed
  }
}

object SpotifyTokenStore {
  private const val ACCESS = "access_token"
  private const val REFRESH = "refresh_token"
  private const val EXPIRES = "expires_at"

  private fun prefs(ctx: Context) =
    ctx.applicationContext.getSharedPreferences("everyapp_spotify", Context.MODE_PRIVATE)

  fun hasSession(ctx: Context): Boolean {
    val p = prefs(ctx)
    if (!p.getString(REFRESH, "").isNullOrBlank()) return true
    val access = p.getString(ACCESS, "")
    return !access.isNullOrBlank() && System.currentTimeMillis() < p.getLong(EXPIRES, 0L)
  }

  fun freshAccess(ctx: Context): String? {
    val p = prefs(ctx)
    val access = p.getString(ACCESS, "")?.trim().orEmpty()
    if (access.isEmpty()) return null
    if (System.currentTimeMillis() < p.getLong(EXPIRES, 0L) - 60_000L) return access
    return null
  }

  fun refreshToken(ctx: Context): String? = prefs(ctx).getString(REFRESH, "")?.trim()?.ifEmpty { null }

  fun save(ctx: Context, access: String, refresh: String?, expiresInSec: Int) {
    val expiresAt = System.currentTimeMillis() + expiresInSec.coerceAtLeast(30) * 1000L
    val editor = prefs(ctx).edit().putString(ACCESS, access).putLong(EXPIRES, expiresAt)
    if (!refresh.isNullOrBlank()) editor.putString(REFRESH, refresh)
    editor.commit()
  }

  fun dropAccess(ctx: Context) {
    prefs(ctx).edit().remove(ACCESS).putLong(EXPIRES, 0L).commit()
  }

  fun clear(ctx: Context) {
    prefs(ctx).edit().remove(ACCESS).remove(REFRESH).remove(EXPIRES).commit()
  }
}

object SpotifyHttp {
  data class Resp(val code: Int, val body: String, val retryAfter: String?)

  fun request(url: String, method: String, headers: Map<String, String>, body: String?): Resp {
    val conn = (URL(url).openConnection() as HttpURLConnection)
    try {
      conn.requestMethod = method
      conn.connectTimeout = 15_000
      conn.readTimeout = 20_000
      conn.doInput = true
      headers.forEach { (k, v) -> conn.setRequestProperty(k, v) }
      if (body != null) {
        conn.doOutput = true
        conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
      }
      val code = conn.responseCode
      val stream = if (code >= 400) conn.errorStream else conn.inputStream
      val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
      return Resp(code, text, conn.getHeaderField("Retry-After"))
    } catch (e: IOException) {
      throw SpotifyUserException("Spotify-Web-API nicht erreichbar: ${e.message ?: "Netzwerkfehler"}")
    } finally {
      conn.disconnect()
    }
  }

  fun apiMessage(body: String, code: Int): String {
    return try {
      val json = JSONObject(body)
      val err = json.opt("error")
      when (err) {
        is JSONObject -> err.optString("message", "HTTP $code")
        is String -> json.optString("error_description", err).ifBlank { err }
        else -> "HTTP $code"
      }
    } catch (_: Throwable) {
      "HTTP $code"
    }
  }

  fun rateLimit(resp: Resp): String =
    if (resp.retryAfter.isNullOrBlank()) SpotifyText.RATE_LIMIT
    else SpotifyText.RATE_LIMIT + " (Retry-After: ${resp.retryAfter})"
}
