# OpenScr

**OpenScr** (Open Small Code Runner) is an Android container app that runs OpenScrapps loaded on demand from public Git repositories, without requiring app store deployments. Built with React Native, Expo, and TypeScript.

Empfehlung: Das Repository einer eigenen OpenScrapp heißt `<Name>Scrapps`, zum Beispiel `KrustenScrapps`. Der Name ist keine technische Voraussetzung.

## OpenScrapp bauen

Wer eine OpenScrapp in einem eigenen Repository schreibt, gibt der KI diesen Einstieg: [llms.txt](llms.txt). Der Guide [docs/MINIAPP_AI_GUIDE.md](docs/MINIAPP_AI_GUIDE.md) erklärt Manifest, Bridge und Mehrspieler. Die Vorlage ist [examples/multiplayer-lobby/](examples/multiplayer-lobby/). Am PC testen zwei Browser-Tabs mit [examples/multiplayer-mock/everyapp-mock.js](examples/multiplayer-mock/everyapp-mock.js).

## Features

### v1.0 Capabilities

- **Load OpenScrapps from GitHub**: Add public GitHub repository URLs to fetch and run OpenScrapps (typed URL, in-app QR scan, or an OpenScr add-link)
- **QR install**: Scan a QR code in the app, or open an add-link with the system camera (see below)
- **Sandboxed WebView Execution**: Each OpenScrapp runs in its own isolated WebView with controlled access to native capabilities
- **Permission System**: User consent prompts for requested permissions with fine-grained control
- **Folder Organization**: Create, rename, delete folders and organize apps between them
- **Native Bridge API**: Typed JavaScript bridge exposing native capabilities to OpenScrapps
- **Full-Screen Support**: Orientation unlocking for games and immersive experiences
- **Performance Optimized**: WebView configured for 60 FPS rendering suitable for Canvas/WebGL games

## Store readiness

- **Empfohlen:** `catalog/catalog.json` (name, repo URL, description, age rating). Fetched from the latest `main` commit, with the copy in the app as fallback. One tap installs it.
- Repositories that are not in the catalog (typed URL, QR, add-link) require the warning „Nur vertrauenswürdige Quellen hinzufügen…“ and an explicit confirmation.
- `EXPO_PUBLIC_CATALOG_ONLY=1` (mirrored from `CATALOG_ONLY` in `app.config.js` as `extra.catalogOnly`) disables free GitHub links. On that build, **Entwicklermodus** can load only repositories owned by the signed-in GitHub account (device flow or a personal token kept in the on-device secret store). Add, update, and open re-check ownership. Signing out disables those apps. The EAS profile `production-catalog` sets the flag for a later iOS build. Android builds leave the flag off and keep the free-add flow. Do not start that build unless you mean to.
- Device flow is configured. The public GitHub OAuth client id is `Ov23liZBUKxpmryUJW1a` (Device Flow enabled, no client secret). Metro and every EAS profile use it when `EXPO_PUBLIC_GITHUB_CLIENT_ID` is unset; set that variable to override it. A personal token still works. The device flow never redirects into the app, so the GitHub OAuth app’s Authorization callback URL does not need to change for this rename. The client id stays the same.
- Review notes for the two areas: [docs/APP_REVIEW.md](docs/APP_REVIEW.md). That file is not legal advice.
- **Melden** opens a prefilled email to `manueldiliberto1@gmail.com`. There is no report server.
- `catalog/blocklist.json` disables listed `appId`s or repos for everyone and shows `reason`.
- Privacy and terms: [docs/site/](docs/site/index.html) (German and English), linked in the app as „Datenschutz“ and „Nutzung“. After editing those pages, run `node scripts/sync-legal.js`. Play listing, data safety and the closed-test checklist: [docs/PLAY_STORE.md](docs/PLAY_STORE.md). Catalog age ratings are recommendations and need a check too.
- Delete removes that OpenScrapp’s files, `@miniapp_<appId>_` keys, secrets, permissions, and caches. Update keeps storage.
- Bridge allowlist: [docs/BRIDGE_API.md](docs/BRIDGE_API.md). Local multiplayer for OpenScrapps: [docs/MULTIPLAYER.md](docs/MULTIPLAYER.md).
- **Mehrspieler**: Ein Handy ist Host im selben WLAN oder Hotspot, die anderen treten per QR bei. Nur mit der Berechtigung `multiplayer`. Braucht einen neuen nativen Build.

