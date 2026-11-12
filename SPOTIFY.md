# Spotify in EveryApp

Mini-Apps (zum Beispiel ein „Song raten“-Quiz) suchen Titel über die Spotify Web API und steuern die Wiedergabe über die **installierte Spotify-Android-App**. Der Ton läuft in Spotify, nicht im WebView. Das Web Playback SDK wird nicht verwendet. `preview_url`, Audio-Features und der alte Recommendations-Endpunkt werden nicht benutzt.

Es gibt **kein Client-Secret** in diesem Repo. Die Client ID ist öffentlich und wird zur Laufzeit eingetragen. Ein leeres `expo.extra.spotifyClientId` ist der Normalfall.

## Einmalig im Spotify Dashboard

1. App anlegen: [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Redirect-URI eintragen: `everyapp://spotify-callback`
3. Android-Paketnamen eintragen:
   - `com.everyapp.container` (EveryApp)
   - `com.everyapp.container.dev` (SrvEveryApp, Dev-Client)
4. Dazu den **SHA1 der Signatur**, mit der die APK signiert ist. Den Fingerprint nicht raten und nicht erfinden.
   - Lokaler Debug-Keystore, nachdem so ein Build existiert:

     ```bash
     keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
     ```

   - EAS-Build: SHA1 im Expo-Dashboard unter den Android-Credentials des jeweiligen Profils (development / preview / production) ablesen, sobald die Credentials angelegt sind.
5. Die Client ID kopieren. Sie kommt **nicht** in den Quellcode, wenn du sie nicht als optionalen Prefill setzen willst.

## In EveryApp

1. APK installieren (dieser Stand enthält Auth- und App-Remote-SDK, Redirect und Paketnamen).
2. Spotify-App auf dem Gerät installieren und mit dem Premium-Account anmelden. Einen einzelnen Track (`spotify:track:…`) abspielen geht nur mit Premium.
3. In EveryApp auf dem Startbildschirm **Spotify** öffnen, Client ID einfügen, speichern.
4. Dafür ist **kein neuer Build** nötig. `login`, `connect` und `play` lesen die gespeicherte ID bei jedem Aufruf.

Ohne gespeicherte ID kommt:

`Keine Spotify Client ID hinterlegt. Bitte in den EveryApp-Einstellungen eintragen.`

### Vorrang, wenn mehrere IDs existieren

1. **EveryApp-Einstellungen** (Container, Quelle der Wahrheit)
2. `EveryAppBridge.spotify.setClientId()` einer Mini-App mit erlaubter Permission `spotify` (ebenfalls nur im Container, nicht im Mini-App-Storage)
3. Optionaler Build-Prefill: Umgebungsvariable `SPOTIFY_CLIENT_ID` oder `expo.extra.spotifyClientId` in `app.json`

`setClientId` überschreibt eine in den Einstellungen gespeicherte ID nicht. `getClientId()` liefert `source`: `settings`, `bridge`, `prefill` oder `none`.

Tokens (Access und Refresh) liegen in den privaten App-Preferences des Containers. Mini-Apps bekommen keinen Access-Token. `search`, `getMe`, `getMyPlaylists` und `getSavedTracks` rufen die Web API selbst auf und erneuern abgelaufene Tokens.

## Mini-App

In `everyapp.json`:

```json
{ "permissions": ["spotify"] }
```

Der Nutzer muss die Permission im Dialog erlauben. `spotify` ist nicht frei (anders als `media`). `EveryAppBridge.media.*` bleibt die generische Medientasten-Steuerung und startet keine Spotify-URI.

```javascript
await EveryAppBridge.spotify.login();
await EveryAppBridge.spotify.connect();
const found = await EveryAppBridge.spotify.search('gelbes u-boot', { types: ['track'], limit: 5 });
await EveryAppBridge.spotify.play(found.tracks.items[0].uri, { positionMs: 20000 });
await EveryAppBridge.spotify.pause();
```

Events: `spotify.connected`, `spotify.disconnected`, `spotify.player`, `spotify.error`.

`stop()` ist Pause plus Sprung an den Anfang. Das App-Remote-SDK hat keinen eigenen Stop-Befehl.

Weitere Beispiele stehen in der README unter „Spotify API“.

## Bibliotheken

- Auth: `com.spotify.android:auth:5.0.0` von Maven Central. Authorization Code mit PKCE (die Bibliothek tauscht den Code, Refresh-Token bleibt bei uns). Ab Auth 5 muss die Redirect-Activity im App-Manifest stehen. Das macht `plugins/withSpotify.js` für `everyapp://spotify-callback`.
- App Remote: `spotify-app-remote-release-0.8.0.aar`. Auf Maven Central gibt es nur `com.spotify.android:auth` und `auth-store`, **kein** `app-remote`-Artefakt (geprüft November 2026). Die AAR ist die offizielle Datei aus [spotify/android-sdk](https://github.com/spotify/android-sdk/blob/master/app-remote-lib/spotify-app-remote-release-0.8.0.aar). Herkunft und SHA256: `modules/expo-spotify/android/libs/SOURCE.txt`.
- Gson `2.10.1` (von App Remote benötigt, nicht in der AAR enthalten).

Wenn `com.spotify.android:auth:5.0.0` beim Gradle-Sync nicht aufgelöst wird, den Maven-Fehler festhalten und keine andere Koordinate erfinden.
