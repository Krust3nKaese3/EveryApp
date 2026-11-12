# EveryApp

**EveryApp** is an Android container app that runs mini-apps loaded on demand from public Git repositories, without requiring app store deployments. Built with React Native, Expo, and TypeScript.

## Features

### v1.0 Capabilities

- **Load Mini-Apps from GitHub**: Add public GitHub repository URLs to fetch and run mini-apps (typed URL, in-app QR scan, or an EveryApp add-link)
- **QR install**: Scan a QR code in the app, or open an add-link with the system camera (see below)
- **Sandboxed WebView Execution**: Each mini-app runs in its own isolated WebView with controlled access to native capabilities
- **Permission System**: User consent prompts for requested permissions with fine-grained control
- **Folder Organization**: Create, rename, delete folders and organize apps between them
- **Native Bridge API**: Typed JavaScript bridge exposing native capabilities to mini-apps
- **Full-Screen Support**: Orientation unlocking for games and immersive experiences
- **Performance Optimized**: WebView configured for 60 FPS rendering suitable for Canvas/WebGL games

### Supported Native Capabilities

Mini-apps can request access to the following through the permission system:

- **Storage**: Persistent key-value storage (scoped per app)
- **HTTP**: Network requests to external APIs
- **Bluetooth**: Scan, connect, and disconnect Bluetooth devices
- **Notifications**: Schedule local notifications
- **Camera**: Camera access (requires additional UI integration)
- **Sensors**: Accelerometer and gyroscope data
- **Vibration**: Haptic feedback

## Adding a mini-app with a QR code

On the home screen, next to **Add**, tap **QR**. The in-app camera accepts:

- an EveryApp add-link (either scheme below)
- a plain GitHub repository URL (`https://github.com/owner/repo` or the same URL ending in `.git`)

Anything else shows an error and does not install a mini-app. After a successful scan the camera closes so the same code is not added twice. If that repository is already installed, EveryApp says so and can open it.

A plain `https://github.com/...` QR works **only in the in-app scanner**. The system camera treats that as a web link and opens the browser.

### Add-links (system camera and in-app scanner)

The host `add` is reserved (it is not a mini-app name). The GitHub URL is the `url` query parameter, percent-encoded. The same path and query work on both schemes; pick the scheme that opens the app you have installed.

| App | Package | Link |
| --- | --- | --- |
| Production **EveryApp** | `com.everyapp.container` | `everyapp://add?url=<encoded https GitHub URL>` |
| Dev client **SrvEveryApp** | `com.everyapp.container.dev` | `exp+everyapp://add?url=<encoded https GitHub URL>` (preferred; this scheme is what opens the dev client). `everyapp://add?url=…` is also accepted if that build is the one that handles the scheme. |

Example for `https://github.com/Krust3nKaese3/evryGuessTheSong`:

- Dev client (SrvEveryApp): `exp+everyapp://add?url=https%3A%2F%2Fgithub.com%2FKrust3nKaese3%2FevryGuessTheSong`
- Production EveryApp: `everyapp://add?url=https%3A%2F%2Fgithub.com%2FKrust3nKaese3%2FevryGuessTheSong`

Opening one of those links (app already running, or cold start) runs the same fetch and save as **Add**, including the success and error alerts. Existing mini-app links such as `everyapp://EveryMacro/...` are unchanged. `everyapp://spotify-callback` and the dev-launcher URL `exp+everyapp://expo-development-client/...` are not install links.

## Mini-App Repository Format

### Directory Structure

```
your-miniapp-repo/
├── everyapp.json       # Manifest file (required)
├── index.html          # Entry point (or other HTML file)
└── icon.png           # App icon (optional)
```

### Manifest Format (`everyapp.json`)

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
- `name` (string, required): Display name of the mini-app
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

The EveryApp bridge is available globally as `window.EveryAppBridge` in your mini-app's WebView context.

### Storage API