### Supported Native Capabilities

OpenScrapps can request access to the following through the permission system:

- **Storage**: Persistent key-value storage (scoped per app)
- **HTTP**: Network requests to external APIs
- **Bluetooth**: Scan, connect, and disconnect Bluetooth devices
- **Notifications**: Schedule local notifications
- **Camera**: Camera access (requires additional UI integration)
- **Sensors**: Accelerometer and gyroscope data
- **Vibration**: Haptic feedback

## Adding an OpenScrapp with a QR code

On the home screen, next to **Add**, tap **QR**. The in-app camera accepts:

- an OpenScr add-link (either scheme below)
- a plain GitHub repository URL (`https://github.com/owner/repo` or the same URL ending in `.git`)

Anything else shows an error and does not install an OpenScrapp. A multiplayer invite (`openscr-mp://…`) is not an install link; the game scanner reads it. After a successful scan the camera closes so the same code is not added twice. If that repository is already installed, OpenScr says so and can open it.

A plain `https://github.com/...` QR works **only in the in-app scanner**. The system camera treats that as a web link and opens the browser.

### Add-links (system camera and in-app scanner)

The host `add` is reserved (it is not an OpenScrapp name). The GitHub URL is the `url` query parameter, percent-encoded. The same path and query work on both schemes; pick the scheme that opens the app you have installed.

| App | Package | Link |
| --- | --- | --- |
| Production **OpenScr** | `com.openscr.app` | `openscr://add?url=<encoded https GitHub URL>` |
| Dev client **SrvOpenScr** | `com.openscr.app.dev` | `exp+openscr://add?url=<encoded https GitHub URL>` (preferred; this scheme is what opens the dev client). `openscr://add?url=…` is also accepted if that build is the one that handles the scheme. |

Example for `https://github.com/Krust3nKaese3/evryGuessTheSong`:

- Dev client (SrvOpenScr): `exp+openscr://add?url=https%3A%2F%2Fgithub.com%2FKrust3nKaese3%2FevryGuessTheSong`
- Production OpenScr: `openscr://add?url=https%3A%2F%2Fgithub.com%2FKrust3nKaese3%2FevryGuessTheSong`

Opening one of those links (app already running, or cold start) runs the same fetch and save as **Add**, including the success and error alerts. Existing OpenScrapp links such as `openscr://EveryMacro/...` are unchanged. `openscr://spotify-callback` and the dev-launcher URL `exp+openscr://expo-development-client/...` are not install links.

## OpenScrapp Repository Format

### Directory Structure

An OpenScrapp is started from `openscr.json` and its `entrypoint`. `everyapp.json` is still accepted when the repository has no `openscr.json` (evryWerwolf, evryGuessTheSong, EveryMacro, and EveryRollDice). Everything else is up to you: one HTML file, or HTML plus scripts, styles, and assets in any folders you want. Paths are relative to the file that contains them (`app.js` next to `index.html`, `assets/buzz.mp3` from that HTML, `url(../img/a.png)` from a stylesheet).

```
KrustenScrapps/
├── openscr.json          # Manifest (required)
├── index.html             # Entrypoint named by openscr.json
├── styles.css             # Optional
├── app.js                 # Optional
├── assets/
│   ├── buzz.mp3
│   └── icon.png
└── icon.png               # Optional home-screen icon
```

```html
<link rel="stylesheet" href="styles.css">
<script src="app.js"></script>
<img src="assets/icon.png" alt="">
<audio src="assets/buzz.mp3"></audio>
```

```javascript
document.querySelector('audio').src = 'assets/buzz.mp3';
const levels = await fetch('assets/levels.json').then((res) => res.json());
new Audio('assets/buzz.mp3');
```

A classic single-file OpenScrapp keeps working. Repositories that still ship only `everyapp.json` do not need a rename. New ones use `openscr.json`.

The entrypoint can live in a subfolder (`"entrypoint": "src/index.html"`). Relative URLs in that file are resolved from `src/`, and `../assets/a.png` is allowed as long as it stays inside the OpenScrapp. `file://` URLs are not used and cannot read the rest of the phone. A link to another page (`<a href="page.html">`) opens that HTML file in the same WebView.

