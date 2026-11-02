# EveryApp

**EveryApp** is an Android container app that runs mini-apps loaded on demand from public Git repositories, without requiring app store deployments. Built with React Native, Expo, and TypeScript.

## Features

### v1.0 Capabilities

- **Load Mini-Apps from GitHub**: Add public GitHub repository URLs to fetch and run mini-apps
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
- `storage` - Local key-value storage
- `http` - Network requests
- `bluetooth` - Bluetooth access
- `notifications` - Push notifications
- `camera` - Camera access
- `sensors` - Accelerometer/gyroscope
- `vibration` - Haptic feedback

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

### Bluetooth API

```javascript
// Scan for devices (returns array of peripherals)
const devices = await window.EveryAppBridge.bluetooth.scan();

// Connect to a device
await window.EveryAppBridge.bluetooth.connect(deviceId);

// Disconnect from a device
await window.EveryAppBridge.bluetooth.disconnect(deviceId);
```

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
- **Manual URL entry**: No discovery or marketplace UI
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