```javascript
// Get a value
const value = await window.EveryAppBridge.storage.get('key');

// Set a value
await window.EveryAppBridge.storage.set('key', 'value');

// Remove a value
await window.EveryAppBridge.storage.remove('key');
```

**Note:** Storage is scoped per mini-app. Keys are automatically prefixed to prevent conflicts.

### HTTP API

**Standard Fetch (compatible with existing code):**
```javascript
const response = await window.EveryAppBridge.http.fetch('https://api.example.com/data', {
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
const response = await window.EveryAppBridge.http.request({
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
const devices = await window.EveryAppBridge.bluetooth.scan();

// Connect to a BLE device
await window.EveryAppBridge.bluetooth.connect(deviceId);

// Disconnect from a BLE device
await window.EveryAppBridge.bluetooth.disconnect(deviceId);
```

**Classic Bluetooth:**
```javascript
// Get currently connected classic Bluetooth devices
const connectedDevices = await window.EveryAppBridge.bluetooth.getConnectedDevices();
// Returns: [{ name: string, address: string }, ...]

// Listen for Bluetooth connection events
window.EveryAppBridge.events.on('bluetooth.connected', (device) => {
  console.log(`Device connected: ${device.name} (${device.address})`);
});

window.EveryAppBridge.events.on('bluetooth.disconnected', (device) => {
  console.log(`Device disconnected: ${device.name} (${device.address})`);
});
```

**Requirements:**
- Android API 31+ requires `BLUETOOTH_CONNECT` runtime permission
- Classic Bluetooth events are triggered by the system when devices connect/disconnect

### Notifications API

```javascript
// Schedule a notification
await window.EveryAppBridge.notifications.schedule(
  'Notification Title',
  'Notification body text',
  5  // seconds until notification appears
);
```

### Camera API

```javascript
// Request camera and take picture (returns file URI)
const imageUri = await window.EveryAppBridge.camera.takePicture();
```

**Note:** Camera functionality requires additional UI component integration in the host app for full functionality.

### Sensors API

```javascript
// Get accelerometer reading
const accel = await window.EveryAppBridge.sensors.getAccelerometer();
// Returns: { x: number, y: number, z: number }

// Get gyroscope reading
const gyro = await window.EveryAppBridge.sensors.getGyroscope();
// Returns: { x: number, y: number, z: number }
```

### Vibration API

```javascript
// Simple vibration
window.EveryAppBridge.vibration.vibrate();

// Pattern vibration (array of durations in ms)
window.EveryAppBridge.vibration.vibrate([100, 50, 100, 50, 200]);
```

### Background Execution API

```javascript
// Enable background execution for this mini-app
await window.EveryAppBridge.background.enable();
// Arms background mode. The foreground service stays up only for interval
// triggers or a connected/due BLE notify. Other triggers use a short headless task.

// Disable background execution
await window.EveryAppBridge.background.disable();

// Check if background execution is enabled
const isEnabled = await window.EveryAppBridge.background.isEnabled();
```

**Background Behavior:**
- Mini-apps with the `background` permission can keep running when EveryApp is in the background or the screen is off
- A persistent notification is shown only while an interval or a connected/due BLE notify needs the process
- The mini-app can continue to:
  - Receive Bluetooth connection events
  - Make HTTP requests
  - Execute scheduled logic
- Background execution stops when:
  - `background.disable()` is called
  - The user stops the service from the notification
  - EveryApp is force-stopped

**Requirements:**
- Mini-app must declare `"background"` permission in manifest
- Android displays a persistent foreground service notification
- Battery optimization prompt will appear on first enable

### Spotify API

Permission: `"spotify"` in `everyapp.json`, granted by the user. Playback uses the **Spotify Android app** (App Remote). The WebView does not stream audio. Search uses the Web API with a PKCE token kept inside EveryApp. There is no client secret in this repo, and new Spotify apps must not rely on `preview_url`.

The Client ID is **not** baked into the build. Enter it in EveryApp under **Spotify** on the home screen (stored in the container settings, not in a mini-app repo). It applies immediately. A granted mini-app can read or set the same value. Precedence when several values exist:

1. EveryApp settings (source of truth)
2. `spotify.setClientId()` from a mini-app
3. Optional build prefill `expo.extra.spotifyClientId` / `SPOTIFY_CLIENT_ID` (empty is normal)

Changing the Client ID does not require a new native build. The redirect URI, package names and Spotify SDK do.

The same screen has a German walkthrough (**Anleitung**) next to the Client ID field. It covers creating the Dashboard app on a computer ([Spotify Developer Dashboard](https://developer.spotify.com/dashboard)) with **Web API** and **Android SDK** (not the Web Playback SDK), the redirect URI `everyapp://spotify-callback`, empty Bundle IDs (iOS-only; EveryApp is Android-only for now), and the Android package name plus SHA-1 of the **running** variant. Development / SrvEveryApp (`APP_VARIANT=development`, `com.everyapp.container.dev`) uses the debug-keystore SHA-1 `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`. Production / EveryApp (`com.everyapp.container`) has no signing SHA-1 in this repo — read it from the signing certificate or the EAS Android credentials, and do not reuse the debug fingerprint. The phone still needs the Spotify app and a Premium login to start a specific track. The API and SDK themselves cost nothing extra. Same steps, in German, in [SPOTIFY.md](SPOTIFY.md).

```javascript
const status = await EveryAppBridge.spotify.isAvailable();
// { installed, connected, authorized, premium }  premium is null until known

await EveryAppBridge.spotify.setClientId(clientIdFromTheUser);
const id = await EveryAppBridge.spotify.getClientId();
// { clientId, source: 'settings'|'bridge'|'prefill'|'none', settingsClientId, bridgeClientId, prefillClientId }
// If source is 'settings', setClientId is stored but does not override the settings field.

await EveryAppBridge.spotify.login();   // Authorization Code + PKCE, opens Spotify or the browser
await EveryAppBridge.spotify.connect();  // App Remote; may show Spotify's auth view

const found = await EveryAppBridge.spotify.search('yellow submarine', { types: ['track'], limit: 5 });
const uri = found.tracks.items[0].uri;
await EveryAppBridge.spotify.play(uri, { positionMs: 15000 }); // needs Premium for a track URI
await EveryAppBridge.spotify.seek(40000);
await EveryAppBridge.spotify.pause();
await EveryAppBridge.spotify.resume();
await EveryAppBridge.spotify.skipNext();
await EveryAppBridge.spotify.skipPrevious();
await EveryAppBridge.spotify.stop(); // pause and seek to 0 (App Remote has no separate stop)
const state = await EveryAppBridge.spotify.getPlayerState();
// { connected, paused, positionMs, playbackSpeed, canSeek, track: { uri, name, artist, artists, album, durationMs } }

await EveryAppBridge.spotify.getMe();                 // { id, displayName, product, premium }
await EveryAppBridge.spotify.getMyPlaylists({ limit: 20 });
await EveryAppBridge.spotify.getSavedTracks({ limit: 20 });

await EveryAppBridge.spotify.disconnect();
await EveryAppBridge.spotify.logout(); // forgets the Web API token; does not remove the Client ID

EveryAppBridge.events.on('spotify.connected', (data) => console.log('connected', data));
EveryAppBridge.events.on('spotify.disconnected', (data) => console.log('disconnected', data));
EveryAppBridge.events.on('spotify.player', (state) => console.log(state.track && state.track.name, state.positionMs));
EveryAppBridge.events.on('spotify.error', (err) => console.log(err.message));
```

`EveryAppBridge.media.*` still sends generic media keys and is unchanged. It cannot start a specific Spotify URI.

If no Client ID is saved, `login`, `connect`, `play` and `search` reject with: `Keine Spotify Client ID hinterlegt. Bitte in den EveryApp-Einstellungen eintragen.` Other readable German errors cover: Spotify not installed, auth cancelled, not Premium, connection dropped, and Web API rate limits. The access token is not given to the mini-app.

### Events API

```javascript
// Listen for app lifecycle events
window.EveryAppBridge.events.on('app.start', (data) => {
  console.log('Mini-app runtime started at:', data.timestamp);
  // This event fires when the mini-app is loaded (foreground or background)
});

// Listen for Bluetooth events (requires 'bluetooth' permission)
window.EveryAppBridge.events.on('bluetooth.connected', (device) => {
  console.log('Bluetooth device connected:', device.name, device.address);
});

window.EveryAppBridge.events.on('bluetooth.disconnected', (device) => {
  console.log('Bluetooth device disconnected:', device.name, device.address);
});

// Remove event listeners
window.EveryAppBridge.events.off('app.start', callback);
```

**Available Events:**
- `app.start` - Fired when the mini-app runtime starts (no permission required)
- `bluetooth.connected` - Classic Bluetooth device connected (requires `bluetooth` permission)
- `bluetooth.disconnected` - Classic Bluetooth device disconnected (requires `bluetooth` permission)
- `spotify.connected` / `spotify.disconnected` / `spotify.player` / `spotify.error` - Spotify App Remote (requires `spotify` permission to call the API; events arrive on the same event bus)

## EveryMacro Use Case

The **EveryMacro** mini-app is a prime example of the new capabilities:

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
await window.EveryAppBridge.background.enable();

// Listen for device connections
window.EveryAppBridge.events.on('bluetooth.connected', async (device) => {
  // When car Bluetooth connects, turn on home lights
  if (device.name === 'MY-CAR') {
    await window.EveryAppBridge.http.request({
      url: 'http://192.168.1.100/api/lights/on',
      method: 'POST',
      timeoutMs: 3000
    });
    
    await window.EveryAppBridge.notifications.schedule(
      'Macro Triggered',
      'Home lights turned on',
      1
    );
  }
});

// On app start, check currently connected devices
window.EveryAppBridge.events.on('app.start', async () => {
  const devices = await window.EveryAppBridge.bluetooth.getConnectedDevices();
  console.log('Currently connected devices:', devices);
});
```

**Key Features Utilized:**
1. **Classic Bluetooth Events** - Real-time connection/disconnection monitoring
2. **Background Execution** - Keeps running even when screen is off
3. **LAN HTTP Requests** - Cleartext HTTP to local smart home devices
4. **Event System** - `app.start` ensures initialization on background wake

## Example Mini-Apps

Two example mini-apps are included in the `examples/` directory:

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
cd everyapp
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
│   ├── dice-game/                     # Example mini-app
│   └── http-demo/                     # Example mini-app
├── App.tsx                            # Entry point
├── app.json                           # Expo configuration
└── package.json
```

### Data Flow

1. User adds GitHub repository URL
2. `GitRepoService` fetches `everyapp.json` manifest and entry HTML
3. Files are cached locally using Expo FileSystem
4. App metadata saved to AsyncStorage
5. When launched, `MiniAppRunner` loads HTML into WebView
6. Bridge script injected into WebView provides `window.EveryAppBridge`
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
- **Limited asset support**: Only HTML and referenced files in manifest are loaded

### Security Considerations

- WebView sandboxing provides basic isolation
- Permissions must be explicitly granted by users
- Mini-apps cannot access other apps' data
- HTTP requests are not proxied or filtered
- Consider implementing content security policies for production use

## Troubleshooting

### Common Issues

**Build fails with "Duplicate resources"**
- Clean build: `cd android && ./gradlew clean`
- Delete `node_modules` and reinstall

**WebView not loading**
- Check that `everyapp.json` exists in repository root
- Verify `entrypoint` path is correct
- Check browser console for JavaScript errors

**Permissions not working**
- Ensure permission is listed in `everyapp.json`
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
- [ ] In the app, add example mini-app repository URL
- [ ] Grant requested permissions
- [ ] Test mini-app functionality

For questions or issues, please open a GitHub issue.
