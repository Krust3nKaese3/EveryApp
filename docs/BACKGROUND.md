# EveryApp Background Tasks API

Any mini-app with the `background` permission can register **background tasks**: a list of triggers plus a JS handler.
EveryApp runs the handler in its own (headless) JS engine – also when the mini-app is closed, EveryApp is in the
background, or EveryApp was swiped away from recents. Tasks are stored per `appId`; one app can never see or remove another app's tasks.

Tasks only run while **background mode is enabled for that app** (`EveryAppBridge.background.enable()`), which starts the
foreground service (persistent notification "EveryApp aktiv"). It is restarted automatically after reboot.

## Bridge API (`window.EveryAppBridge.background`)

| Method | Description |
|---|---|
| `enable()` / `disable()` / `isEnabled()` | Background mode for this app (foreground service). Asks for notification permission. |
| `handlesTriggers()` | `true` if this EveryApp version supports background tasks (feature check). |
| `registerTask(task)` | Register or replace (same `id`) a task. Throws on invalid triggers or syntax errors. |
| `unregisterTask(id)` | Remove one task. |
| `unregisterAll()` | Remove all tasks of this app. |
| `listTasks()` | Registered tasks of this app. |
| `getLog()` / `clearLog()` | Background log as a JSON string `[{message, level, timestamp, time}]`, newest first, max. 200 entries. |

### Task object
```js
await EveryAppBridge.background.registerTask({
  id: "denon-on",                 // unique per app
  name: "Denon einschalten",      // optional, shown in logs
  triggers: [
    { type: "bluetoothConnected", nameOrAddress: "1Mii" }, // nameOrAddress optional (= any device)
    { type: "bluetoothDisconnected" },
    { type: "interval", ms: 60000 },  // min. 10000
    { type: "boot" },                 // after phone reboot
    { type: "appStart" },             // when the EveryApp UI starts
    { type: "quickTile", name: "Denon an" }, // Quick Settings tile (from the next build on)
  ],
  // Function BODY as a string; runs as: async (ctx, event) => { <code> }
  code: `
    ctx.log("Trigger: " + event.type + " " + (event.device ? event.device.name : ""));
    const r = await ctx.http.get("http://192.168.178.20/goform/formMainZone_MainZoneXml.xml");
    if (r.body.includes("STANDBY")) { await ctx.http.get("http://192.168.178.20/goform/formiPhoneAppDirect.xml?ZMON"); }
  `,
});
```
The code runs outside the WebView: **no DOM, no `window`, no access to variables of your page**. Put everything it needs into the string.

### `event`
`{ type, time, device? }` (`device` only for Bluetooth triggers):
`{ name, alias, address, type: "classic"|"le"|"dual"|"unknown", bondState, majorClass: "AUDIO_VIDEO"…, deviceClass, uuids: [], connected }`.
`name` = original device name, `alias` = name set by the user in Android (Android 11+, otherwise = name).

**Matching:** `nameOrAddress` matches when it equals `name` **or** `alias` **or** `address` (case-insensitive, trimmed). The MAC address is recommended, since it doesn't change.

### `ctx`
| Member | Description |
|---|---|
| `ctx.appId`, `ctx.taskId` | IDs |
| `ctx.log(msg)` | Writes to this app's background log and to the console (`[EveryApp][BG][appId] ...`) |
| `ctx.wait(ms)` | Promise-based delay |
| `ctx.http.get(url)` / `ctx.http.request({url, method, headers, body, timeoutMs})` | → `{status, ok, headers, body}`; default timeout 15 s |
| `ctx.notify(title, body)` | Shows a notification immediately |
| `ctx.media.play/pause/toggle/next/previous/stop()` | **From the next build on:** media keys for the currently active player (like headset buttons). Before that it throws "Media-Steuerung braucht nächsten Build". |
| `ctx.trigger` | `{type, device?, tile?: {index, name}}` – what triggered the run |
| `ctx.device` | Bluetooth device of the trigger (or undefined) |
| `ctx.bluetooth.getConnectedDevices()` / `ctx.bluetooth.isConnected(nameOrMac)` | Currently connected devices; match on name/alias/MAC, case-insensitive. Limited for now (bonded devices with isConnected only); complete from the next build on |
| `ctx.copy(text)` | Copies text to the clipboard |
| `ctx.vibrate(pattern?)` | Vibration, e.g. `[200,100,200]` (on, pause, on in ms) |
| `ctx.storage.get/set/remove(key)` | String storage scoped to this app – **the same keys as `EveryAppBridge.storage`**, so it is shared with the UI |