OpenScr downloads the folder that contains `openscr.json` (the repo root when the manifest is there, otherwise the only folder in the repo that has one). Install and update read the public `main` branch. Limits: 500 files, 40 MB total, 15 MB per file. `node_modules` and git symlinks are not installed. Put the OpenScrapp in its own repository, or keep a single `openscr.json` at the root of a larger one.

After you push new files, refresh the OpenScrapp in OpenScr (⟳). Refresh resolves the latest commit of `main` via the GitHub API and downloads `raw.githubusercontent.com/<owner>/<repo>/<commit-sha>/…`. The previous URL under `/main/` stays on GitHub’s CDN for several minutes and ignores a `?t=` cache buster, which is why a refresh used to keep the old files while delete-and-install could see a newer copy. The OpenScrapp’s storage (for example a saved game) is kept. The row shows the installed commit and, when a newer one exists, that an update is available. Opening the container checks for that in the background.

### Dateien und Ordner (Deutsch)

Eine OpenScrapp startet weiter über `openscr.json` und das Feld `entrypoint`. Alles andere darf frei verteilt sein: eine einzelne HTML-Datei, oder HTML plus JavaScript, CSS und Medien in beliebigen Ordnern. Relative Pfade gelten ab der Datei, in der sie stehen.

```
deine-OpenScrapp/
├── openscr.json
├── index.html
├── styles.css
├── app.js
└── assets/
    ├── buzz.mp3
    └── icon.png
```

Im HTML zum Beispiel `href="styles.css"`, `src="app.js"`, `src="assets/buzz.mp3"`. Im Script funktionieren `fetch('assets/levels.json')`, `img.src = 'assets/icon.png'` und `new Audio('assets/buzz.mp3')`. CSS `url(...)` ist relativ zur CSS-Datei. `../` darf den Ordner der OpenScrapp nicht verlassen. Die App liest keine anderen Dateien auf dem Gerät.

Bestehende Ein-Datei-Repos müssen nicht geändert werden. Der Einstieg darf in einem Unterordner liegen (`"entrypoint": "src/index.html"`). Ein Link `<a href="seite.html">` öffnet diese HTML-Datei.

OpenScr lädt den Ordner, der `openscr.json` enthält, vom öffentlichen Branch `main`. Grenzen: 500 Dateien, 40 MB insgesamt, 15 MB pro Datei. `node_modules` und Git-Symlinks werden nicht installiert. Nach dem Push neuer Dateien die OpenScrapp in OpenScr mit ⟳ aktualisieren. Die App ermittelt dafür den aktuellen Commit von `main` und lädt die Dateien über diese Commit-SHA, nicht über die gecachte Adresse `/main/`. Der Speicher der OpenScrapp (Spielstand) bleibt erhalten.

### Manifest Format (`openscr.json`)

```json
{
  "name": "My Mini App",
  "version": "1.0.0",
  "description": "A brief description of your app",
  "icon": "icon.png",
  "entrypoint": "index.html",
  "permissions": ["storage", "http", "vibration"]
}
```

**Fields:**
- `name` (string, required): Display name of the OpenScrapp
- `version` (string, required): Semantic version
- `description` (string, required): Brief description
- `icon` (string, optional): Relative path to icon image
- `entrypoint` (string, required): Relative path to HTML entry point
- `permissions` (array, required): List of requested permissions

**Available Permissions:**
- `storage` - Local key-value storage (scoped per app)
- `http` - Network requests (including cleartext HTTP to LAN devices)
- `bluetooth` - Bluetooth access (BLE scan/connect + classic Bluetooth events)
- `notifications` - Local push notifications
- `camera` - Camera access
- `sensors` - Accelerometer and gyroscope readings
- `vibration` - Haptic feedback
- `background` - Background execution with foreground service
- `spotify` - Search Spotify and control playback in the installed Spotify app (not free; the user must grant it). Setup: [SPOTIFY.md](SPOTIFY.md)

## Bridge API Reference

The OpenScr bridge is available globally as `window.OpenScrBridge` in your OpenScrapp's WebView context. `window.EveryAppBridge` is the same object and remains as a compatibility alias.

### Storage API

```javascript
// Get a value
const value = await window.OpenScrBridge.storage.get('key');

// Set a value
await window.OpenScrBridge.storage.set('key', 'value');

// Remove a value
await window.OpenScrBridge.storage.remove('key');
```

