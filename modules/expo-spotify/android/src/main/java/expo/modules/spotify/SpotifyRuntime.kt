package expo.modules.spotify

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import com.spotify.android.appremote.api.ConnectionParams
import com.spotify.android.appremote.api.Connector
import com.spotify.android.appremote.api.SpotifyAppRemote
import com.spotify.android.appremote.api.error.AuthenticationFailedException
import com.spotify.android.appremote.api.error.CouldNotFindSpotifyApp
import com.spotify.android.appremote.api.error.NotLoggedInException
import com.spotify.android.appremote.api.error.OfflineModeException
import com.spotify.android.appremote.api.error.SpotifyConnectionTerminatedException
import com.spotify.android.appremote.api.error.SpotifyDisconnectedException
import com.spotify.android.appremote.api.error.UserNotAuthorizedException
import com.spotify.protocol.AppProtocol
import com.spotify.protocol.client.CallResult
import com.spotify.protocol.client.Subscription
import com.spotify.protocol.client.error.RemoteClientException
import com.spotify.protocol.types.Capabilities
import com.spotify.protocol.types.Empty
import com.spotify.protocol.types.PlayerState
import com.spotify.sdk.android.auth.AuthorizationClient
import com.spotify.sdk.android.auth.AuthorizationRequest
import com.spotify.sdk.android.auth.AuthorizationResponse
import com.spotify.sdk.android.auth.PKCEInformation
import com.spotify.sdk.android.auth.PKCEInformationFactory
import com.spotify.sdk.android.auth.TokenExchangeRequest
import expo.modules.kotlin.Promise
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.util.concurrent.Executors

/**
 * App Remote controls the installed Spotify app. Web API search uses the PKCE access token.
 * The client id is read from [SpotifyClientIdStore] on every login/connect/play.
 */
object SpotifyRuntime {
  const val REDIRECT_URI = "everyapp://spotify-callback"
  private const val REQUEST_CODE = 48151
  private val SCOPES = arrayOf(
    "app-remote-control",
    "user-read-private",
    "playlist-read-private",
    "user-library-read",
  )

  private val main = Handler(Looper.getMainLooper())
  private val io = Executors.newSingleThreadExecutor()
  private val lock = Any()

  private var app: Context? = null
  private var emitter: ((String, String) -> Unit)? = null
  private var remote: SpotifyAppRemote? = null
  private var playerSub: Subscription<PlayerState>? = null
  private var capsSub: Subscription<Capabilities>? = null
  private var connectedClientId: String? = null
  private var connecting = false
  private var closing = false
  private var lastPremium: Boolean? = null
  private var lastTrackUri: String? = null
  private var lastPaused: Boolean? = null
  private val connectWaiters = mutableListOf<Pair<(SpotifyAppRemote) -> Unit, (Throwable) -> Unit>>()

  private var pendingLogin: Promise? = null
  private var pendingPkce: PKCEInformation? = null

  fun attach(ctx: Context, emit: (String, String) -> Unit) {
    app = ctx.applicationContext
    emitter = emit
    val flags = ctx.applicationInfo.flags
    val debuggable = flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE != 0
    SpotifyAppRemote.setDebugMode(debuggable)
  }

  fun shutdown(ctx: Context) {
    disconnect(ctx, "module-destroy", emit = false)
    emitter = null
  }

  private fun ctx(): Context = app ?: throw IllegalStateException("React context not available")

  private fun emit(kind: String, json: String) {
    val event = when (kind) {
      "connected" -> "spotifyConnected"
      "disconnected" -> "spotifyDisconnected"
      "player" -> "spotifyPlayer"
      "error" -> "spotifyError"
      else -> return
    }
    try {
      emitter?.invoke(event, json)
    } catch (e: Throwable) {
      LogSafe(ctxOrNull(), "Event $event fehlgeschlagen: ${e.message}")
    }
  }

  private fun ctxOrNull(): Context? = app

  private fun LogSafe(ctx: Context?, text: String) {
    if (ctx != null) SpotifyLog.add(ctx, text)
  }

  private fun fail(promise: Promise, message: String, cause: Throwable?) {
    val ctx = ctxOrNull()
    if (ctx != null) SpotifyLog.add(ctx, message)
    emit("error", JSONObject().put("message", message).toString())
    promise.reject("E_SPOTIFY", message, cause)
  }