Errors thrown by the handler are caught and logged as `FEHLER: Task "<id>" fehlgeschlagen: ...` including the stack.

## Behaviour and limits
- Bluetooth: Android's `ACL_CONNECTED/DISCONNECTED` broadcasts, received by a manifest receiver → starts the JS task (Headless JS).
- `interval`: JS timers in the host; they run as long as the EveryApp process lives (kept alive by the foreground service).
- After **"Force stop"** in the Android settings, nothing runs until EveryApp is opened again (an Android rule).
- Set battery usage for EveryApp to **"Unrestricted"**, otherwise Android may kill the service.
- Logcat filter for debugging: `adb logcat | grep -E "EveryApp"`.

## Adding new triggers (for EveryApp developers)
1. Native: have a receiver/source start `MacroHeadlessTaskService` with extra `event=<name>` (see `MacroTriggerReceiver.kt`).
2. JS: map the event in `headlessEntry` and add the type to `Trigger` and to `validate` (`src/services/BackgroundTasks.ts`).

## Other bridge APIs used in this context
- `EveryAppBridge.bluetooth.getConnectedDevices(includePaired?)` → array of device objects (same fields as above). Covers A2DP/HEADSET/HID/LE-Audio/GATT and bonded devices, including devices that were connected before the app started. With `includePaired=true`, paired but disconnected devices are included too (`connected:false`). Throws an error with a readable message, e.g. when the permission is missing.
- `EveryAppBridge.clipboard.setString(text)` – no permission needed.
- `EveryAppBridge.network.isAvailable()` / `getInfo()` → `{transport, ssid, ssidError, ip, prefixLength, gateway, dns, interfaceName}`. No permission needed (asks for location for the SSID). Only from the next build on; before that `getInfo` throws "nicht verfügbar".
- `EveryAppBridge.media.play/pause/toggle/next/previous/stop()` – **from the next build on**, no permission needed. There is no way to find out which app is currently playing.

## Quick Settings tiles (from the next build on)
Android only allows statically declared tiles. EveryApp therefore ships 5 tiles, "EveryApp 1" to "EveryApp 5".
Every `quickTile` name from the active tasks (of all apps) is assigned a free slot automatically; the slot stays stable for as long as the name exists.
The tile shows that name. Unassigned tiles are greyed out. Tapping a tile fires `{type:'quickTile', tile:{index,name}}` (headless, also when the app is closed).
The user has to add the tile once in the quick settings ("Bearbeiten" → drag "EveryApp N" in). `background.getTileSlots()` → `{ "1": "Denon an", ... }`.
More than 5 names: the extra ones are ignored and an error is logged. Name matching is case-insensitive.

## Tiles / tile menu / widgets / Wi-Fi AP (native: next build)
Host API (bridge `background.*`; guarded, saved but not shown on the current APK):
- `setUi({tiles:[{slot?,icon,label,state,subtitle?,menu?}], widgets:[{id,size,title?,columns?,items}]})` replaces everything this app declared. Explicit tile slots win over quickTile auto-slots (max 5).
- `tileUpdate(slot|label, patch)` and `widgetUpdate(id, patch)`: `patch.items` can be an array or `{itemId: patch}`. `getUi()` returns the current config.
- Native side: `UiStore.kt` (prefs `everyapp_ui`, JSON per tile/widget; remote icons are inlined as base64), `MenuActivity.kt` (translucent dialog; also a no-UI "fire" trampoline for widget buttons), `EveryAppWidget.kt` (Small/Large providers + `WidgetConfigActivity`), `EveryAppTiles.kt`.
- Triggers:
  - `tileMenu {id?}` → event `{id, value, slot, tileName}`
  - `widgetAction {id?}` → `{widgetId, id, value}`
  - `wifiChanged {bssid?}` (matches BSSID or SSID) → `{bssid, ssid, rssi, frequency, prevBssid, prevSsid}`, all flattened into `ctx.trigger`
- Background ctx has `ctx.tile.*`, `ctx.widget.update`, and `ctx.wifi.info()`.
- Wi-Fi details:
  - `WifiWatcher.kt` (NetworkCallback with FLAG_INCLUDE_LOCATION_INFO, API 31+) runs while the foreground service runs.
  - It needs ACCESS_FINE_LOCATION plus ACCESS_BACKGROUND_LOCATION. Without them, Android redacts the BSSID and nothing fires; this is logged once as `FEHLER wifiChanged: BSSID verborgen`.
  - Bridge `network.getWifi()` and `network.requestLocation(background)` handle the two-step prompt.