**Note:** Storage is scoped per OpenScrapp. Keys are prefixed with `@miniapp_<appId>_`. Values are text, at most 256 KiB. The allowed method list, rate limits, and the explicit absence of file system, contacts, and location are documented in [docs/BRIDGE_API.md](docs/BRIDGE_API.md).

### HTTP API

**Standard Fetch (compatible with existing code):**
```javascript
const response = await window.OpenScrBridge.http.fetch('https://api.example.com/data', {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
// or
const text = await response.text();
```

**Advanced Request (for LAN devices, with full response details):**
```javascript
const response = await window.OpenScrBridge.http.request({
  url: 'http://192.168.178.20:8080/api/data',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Custom-Header': 'value'
  },
  body: JSON.stringify({ key: 'value' }),
  timeoutMs: 5000  // Optional timeout in milliseconds
});

// Response contains: { status, headers, body }
console.log(response.status);  // HTTP status code
console.log(response.headers); // Object with response headers
console.log(response.body);    // Response body as text
```

**Note:** The container supports cleartext HTTP (e.g., `http://` to LAN devices). This is enabled via `usesCleartextTraffic` in the Android manifest.

### Bluetooth API

**BLE Operations (Low Energy):**
```javascript
// Scan for BLE devices (returns array of peripherals)
const devices = await window.OpenScrBridge.bluetooth.scan();

// Connect to a BLE device
await window.OpenScrBridge.bluetooth.connect(deviceId);

// Disconnect from a BLE device
await window.OpenScrBridge.bluetooth.disconnect(deviceId);
```

**Classic Bluetooth:**
```javascript
// Get currently connected classic Bluetooth devices
const connectedDevices = await window.OpenScrBridge.bluetooth.getConnectedDevices();
// Returns: [{ name: string, address: string }, ...]

// Listen for Bluetooth connection events
window.OpenScrBridge.events.on('bluetooth.connected', (device) => {
  console.log(`Device connected: ${device.name} (${device.address})`);
});

window.OpenScrBridge.events.on('bluetooth.disconnected', (device) => {
  console.log(`Device disconnected: ${device.name} (${device.address})`);
});
```

**Requirements:**
- Android API 31+ requires `BLUETOOTH_CONNECT` runtime permission
- Classic Bluetooth events are triggered by the system when devices connect/disconnect

### Notifications API

```javascript
// Schedule a notification
await window.OpenScrBridge.notifications.schedule(
  'Notification Title',
  'Notification body text',
  5  // seconds until notification appears
);
```

### Camera API

```javascript
// Request camera and take picture (returns file URI)
const imageUri = await window.OpenScrBridge.camera.takePicture();
```

**Note:** Camera functionality requires additional UI component integration in the host app for full functionality.

### Sensors API

```javascript
// Get accelerometer reading
const accel = await window.OpenScrBridge.sensors.getAccelerometer();
// Returns: { x: number, y: number, z: number }

// Get gyroscope reading
const gyro = await window.OpenScrBridge.sensors.getGyroscope();
// Returns: { x: number, y: number, z: number }
```

### Vibration API

```javascript
// Simple vibration
window.OpenScrBridge.vibration.vibrate();

// Pattern vibration (array of durations in ms)
window.OpenScrBridge.vibration.vibrate([100, 50, 100, 50, 200]);
```

### Background Execution API

```javascript
// Enable background execution for this OpenScrapp
await window.OpenScrBridge.background.enable();
// Arms background mode. The foreground service stays up only for interval
// triggers or a connected/due BLE notify. Other triggers use a short headless task.

// Disable background execution
await window.OpenScrBridge.background.disable();

// Check if background execution is enabled
const isEnabled = await window.OpenScrBridge.background.isEnabled();
```

**Background Behavior:**
- OpenScrapps with the `background` permission can keep running when OpenScr is in the background or the screen is off
- A persistent notification is shown only while an interval or a connected/due BLE notify needs the process
- The OpenScrapp can continue to:
  - Receive Bluetooth connection events
  - Make HTTP requests
  - Execute scheduled logic
- Background execution stops when:
  - `background.disable()` is called
  - The user stops the service from the notification
  - OpenScr is force-stopped

**Requirements:**
- Mini-app must declare `"background"` permission in manifest
- Android displays a persistent foreground service notification
- Battery optimization prompt will appear on first enable

### Spotify API