  fun onClientIdChanged(ctx: Context) {
    SpotifyTokenStore.clear(ctx)
    disconnect(ctx, "client-id-changed")
  }

  fun status(ctx: Context): Map<String, Any> {
    val installed = try {
      SpotifyAppRemote.isSpotifyInstalled(ctx)
    } catch (_: Throwable) {
      false
    }
    val connected = synchronized(lock) { remote?.isConnected == true }
    return mapOf(
      "installed" to installed,
      "connected" to connected,
      "authorized" to SpotifyTokenStore.hasSession(ctx),
      "premiumKnown" to (lastPremium != null),
      "premium" to (lastPremium ?: false),
    )
  }

  fun login(activityProvider: () -> Activity?, promise: Promise) {
    val ctx = try {
      ctx()
    } catch (e: Throwable) {
      promise.reject("E_SPOTIFY", e.message ?: "React context not available", e)
      return
    }
    val clientId = try {
      SpotifyClientIdStore.require(ctx)
    } catch (e: SpotifyUserException) {
      SpotifyLog.add(ctx, "Login abgebrochen: keine Client-ID")
      promise.reject("E_SPOTIFY", e.message ?: "Spotify-Fehler", e)
      return
    }
    main.post {
      val activity = activityProvider()
      if (activity == null) {
        fail(promise, SpotifyText.NO_ACTIVITY, null)
        return@post
      }
      try {
        val pkce = PKCEInformationFactory.create()
        pendingLogin?.reject("E_SPOTIFY", SpotifyText.AUTH_CANCELLED, null)
        pendingPkce = pkce
        pendingLogin = promise
        val request = AuthorizationRequest.Builder(clientId, AuthorizationResponse.Type.CODE, REDIRECT_URI)
          .setScopes(SCOPES)
          .setPkceInformation(pkce)
          .build()
        val installed = try { SpotifyAppRemote.isSpotifyInstalled(ctx) } catch (_: Throwable) { false }
        SpotifyLog.add(ctx, "Login gestartet (Authorization Code + PKCE, Spotify-App installiert=$installed)")
        AuthorizationClient.openLoginActivity(activity, REQUEST_CODE, request)
      } catch (e: Throwable) {
        if (pendingLogin === promise) {
          pendingLogin = null
          pendingPkce = null
        }
        fail(promise, SpotifyText.AUTH_FAILED + " (" + (e.message ?: e.javaClass.simpleName) + ")", e)
      }
    }
  }

  fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    if (requestCode != REQUEST_CODE) return
    val promise = pendingLogin ?: return
    val pkce = pendingPkce
    pendingLogin = null
    pendingPkce = null
    val ctx = ctxOrNull()
    if (data == null && resultCode == Activity.RESULT_CANCELED) {
      if (ctx != null) SpotifyLog.add(ctx, "Login abgebrochen")
      promise.reject("E_SPOTIFY", SpotifyText.AUTH_CANCELLED, null)
      return
    }
    val response = try {
      AuthorizationClient.getResponse(resultCode, data)
    } catch (e: Throwable) {
      if (ctx != null) SpotifyLog.add(ctx, "Login-Antwort ungültig: ${e.javaClass.simpleName}")
      promise.reject("E_SPOTIFY", SpotifyText.AUTH_FAILED, e)
      return
    }
    if (ctx != null) SpotifyLog.add(ctx, "Login-Antwort: ${response.type}")
    when (response.type) {
      AuthorizationResponse.Type.CODE -> exchange(promise, response.code, pkce?.verifier)
      AuthorizationResponse.Type.TOKEN -> storeLibraryToken(promise, response)
      AuthorizationResponse.Type.CANCELLED -> promise.reject("E_SPOTIFY", SpotifyText.AUTH_CANCELLED, null)
      AuthorizationResponse.Type.ERROR -> {
        val msg = if (response.error == "access_denied") SpotifyText.AUTH_DENIED else SpotifyText.AUTH_FAILED + " (" + (response.error ?: "error") + ")"
        if (ctx != null) SpotifyLog.add(ctx, msg)
        promise.reject("E_SPOTIFY", msg, null)
      }
      else -> promise.reject("E_SPOTIFY", SpotifyText.AUTH_FAILED, null)
    }
  }

  private fun storeLibraryToken(promise: Promise, response: AuthorizationResponse) {
    val access = response.accessToken
    if (access.isNullOrBlank()) {
      promise.reject("E_SPOTIFY", SpotifyText.AUTH_FAILED, null)
      return
    }
    val ctx = ctx()
    SpotifyTokenStore.save(ctx, access, response.refreshToken, response.expiresIn)
    SpotifyLog.add(ctx, "Token aus Auth-Bibliothek gespeichert (Refresh ${!response.refreshToken.isNullOrBlank()})")
    promise.resolve(mapOf("authorized" to true, "hasRefreshToken" to !response.refreshToken.isNullOrBlank()))
  }

  private fun exchange(promise: Promise, code: String?, verifier: String?) {
    io.execute {
      try {
        val ctx = ctx()
        if (code.isNullOrBlank() || verifier.isNullOrBlank()) throw SpotifyUserException("PKCE-Verifier fehlt. Bitte die Anmeldung erneut starten.")
        val clientId = SpotifyClientIdStore.require(ctx)
        val request = TokenExchangeRequest.Builder()
          .setClientId(clientId)
          .setCode(code)
          .setRedirectUri(REDIRECT_URI)
          .setCodeVerifier(verifier)
          .build()
        val result = request.execute()
        if (!result.isSuccess || result.accessToken.isNullOrBlank()) {
          val detail = result.errorDescription ?: result.error ?: "unbekannt"
          throw SpotifyUserException("Spotify-Token-Tausch fehlgeschlagen: $detail")
        }
        SpotifyTokenStore.save(ctx, result.accessToken, result.refreshToken, result.expiresIn)
        SpotifyLog.add(ctx, "PKCE-Token gespeichert (Refresh ${!result.refreshToken.isNullOrBlank()})")
        promise.resolve(mapOf("authorized" to true, "hasRefreshToken" to !result.refreshToken.isNullOrBlank()))
      } catch (e: SpotifyUserException) {
        fail(promise, e.message ?: SpotifyText.AUTH_FAILED, e)
      } catch (e: Throwable) {
        fail(promise, "Spotify-Token-Tausch fehlgeschlagen: ${e.message ?: e.javaClass.simpleName}", e)
      }
    }
  }

  fun logout(ctx: Context) {
    disconnect(ctx, "logout")
    SpotifyTokenStore.clear(ctx)
    lastPremium = null
    SpotifyLog.add(ctx, "Abgemeldet, lokale Tokens gelöscht")
  }

  fun connect(showAuth: Boolean, promise: Promise) {
    val ctx = try { ctx() } catch (e: Throwable) {
      promise.reject("E_SPOTIFY", e.message ?: "React context not available", e)
      return
    }
    try {
      SpotifyClientIdStore.require(ctx)
    } catch (e: SpotifyUserException) {
      SpotifyLog.add(ctx, "Connect abgebrochen: keine Client-ID")
      promise.reject("E_SPOTIFY", e.message ?: "Spotify-Fehler", e)
      return
    }
    ensureConnected(ctx, showAuth, { promise.resolve(status(ctx)) }, { e ->
      val msg = if (e is SpotifyUserException) e.message ?: SpotifyText.DISCONNECTED else germanRemote(e)
      fail(promise, msg, e)
    })
  }

  fun disconnect(ctx: Context, reason: String, emit: Boolean = true) {
    val previous = synchronized(lock) {
      closing = true
      connecting = false
      val waiters = connectWaiters.toList()
      connectWaiters.clear()
      try { playerSub?.cancel() } catch (_: Throwable) {}
      try { capsSub?.cancel() } catch (_: Throwable) {}
      playerSub = null
      capsSub = null
      val current = remote
      remote = null
      connectedClientId = null
      lastTrackUri = null
      lastPaused = null
      waiters.forEach { (_, err) -> err(SpotifyUserException(SpotifyText.DISCONNECTED)) }
      current
    }
    if (previous != null) {
      try {
        SpotifyAppRemote.disconnect(previous)
      } catch (e: Throwable) {
        SpotifyLog.add(ctx, "disconnect: ${e.message}")
      }
    }
    synchronized(lock) { closing = false }
    SpotifyLog.add(ctx, "App Remote getrennt ($reason)")
    if (emit) emit("disconnected", JSONObject().put("reason", reason).toString())
  }

  private fun ensureConnected(ctx: Context, showAuth: Boolean, ok: (SpotifyAppRemote) -> Unit, err: (Throwable) -> Unit) {
    val clientId = SpotifyClientIdStore.require(ctx)
    if (!SpotifyAppRemote.isSpotifyInstalled(ctx)) {
      SpotifyLog.add(ctx, "Connect abgebrochen: Spotify nicht installiert")
      err(SpotifyUserException(SpotifyText.NOT_INSTALLED))
      return
    }
    val existing = synchronized(lock) {
      val current = remote
      if (current != null && current.isConnected && connectedClientId == clientId) current else null
    }
    if (existing != null) {
      ok(existing)
      return
    }
    synchronized(lock) {
      if (connectedClientId != null && connectedClientId != clientId) {
        // Fall through and replace the session below.
      }
    }
    if (synchronized(lock) { connectedClientId != null && connectedClientId != clientId }) {
      disconnect(ctx, "client-id-changed")
    }
    val start = synchronized(lock) {
      connectWaiters.add(ok to err)
      if (connecting) false else {
        connecting = true
        true
      }
    }
    if (!start) return
    SpotifyLog.add(ctx, "App Remote connect (Auth-View=$showAuth)")
    val params = ConnectionParams.Builder(clientId)
      .setRedirectUri(REDIRECT_URI)
      .showAuthView(showAuth)
      .build()
    SpotifyAppRemote.connect(ctx, params, object : Connector.ConnectionListener {
      override fun onConnected(appRemote: SpotifyAppRemote) {
        val waiters = synchronized(lock) {
          connecting = false
          remote = appRemote
          connectedClientId = clientId
          val copy = connectWaiters.toList()
          connectWaiters.clear()
          copy
        }
        SpotifyLog.add(ctx, "App Remote verbunden")
        subscribe(ctx, appRemote)
        emit("connected", JSONObject().put("premium", JSONObject.NULL).toString())
        waiters.forEach { (success, _) -> success(appRemote) }
      }

      override fun onFailure(throwable: Throwable) {
        val msg = germanRemote(throwable)
        val waiters = synchronized(lock) {
          connecting = false
          val copy = connectWaiters.toList()
          connectWaiters.clear()
          copy
        }
        SpotifyLog.add(ctx, "App Remote Fehler: $msg")
        emit("error", JSONObject().put("message", msg).toString())
        val wrapped = SpotifyUserException(msg)
        waiters.forEach { (_, failure) -> failure(wrapped) }
      }
    })
  }

  private fun subscribe(ctx: Context, appRemote: SpotifyAppRemote) {
    try {
      playerSub?.cancel()
    } catch (_: Throwable) {}
    val sub = appRemote.playerApi.subscribeToPlayerState()
    playerSub = sub
    sub.setEventCallback { state -> onPlayer(ctx, state) }
    sub.setLifecycleCallback(object : Subscription.LifecycleCallback {
      override fun onStart() {
        SpotifyLog.add(ctx, "Player-Abo gestartet")
      }

      override fun onStop() {
        if (closing) return
        SpotifyLog.add(ctx, "Player-Abo beendet (Verbindung weg)")
        synchronized(lock) {
          if (remote === appRemote) {
            remote = null
            connectedClientId = null
          }
        }
        emit("disconnected", JSONObject().put("reason", "connection-dropped").toString())
        emit("error", JSONObject().put("message", SpotifyText.DISCONNECTED).toString())
      }
    })
    try {
      capsSub?.cancel()
    } catch (_: Throwable) {}
    val caps = appRemote.userApi.subscribeToCapabilities()
    capsSub = caps
    caps.setEventCallback { info ->
      lastPremium = info.canPlayOnDemand
      SpotifyLog.add(ctx, "Capabilities canPlayOnDemand=${info.canPlayOnDemand}")
    }
  }

  private fun onPlayer(ctx: Context, state: PlayerState) {
    val json = stateJson(state)
    val uri = state.track?.uri
    val paused = state.isPaused
    if (uri != lastTrackUri || paused != lastPaused) {
      lastTrackUri = uri
      lastPaused = paused
      SpotifyLog.add(ctx, "Player ${if (paused) "pausiert" else "spielt"} ${uri ?: "-"}")
    }
    emit("player", json)
  }

  fun play(uri: String, positionMs: Double, promise: Promise) {
    val ctx = try { ctx() } catch (e: Throwable) {
      promise.reject("E_SPOTIFY", e.message ?: "React context not available", e)
      return
    }
    val clean = uri.trim()
    if (!clean.startsWith("spotify:") || clean.length > 300) {
      promise.reject("E_SPOTIFY", SpotifyText.BAD_URI, null)
      return
    }
    if (positionMs.isNaN() || positionMs < 0) {
      promise.reject("E_SPOTIFY", "positionMs muss eine Zahl >= 0 sein.", null)
      return
    }
    try {
      SpotifyClientIdStore.require(ctx)
    } catch (e: SpotifyUserException) {
      SpotifyLog.add(ctx, "play abgebrochen: keine Client-ID")
      promise.reject("E_SPOTIFY", e.message ?: "Spotify-Fehler", e)
      return
    }
    SpotifyLog.add(ctx, "play $clean @ ${positionMs.toLong()}ms")
    ensureConnected(ctx, true, { appRemote ->
      ensureCanPlay(appRemote, clean, {
        val call = appRemote.playerApi.play(clean)
        call.setResultCallback {
          if (positionMs > 0) {
            val seek = appRemote.playerApi.seekTo(positionMs.toLong())
            seek.setResultCallback { finishWithState(appRemote, promise) }
            seek.setErrorCallback { e -> fail(promise, germanRemote(e), e) }
          } else {
            finishWithState(appRemote, promise)
          }
        }
        call.setErrorCallback { e -> fail(promise, germanRemote(e), e) }
      }, { message -> fail(promise, message, null) })
    }, { e ->
      val msg = if (e is SpotifyUserException) e.message ?: SpotifyText.DISCONNECTED else germanRemote(e)
      fail(promise, msg, e)
    })
  }

  private fun ensureCanPlay(appRemote: SpotifyAppRemote, uri: String, ok: () -> Unit, err: (String) -> Unit) {
    if (!uri.startsWith("spotify:track:")) {
      ok()
      return
    }
    val call = appRemote.userApi.getCapabilities()
    call.setResultCallback { caps ->
      lastPremium = caps.canPlayOnDemand
      if (!caps.canPlayOnDemand) err(SpotifyText.NOT_PREMIUM) else ok()
    }
    call.setErrorCallback { ok() }
  }

  private fun requireRemote(): SpotifyAppRemote {
    val current = synchronized(lock) { remote?.takeIf { it.isConnected } }
    return current ?: throw SpotifyUserException(SpotifyText.NOT_CONNECTED)
  }

  fun pause(promise: Promise) = simple(promise, "pause") { it.playerApi.pause() }
  fun resume(promise: Promise) = simple(promise, "resume") { it.playerApi.resume() }
  fun skipNext(promise: Promise) = simple(promise, "skipNext") { it.playerApi.skipNext() }
  fun skipPrevious(promise: Promise) = simple(promise, "skipPrevious") { it.playerApi.skipPrevious() }

  fun stop(promise: Promise) {
    val appRemote = try { requireRemote() } catch (e: SpotifyUserException) {
      promise.reject("E_SPOTIFY", e.message ?: "Spotify-Fehler", e)
      return
    }
    SpotifyLog.add(ctx(), "stop (Pause + Anfang)")
    val call = appRemote.playerApi.pause()
    call.setResultCallback {
      val seek = appRemote.playerApi.seekTo(0)
      seek.setResultCallback { finishWithState(appRemote, promise) }
      seek.setErrorCallback { e -> fail(promise, germanRemote(e), e) }
    }
    call.setErrorCallback { e -> fail(promise, germanRemote(e), e) }
  }

  fun seek(positionMs: Double, promise: Promise) {
    if (positionMs.isNaN() || positionMs < 0) {
      promise.reject("E_SPOTIFY", "positionMs muss eine Zahl >= 0 sein.", null)
      return
    }
    val appRemote = try { requireRemote() } catch (e: SpotifyUserException) {
      promise.reject("E_SPOTIFY", e.message ?: "Spotify-Fehler", e)
      return
    }
    SpotifyLog.add(ctx(), "seek ${positionMs.toLong()}ms")
    val call = appRemote.playerApi.seekTo(positionMs.toLong())
    call.setResultCallback { finishWithState(appRemote, promise) }
    call.setErrorCallback { e -> fail(promise, germanRemote(e), e) }
  }

  fun playerState(promise: Promise) {
    val appRemote = try { requireRemote() } catch (e: SpotifyUserException) {
      promise.reject("E_SPOTIFY", e.message ?: "Spotify-Fehler", e)
      return
    }
    finishWithState(appRemote, promise)
  }

  private fun simple(promise: Promise, action: String, call: (SpotifyAppRemote) -> CallResult<Empty>) {
    val appRemote = try { requireRemote() } catch (e: SpotifyUserException) {
      promise.reject("E_SPOTIFY", e.message ?: "Spotify-Fehler", e)
      return
    }
    SpotifyLog.add(ctx(), action)
    val pending = call(appRemote)
    pending.setResultCallback { finishWithState(appRemote, promise) }
    pending.setErrorCallback { e -> fail(promise, germanRemote(e), e) }
  }

  private fun finishWithState(appRemote: SpotifyAppRemote, promise: Promise) {
    val call = appRemote.playerApi.getPlayerState()
    call.setResultCallback { state -> promise.resolve(stateJson(state)) }
    call.setErrorCallback { promise.resolve(JSONObject().put("connected", true).toString()) }
  }

  private fun stateJson(state: PlayerState): String {
    val json = JSONObject()
    json.put("connected", true)
    json.put("paused", state.isPaused)
    json.put("positionMs", state.playbackPosition)
    json.put("playbackSpeed", state.playbackSpeed.toDouble())
    val restrictions = state.playbackRestrictions
    if (restrictions != null) {
      json.put("canSeek", restrictions.canSeek)
      json.put("canSkipNext", restrictions.canSkipNext)
      json.put("canSkipPrev", restrictions.canSkipPrev)
    }
    val premium = lastPremium
    if (premium != null) json.put("premium", premium)
    val track = state.track
    if (track == null) {
      json.put("track", JSONObject.NULL)
    } else {
      val artists = JSONArray()
      track.artists?.forEach { artists.put(it?.name ?: "") }
      json.put("track", JSONObject()
        .put("uri", track.uri ?: "")
        .put("name", track.name ?: "")
        .put("durationMs", track.duration)
        .put("artist", track.artist?.name ?: "")
        .put("artists", artists)
        .put("album", track.album?.name ?: "")
        .put("albumUri", track.album?.uri ?: "")
        .put("imageUri", track.imageUri?.raw ?: ""))
    }
    return json.toString()
  }

  fun search(query: String, optionsJson: String, promise: Promise) = web(promise) { ctx ->
    val options = JSONObject(if (optionsJson.isBlank()) "{}" else optionsJson)
    val q = query.trim()
    if (q.isEmpty()) throw SpotifyUserException(SpotifyText.QUERY_MISSING)
    if (q.length > 200) throw SpotifyUserException(SpotifyText.QUERY_LONG)
    val types = mutableListOf<String>()
    val arr = options.optJSONArray("types")
    if (arr == null || arr.length() == 0) types.add("track")
    else for (i in 0 until arr.length()) types.add(arr.optString(i).trim().lowercase())
    val allowed = setOf("track", "artist", "album", "playlist", "show", "episode")
    for (type in types) if (type !in allowed) throw SpotifyUserException("Unbekannter Spotify-Suchtyp: $type")
    val limit = options.optInt("limit", 10).coerceIn(1, 50)
    val offset = options.optInt("offset", 0).coerceIn(0, 1000)
    val path = "/v1/search?q=${enc(q)}&type=${enc(types.joinToString(","))}&limit=$limit&offset=$offset"
    SpotifyLog.add(ctx, "Suche ${types.joinToString(",")} limit=$limit offset=$offset")
    slimSearch(api(ctx, path), types).toString()
  }

  fun me(promise: Promise) = web(promise) { ctx ->
    val json = api(ctx, "/v1/me")
    val product = json.optString("product")
    if (product.isNotEmpty()) lastPremium = product == "premium"
    SpotifyLog.add(ctx, "Web API /me product=${product.ifEmpty { "?" }}")
    JSONObject()
      .put("id", json.optString("id"))
      .put("displayName", json.optString("display_name"))
      .put("product", product)
      .put("premium", product == "premium")
      .toString()
  }

  fun myPlaylists(limit: Double, promise: Promise) = web(promise) { ctx ->
    val n = limit.toInt().coerceIn(1, 50)
    SpotifyLog.add(ctx, "Web API eigene Playlists limit=$n")
    slimList("playlist", api(ctx, "/v1/me/playlists?limit=$n"), "playlists").toString()
  }

  fun savedTracks(limit: Double, promise: Promise) = web(promise) { ctx ->
    val n = limit.toInt().coerceIn(1, 50)
    SpotifyLog.add(ctx, "Web API gespeicherte Titel limit=$n")
    val json = api(ctx, "/v1/me/tracks?limit=$n")
    val items = json.optJSONArray("items") ?: JSONArray()
    val out = JSONArray()
    for (i in 0 until items.length()) {
      val wrap = items.optJSONObject(i) ?: continue
      val track = wrap.optJSONObject("track") ?: continue
      out.put(slimItem("track", track).put("addedAt", wrap.optString("added_at")))
    }
    JSONObject().put("tracks", out).put("total", json.optInt("total")).toString()
  }

  private fun web(promise: Promise, block: (Context) -> String) {
    io.execute {
      try {
        val ctx = ctx()
        SpotifyClientIdStore.require(ctx)
        promise.resolve(block(ctx))
      } catch (e: SpotifyUserException) {
        if (e.message == SpotifyText.NO_CLIENT_ID) {
          ctxOrNull()?.let { SpotifyLog.add(it, "Web API abgebrochen: keine Client-ID") }
        }
        promise.reject("E_SPOTIFY", e.message ?: "Spotify-Fehler", e)
      } catch (e: Throwable) {
        fail(promise, e.message ?: "Spotify-Web-API-Fehler", e)
      }
    }
  }

  private fun accessToken(ctx: Context): String {
    SpotifyTokenStore.freshAccess(ctx)?.let { return it }
    val refresh = SpotifyTokenStore.refreshToken(ctx) ?: throw SpotifyUserException(SpotifyText.NEED_LOGIN)
    val clientId = SpotifyClientIdStore.require(ctx)
    val body = "grant_type=refresh_token&refresh_token=${enc(refresh)}&client_id=${enc(clientId)}"
    val resp = SpotifyHttp.request(
      "https://accounts.spotify.com/api/token",
      "POST",
      mapOf("Content-Type" to "application/x-www-form-urlencoded"),
      body,
    )
    if (resp.code == 429) throw SpotifyUserException(SpotifyHttp.rateLimit(resp))
    if (resp.code !in 200..299) {
      val detail = SpotifyHttp.apiMessage(resp.body, resp.code)
      SpotifyLog.add(ctx, "Token-Refresh fehlgeschlagen: $detail")
      if (resp.code == 400 || resp.code == 401) {
        SpotifyTokenStore.clear(ctx)
        throw SpotifyUserException(SpotifyText.NEED_LOGIN)
      }
      throw SpotifyUserException("Spotify-Token-Refresh fehlgeschlagen: $detail")
    }
    val json = JSONObject(resp.body)
    val access = json.optString("access_token")
    if (access.isBlank()) throw SpotifyUserException(SpotifyText.NEED_LOGIN)
    val nextRefresh = json.optString("refresh_token").ifBlank { refresh }
    SpotifyTokenStore.save(ctx, access, nextRefresh, json.optInt("expires_in", 3600))
    SpotifyLog.add(ctx, "Access-Token erneuert")
    return access
  }

  private fun api(ctx: Context, path: String, retry: Boolean = true): JSONObject {
    val token = accessToken(ctx)
    val resp = SpotifyHttp.request(
      "https://api.spotify.com$path",
      "GET",
      mapOf("Authorization" to "Bearer $token", "Accept" to "application/json"),
      null,
    )
    if (resp.code == 401 && retry) {
      SpotifyLog.add(ctx, "Web API 401, Token wird erneuert")
      SpotifyTokenStore.dropAccess(ctx)
      return api(ctx, path, retry = false)
    }
    if (resp.code == 429) throw SpotifyUserException(SpotifyHttp.rateLimit(resp))
    if (resp.code !in 200..299) {
      val detail = SpotifyHttp.apiMessage(resp.body, resp.code)
      SpotifyLog.add(ctx, "Web API $path -> ${resp.code} $detail")
      throw SpotifyUserException("Spotify-Web-API-Fehler (${resp.code}): $detail")
    }
    return JSONObject(resp.body.ifBlank { "{}" })
  }

  private fun slimSearch(json: JSONObject, types: List<String>): JSONObject {
    val out = JSONObject()
    for (type in types) {
      val key = plural(type)
      val block = json.optJSONObject(key) ?: continue
      val items = block.optJSONArray("items") ?: JSONArray()
      val slim = JSONArray()
      for (i in 0 until items.length()) {
        val item = items.optJSONObject(i) ?: continue
        slim.put(slimItem(type, item))
      }
      out.put(key, JSONObject().put("items", slim).put("total", block.optInt("total")).put("limit", block.optInt("limit")).put("offset", block.optInt("offset")))
    }
    return out
  }

  private fun slimList(type: String, json: JSONObject, key: String): JSONObject {
    val items = json.optJSONArray("items") ?: JSONArray()
    val slim = JSONArray()
    for (i in 0 until items.length()) {
      val item = items.optJSONObject(i) ?: continue
      slim.put(slimItem(type, item))
    }
    return JSONObject().put(key, slim).put("total", json.optInt("total"))
  }

  private fun slimItem(type: String, item: JSONObject): JSONObject {
    val out = JSONObject()
      .put("id", item.optString("id"))
      .put("uri", item.optString("uri"))
      .put("name", item.optString("name"))
    when (type) {
      "track", "episode" -> {
        out.put("durationMs", item.optLong("duration_ms"))
        if (type == "track") {
          out.put("artists", nameUris(item.optJSONArray("artists")))
          val album = item.optJSONObject("album")
          out.put("album", album?.optString("name") ?: "")
          out.put("albumUri", album?.optString("uri") ?: "")
        } else {
          out.put("description", item.optString("description"))
        }
      }
      "artist" -> out.put("genres", item.optJSONArray("genres") ?: JSONArray())
      "album" -> {
        out.put("artists", nameUris(item.optJSONArray("artists")))
        out.put("releaseDate", item.optString("release_date"))
      }
      "playlist" -> {
        out.put("description", item.optString("description"))
        out.put("trackCount", item.optJSONObject("tracks")?.optInt("total") ?: 0)
      }
      "show" -> out.put("publisher", item.optString("publisher"))
    }
    return out
  }

  private fun nameUris(arr: JSONArray?): JSONArray {
    val out = JSONArray()
    if (arr == null) return out
    for (i in 0 until arr.length()) {
      val item = arr.optJSONObject(i) ?: continue
      out.put(JSONObject().put("name", item.optString("name")).put("uri", item.optString("uri")))
    }
    return out
  }

  private fun plural(type: String) = when (type) {
    "track" -> "tracks"
    "artist" -> "artists"
    "album" -> "albums"
    "playlist" -> "playlists"
    "show" -> "shows"
    "episode" -> "episodes"
    else -> type
  }

  private fun enc(value: String) = URLEncoder.encode(value, "UTF-8")

  private fun germanRemote(error: Throwable): String {
    val reason = findReason(error)
    val blob = generateSequence(error) { it.cause }.joinToString(" ") { it.javaClass.simpleName + " " + (it.message ?: "") }
    return when {
      error is CouldNotFindSpotifyApp || blob.contains("CouldNotFindSpotifyApp") -> SpotifyText.NOT_INSTALLED
      error is NotLoggedInException || reason == AppProtocol.ErrorUri.ERROR_NOT_LOGGED_IN -> SpotifyText.NOT_LOGGED_IN
      error is UserNotAuthorizedException || reason == AppProtocol.ErrorUri.ERROR_USER_NOT_AUTHORIZED -> SpotifyText.NOT_AUTHORIZED
      error is AuthenticationFailedException || reason == AppProtocol.ErrorUri.ERROR_AUTHENTICATION_FAILED -> SpotifyText.AUTH_FAILED
      error is OfflineModeException || reason == AppProtocol.ErrorUri.ERROR_OFFLINE_MODE_ACTIVE -> SpotifyText.OFFLINE
      error is SpotifyDisconnectedException || error is SpotifyConnectionTerminatedException -> SpotifyText.DISCONNECTED
      reason == AppProtocol.ErrorUri.ERROR_INVALID_URI -> SpotifyText.BAD_URI
      reason == AppProtocol.ErrorUri.WAMP_ERROR_NOT_AUTHORIZED || blob.contains("premium", ignoreCase = true) -> SpotifyText.NOT_PREMIUM
      else -> "Spotify-Steuerung fehlgeschlagen: ${error.message ?: error.javaClass.simpleName}"
    }
  }

  private fun findReason(error: Throwable): String? {
    var current: Throwable? = error
    while (current != null) {
      if (current is RemoteClientException) return current.reasonUri
      current = current.cause
    }
    return null
  }
}