- Full Denon and Fritzbox/Repeater examples: EveryMacro MACROS.md.

## BLE GATT (native module `modules/expo-ble-gatt`, next build)
- Implementation: Kotlin `BleManager` is a process-wide singleton, so it works the same from the UI and from headless tasks.
  - It keeps one `BluetoothGatt` per address and reuses connections.
  - GATT operations are serialized per connection (a lock plus a latch, with a timeout per op).
  - Connect uses TRANSPORT_LE and autoConnect=false with a timeout (default 10 s); it requests MTU 185.
- JS: `modules/expo-ble-gatt/index.ts`:
  - `scan / connect / disconnect / write / read / notify`; data is passed as a hex string.
  - Headless ctx: `ctx.ble = makeApi(false)`. It only checks permissions; it never prompts.
  - Bridge category `ble.*` (no mini-app permission gate; Android's "Nearby devices" permission applies).
- Trigger `bleNotify {address?, charUuid?}`:
  - Native `onCharacteristicChanged` starts `MacroHeadlessTaskService` with event=bleNotify, address, serviceUuid, charUuid and hex.
  - `ctx.trigger` gets `{address, serviceUuid, charUuid, hex, bytes, value}`.
- Permissions: BLUETOOTH_SCAN (neverForLocation) and BLUETOOTH_CONNECT; BLUETOOTH/ADMIN up to API 30.
- Limits:
  - A notify subscription lives only as long as the process and connection. After a process kill or a disconnect, the macro has to call `notify` again, for example on `appStart` or an interval.
  - `onCharacteristicChanged` can fire while the app is in the background. Starting the headless service from there may then be blocked by Android's background-start rules. The foreground service makes this unlikely.

### BLE permission and auto re-subscribe
- Mini-apps must declare `"ble"` in `permissions` in their `everyapp.json`, and the user must grant it.
  - It is enforced in the WebView bridge (`ble.*`) and in background tasks (`ctx.ble.*`).
  - The error is `BLE nicht erlaubt: … "ble" muss in den permissions des Manifests stehen`.
  - When a manifest adds new permissions, EveryApp shows the permission dialog again.
- `ctx.ble.notify(addr, svc, chr, true)` persists the subscription natively (SharedPreferences `everyapp_ble/subs`).
  - After a connection drop, it reconnects and re-enables the subscription with backoff (2 s, doubling, max 5 min).
  - On a (re)start of the foreground service, all subscriptions are re-established.
  - `notify(..., false)` removes the subscription.
  - `disconnect(addr)` pauses auto-reconnect for that device until the next `connect`/`notify` or a service restart.

## Quality gates (box, no EAS)
- `npm run typecheck`, `npm run lint` (eslint flat config, bug-focused), `npm test` (node:test; pure logic in `src/services/triggerMatching.ts` and `src/bridge/permissions.ts`).
- Native compile check without EAS:
  1. Copy the repo without `android/`, then run `CI=1 npx expo prebuild --platform android --clean --no-install`.
  2. Run `./gradlew :expo-background-service:compileDebugKotlin :expo-ble-gatt:compileDebugKotlin :expo-classic-bluetooth:compileDebugKotlin :expo-media-control:compileDebugKotlin :expo-network-info:compileDebugKotlin :app:processDebugResources :app:compileDebugKotlin` with JDK 17 (`/workspace/jdk17`) and `ANDROID_HOME=/workspace/android-sdk`.

## Secrets (`EveryAppBridge.secrets`, `ctx.secrets`)

- Bridge (frei, pro Mini-App getrennt): `secrets.get(key)`, `secrets.set(key, value)` (leer = löschen), `secrets.delete(key)`, `secrets.list()` (nur Keys), `secrets.info()` → `{ encrypted, backend }`.
- Hintergrund-Tasks: `ctx.secrets.KEY` (vorab geladen, schreibgeschützt; fehlt der Key → `Secret KEY fehlt …`).
- Hintergrund-Log: alle bekannten Secret-Werte der App werden durch `•••` ersetzt.
- Speicher (`src/services/SecretStore.ts`): **LITE** = AsyncStorage `@secret_<appId>_<KEY>` (unverschlüsselt, app-intern). Ist das native Modul `ExpoSecureStore` vorhanden (nächster Build, `expo-secure-store` ist bereits in package.json), wird SecureStore (Android Keystore) genutzt und Lite-Einträge werden beim ersten Zugriff automatisch migriert und gelöscht.
- Neu dafür auch: `clipboard.getString()` (Einfügen-Button).