Permission: `"spotify"` in `openscr.json`, granted by the user. Playback uses the **Spotify Android app** (App Remote). The WebView does not stream audio. Search uses the Web API with a PKCE token kept inside OpenScr. There is no client secret in this repo, and new Spotify apps must not rely on `preview_url`.

The Client ID is **not** baked into the build. Enter it in OpenScr under **Spotify** on the home screen (stored in the container settings, not in an OpenScrapp repo). It applies immediately. A granted OpenScrapp can read or set the same value. Precedence when several values exist:

1. OpenScr settings (source of truth)
2. `spotify.setClientId()` from an OpenScrapp
3. Optional build prefill `expo.extra.spotifyClientId` / `SPOTIFY_CLIENT_ID` (empty is normal)

Changing the Client ID does not require a new native build. The redirect URI, package names and Spotify SDK do.

The same screen has a German walkthrough (**Anleitung**) next to the Client ID field. It covers creating the Dashboard app on a computer ([Spotify Developer Dashboard](https://developer.spotify.com/dashboard)) with **Web API** and **Android SDK** (not the Web Playback SDK), the redirect URI `openscr://spotify-callback`, empty Bundle IDs (iOS-only; OpenScr is Android-only for now), and the Android package name plus SHA-1 of the **running** variant. Development / SrvOpenScr (`APP_VARIANT=development`, `com.openscr.app.dev`) uses the debug-keystore SHA-1 `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`. Production / OpenScr (`com.openscr.app`) has no signing SHA-1 in this repo — read it from the signing certificate or the EAS Android credentials, and do not reuse the debug fingerprint. The phone still needs the Spotify app and a Premium login to start a specific track. The API and SDK themselves cost nothing extra. Same steps, in German, in [SPOTIFY.md](SPOTIFY.md).

```javascript
const status = await OpenScrBridge.spotify.isAvailable();
// { installed, connected, authorized, premium }  premium is null until known

await OpenScrBridge.spotify.setClientId(clientIdFromTheUser);
const id = await OpenScrBridge.spotify.getClientId();
// { clientId, source: 'settings'|'bridge'|'prefill'|'none', settingsClientId, bridgeClientId, prefillClientId }
// If source is 'settings', setClientId is stored but does not override the settings field.

await OpenScrBridge.spotify.login();   // Authorization Code + PKCE, opens Spotify or the browser
await OpenScrBridge.spotify.connect();  // App Remote; may show Spotify's auth view

const found = await OpenScrBridge.spotify.search('yellow submarine', { types: ['track'], limit: 5 });
const uri = found.tracks.items[0].uri;
await OpenScrBridge.spotify.play(uri, { positionMs: 15000 }); // needs Premium for a track URI
await OpenScrBridge.spotify.seek(40000);
await OpenScrBridge.spotify.pause();
await OpenScrBridge.spotify.resume();
await OpenScrBridge.spotify.skipNext();
await OpenScrBridge.spotify.skipPrevious();
await OpenScrBridge.spotify.stop(); // pause and seek to 0 (App Remote has no separate stop)
const state = await OpenScrBridge.spotify.getPlayerState();
// { connected, paused, positionMs, playbackSpeed, canSeek, track: { uri, name, artist, artists, album, durationMs } }

await OpenScrBridge.spotify.getMe();                 // { id, displayName, product, premium }
await OpenScrBridge.spotify.getMyPlaylists({ limit: 20 });
await OpenScrBridge.spotify.getSavedTracks({ limit: 20 });

await OpenScrBridge.spotify.disconnect();
await OpenScrBridge.spotify.logout(); // forgets the Web API token; does not remove the Client ID

OpenScrBridge.events.on('spotify.connected', (data) => console.log('connected', data));
OpenScrBridge.events.on('spotify.disconnected', (data) => console.log('disconnected', data));
OpenScrBridge.events.on('spotify.player', (state) => console.log(state.track && state.track.name, state.positionMs));
OpenScrBridge.events.on('spotify.error', (err) => console.log(err.message));
```

`OpenScrBridge.media.*` still sends generic media keys and is unchanged. It cannot start a specific Spotify URI.

If no Client ID is saved, `login`, `connect`, `play` and `search` reject with: `Keine Spotify Client ID hinterlegt. Bitte in den OpenScr-Einstellungen eintragen.` Other readable German errors cover: Spotify not installed, auth cancelled, not Premium, connection dropped, and Web API rate limits. The access token is not given to the OpenScrapp.

### Events API

```javascript
// Listen for app lifecycle events
window.OpenScrBridge.events.on('app.start', (data) => {
  console.log('Mini-app runtime started at:', data.timestamp);
  // This event fires when the OpenScrapp is loaded (foreground or background)
});

// Listen for Bluetooth events (requires 'bluetooth' permission)
window.OpenScrBridge.events.on('bluetooth.connected', (device) => {
  console.log('Bluetooth device connected:', device.name, device.address);
});

window.OpenScrBridge.events.on('bluetooth.disconnected', (device) => {
  console.log('Bluetooth device disconnected:', device.name, device.address);
});

// Remove event listeners
window.OpenScrBridge.events.off('app.start', callback);
```

**Available Events:**
- `app.start` - Fired when the OpenScrapp runtime starts (no permission required)
- `bluetooth.connected` - Classic Bluetooth device connected (requires `bluetooth` permission)
- `bluetooth.disconnected` - Classic Bluetooth device disconnected (requires `bluetooth` permission)
- `spotify.connected` / `spotify.disconnected` / `spotify.player` / `spotify.error` - Spotify App Remote (requires `spotify` permission to call the API; events arrive on the same event bus)

## EveryMacro Use Case

The **EveryMacro** OpenScrapp is a prime example of the new capabilities:

**Scenario:** A macro automation app that monitors classic Bluetooth device connections (e.g., car, headphones, smart home devices) and triggers HTTP requests to control LAN devices.

**Required Permissions:**
```json
{
  "permissions": ["bluetooth", "http", "storage", "background", "notifications"]
}
```

**Implementation Example:**
```javascript
// Enable background execution to monitor devices 24/7
await window.OpenScrBridge.background.enable();

// Listen for device connections
window.OpenScrBridge.events.on('bluetooth.connected', async (device) => {
  // When car Bluetooth connects, turn on home lights
  if (device.name === 'MY-CAR') {
    await window.OpenScrBridge.http.request({
      url: 'http://192.168.1.100/api/lights/on',
      method: 'POST',
      timeoutMs: 3000
    });
    
    await window.OpenScrBridge.notifications.schedule(
      'Macro Triggered',
      'Home lights turned on',
      1
    );
  }
});

// On app start, check currently connected devices
window.OpenScrBridge.events.on('app.start', async () => {
  const devices = await window.OpenScrBridge.bluetooth.getConnectedDevices();
  console.log('Currently connected devices:', devices);
});
```

**Key Features Utilized:**
1. **Classic Bluetooth Events** - Real-time connection/disconnection monitoring
2. **Background Execution** - Keeps running even when screen is off
3. **LAN HTTP Requests** - Cleartext HTTP to local smart home devices
4. **Event System** - `app.start` ensures initialization on background wake

## Example OpenScrapps

Two example OpenScrapps are included in the `examples/` directory:

### 1. Dice Game (`examples/dice-game/`)

A simple dice rolling game demonstrating:
- Storage API (persisting game statistics)
- Vibration API (haptic feedback on roll)
- Notifications API (new high score alerts)

**Repository URL for testing:**
```
https://github.com/YOUR_USERNAME/YOUR_REPO/tree/main/examples/dice-game
```

### 2. HTTP Demo (`examples/http-demo/`)

Demonstrates HTTP requests with:
- HTTP API (fetching data from public APIs)
- Storage API (request history)
- Error handling and loading states

**Repository URL for testing:**
```
https://github.com/YOUR_USERNAME/YOUR_REPO/tree/main/examples/http-demo
```

## Building and Installation

### Prerequisites

- Node.js 18+ and npm
- Android Studio (for local builds)
- Expo CLI
- Java Development Kit (JDK) 17+

### Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd EveryApp
```

2. Install dependencies:
```bash
npm install
```

3. Configure EAS (Expo Application Services):
```bash
npm install -g eas-cli
eas login
eas build:configure
```

### Development

Run the app in development mode:

```bash
# Start Expo dev server
npm start

# Run on Android device/emulator
npm run android
```

### Building APK

#### Option 1: EAS Build (Recommended)

```bash
# Build preview APK (development profile)
eas build --platform android --profile preview

# Build production APK
eas build --platform android --profile production
```

The APK will be available for download from the Expo dashboard after the build completes.

#### Option 2: Local Build

```bash
# Generate native Android project
npx expo prebuild --platform android

# Build with Gradle
cd android
./gradlew assembleRelease

# APK location:
# android/app/build/outputs/apk/release/app-release.apk
```

### Installing APK

1. Enable "Install from Unknown Sources" on your Android device
2. Transfer the APK to your device
3. Open the APK file to install

Or use ADB:
```bash
adb install path/to/app.apk
```

## Architecture

### Project Structure

```
everyapp/
├── src/
│   ├── bridge/
│   │   ├── BridgeMessageHandler.ts    # WebView bridge implementation
│   │   └── NativeCapabilities.ts      # Native API implementations
│   ├── components/
│   │   ├── MiniAppRunner.tsx          # WebView container
│   │   └── PermissionRequestModal.tsx # Permission consent UI
│   ├── screens/
│   │   └── HomeScreen.tsx             # Main app screen
│   ├── services/
│   │   ├── GitRepoService.ts          # GitHub repo fetching
│   │   └── StorageService.ts          # Persistent storage
│   └── types/
│       └── index.ts                   # TypeScript definitions
├── examples/
│   ├── dice-game/                     # Example OpenScrapp
│   └── http-demo/                     # Example OpenScrapp
├── App.tsx                            # Entry point
├── app.json                           # Expo configuration
└── package.json
```

### Data Flow

1. User adds GitHub repository URL
2. `GitRepoService` downloads the OpenScrapp folder that contains `openscr.json` (manifest, entrypoint, scripts, styles, and assets)
3. Files are cached locally using Expo FileSystem
4. App metadata saved to AsyncStorage
5. When launched, `MiniAppRunner` loads HTML into WebView
6. Bridge script injected into WebView provides `window.OpenScrBridge`
7. Mini-app calls bridge methods via `postMessage`
8. `BridgeMessageHandler` validates permissions and executes native APIs
9. Results returned to WebView via injected JavaScript

## Future Roadmap

**Not implemented in v1** but architecture supports:

- iOS compatibility (most code is cross-platform ready)
- SQLite/database access
- In-app purchases
- Private repositories with token authentication
- File system access
- Geolocation
- Audio recording/playback
- WebSocket support
- App marketplace/discovery
- Code signing and verification
- Sandboxed execution limits (CPU/memory)

## Limitations

### Current Limitations

- **Public repositories only**: No authentication for private repos
- **No marketplace**: Repos are added by URL, in-app QR scan, or an add-link — there is no discovery UI
- **Basic error handling**: Network errors may not be fully user-friendly
- **Camera integration incomplete**: Requires additional native camera UI component
- **Android only**: iOS support not yet implemented
- **Single branch**: Always fetches from `main` branch
- **No updates**: Apps are cached; changes require re-adding the repository
- **Mini-app size**: At most 500 files, 40 MB total, and 15 MB per file, from the public `main` branch. `node_modules` is not downloaded

### Security Considerations

- WebView sandboxing provides basic isolation. Mini-app files are loaded without `file://` access, so a page cannot read arbitrary files outside its own directory
- Permissions must be explicitly granted by users
- OpenScrapps cannot access other apps' data
- HTTP requests are not proxied or filtered
- Consider implementing content security policies for production use

## Troubleshooting

### Common Issues

**Build fails with "Duplicate resources"**
- Clean build: `cd android && ./gradlew clean`
- Delete `node_modules` and reinstall

**WebView not loading**
- Check that `openscr.json` exists in repository root
- Verify `entrypoint` path is correct
- Check browser console for JavaScript errors

**Permissions not working**
- Ensure permission is listed in `openscr.json`
- Check that user granted permission in consent dialog
- Review Android system permissions in app settings

**Bluetooth not scanning**
- Android 12+ requires location permission for Bluetooth scanning
- Ensure Bluetooth is enabled on device
- Check app has granted location permissions in system settings

## Contributing

Contributions are welcome! Areas for improvement:

- iOS compatibility
- Enhanced error handling
- Asset bundling and caching
- Private repository support
- App discovery/marketplace
- Automated testing

## License

See LICENSE file for details.

---

## Quick Start Checklist

- [ ] Clone repository
- [ ] Run `npm install`
- [ ] Connect Android device or start emulator
- [ ] Run `npm run android`
- [ ] In the app, add example OpenScrapp repository URL
- [ ] Grant requested permissions
- [ ] Test OpenScrapp functionality

For questions or issues, please open a GitHub issue.
