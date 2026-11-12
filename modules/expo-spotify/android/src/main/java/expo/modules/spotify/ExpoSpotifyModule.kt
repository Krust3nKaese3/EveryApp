package expo.modules.spotify

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise

class ExpoSpotifyModule : Module() {
  private fun ctx() = appContext.reactContext ?: throw IllegalStateException("React context not available")

  private fun boot() {
    val context = appContext.reactContext ?: return
    SpotifyRuntime.attach(context) { event, json ->
      sendEvent(event, mapOf("json" to json))
    }
  }

  private fun writeClientId(key: String, raw: String?): Map<String, String> {
    boot()
    val context = ctx()
    val changed = SpotifyClientIdStore.write(context, key, raw)
    if (changed) SpotifyRuntime.onClientIdChanged(context)
    return SpotifyClientIdStore.snapshot(context)
  }

  override fun definition() = ModuleDefinition {
    Name("ExpoSpotify")
    Events("spotifyConnected", "spotifyDisconnected", "spotifyPlayer", "spotifyError")

    OnCreate { boot() }
    OnDestroy {
      appContext.reactContext?.let { SpotifyRuntime.shutdown(it) }
    }
    OnActivityResult { _, payload ->
      SpotifyRuntime.onActivityResult(payload.requestCode, payload.resultCode, payload.data)
    }

    AsyncFunction("getClientId") {
      boot()
      SpotifyClientIdStore.snapshot(ctx())
    }
    AsyncFunction("setSettingsClientId") { raw: String? -> writeClientId(SpotifyClientIdStore.SETTINGS, raw) }
    AsyncFunction("setBridgeClientId") { raw: String? -> writeClientId(SpotifyClientIdStore.BRIDGE, raw) }
    AsyncFunction("setPrefillClientId") { raw: String? -> writeClientId(SpotifyClientIdStore.PREFILL, raw) }

    AsyncFunction("isAvailable") {
      boot()
      SpotifyRuntime.status(ctx())
    }
    AsyncFunction("login") { promise: Promise ->
      boot()
      SpotifyRuntime.login({ appContext.currentActivity }, promise)
    }
    AsyncFunction("logout") {
      boot()
      SpotifyRuntime.logout(ctx())
      true
    }
    AsyncFunction("connect") { promise: Promise ->
      boot()
      SpotifyRuntime.connect(true, promise)
    }
    AsyncFunction("disconnect") {
      boot()
      SpotifyRuntime.disconnect(ctx(), "disconnect")
      true
    }
    AsyncFunction("play") { uri: String, positionMs: Double, promise: Promise ->
      boot()
      SpotifyRuntime.play(uri, positionMs, promise)
    }
    AsyncFunction("pause") { promise: Promise -> boot(); SpotifyRuntime.pause(promise) }
    AsyncFunction("resume") { promise: Promise -> boot(); SpotifyRuntime.resume(promise) }
    AsyncFunction("stop") { promise: Promise -> boot(); SpotifyRuntime.stop(promise) }
    AsyncFunction("skipNext") { promise: Promise -> boot(); SpotifyRuntime.skipNext(promise) }
    AsyncFunction("skipPrevious") { promise: Promise -> boot(); SpotifyRuntime.skipPrevious(promise) }
    AsyncFunction("seek") { positionMs: Double, promise: Promise ->
      boot()
      SpotifyRuntime.seek(positionMs, promise)
    }
    AsyncFunction("getPlayerState") { promise: Promise ->
      boot()
      SpotifyRuntime.playerState(promise)
    }
    AsyncFunction("search") { query: String, optionsJson: String, promise: Promise ->
      boot()
      SpotifyRuntime.search(query, optionsJson, promise)
    }
    AsyncFunction("getMe") { promise: Promise ->
      boot()
      SpotifyRuntime.me(promise)
    }
    AsyncFunction("getMyPlaylists") { limit: Double, promise: Promise ->
      boot()
      SpotifyRuntime.myPlaylists(limit, promise)
    }
    AsyncFunction("getSavedTracks") { limit: Double, promise: Promise ->
      boot()
      SpotifyRuntime.savedTracks(limit, promise)
    }
  }
}
