# EveryApp Background Tasks API

Any mini-app with the `background` permission can register **background tasks**: a list of triggers plus a JS handler.
EveryApp runs the handler in its own (headless) JS engine – also when the mini-app is closed, EveryApp is in the
background, or EveryApp was swiped away from recents. Tasks are stored per `appId`; one app can never see or remove another app's tasks.

Tasks only run while **background mode is enabled for that app** (`EveryAppBridge.background.enable()` / `disable()` / `isEnabled()`).
`enable()` no longer keeps a foreground service up by itself. The persistent notification "EveryApp aktiv" is shown only
while a running app has an `interval` trigger, or a BLE notify subscription is connected or due for a retry.
Bluetooth, boot, tiles, popups and Wi-Fi start a short headless task and let the process end.
After reboot the same decision runs again (`BootReceiver` → `ServiceGate`).

## Bridge API (`window.EveryAppBridge.background`)

| Method | Description |
|---|---|
| `enable()` / `disable()` / `isEnabled()` | Background mode for this app. Asks for notification permission. The foreground service starts only when an interval or a due/connected bleNotify needs it. |
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
- Bluetooth: Android's `ACL_CONNECTED/DISCONNECTED` broadcasts, received by a manifest receiver → starts a short headless task (`shortService`). It does not start the long foreground service.
- `interval`: JS timers in the host. `ServiceGate` keeps the foreground service (`dataSync`) only while at least one active task has an interval. When that service starts it fires headless event `keepalive`, which calls `restartTimers()`.
- `wifiChanged`: `WifiWatcher` uses `registerNetworkCallback(NetworkRequest, PendingIntent)`. No foreground service. Identical SSID/BSSID is ignored; a real change is emitted at most every 30 seconds. The first sample after install is remembered and not emitted.
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
  - `WifiWatcher.kt` registers a `PendingIntent` network callback while background mode is on and some active task has `wifiChanged`. The callback does not keep the process alive.
  - Debounce state (last SSID/BSSID, last emit time) is stored in prefs `everyapp_wifi`.
  - It needs ACCESS_FINE_LOCATION plus ACCESS_BACKGROUND_LOCATION. Without them, Android redacts the BSSID and nothing fires; this is logged once as `FEHLER wifiChanged: BSSID verborgen`.
  - The PendingIntent overload cannot set `FLAG_INCLUDE_LOCATION_INFO`. The receiver reads `WifiInfo` from the active network. If the BSSID is still redacted, the same error line is written to NativeLog.
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
  - A persisted notify is restored by `BleManager.restoreSubscriptions` when the foreground service starts because the subscription is due or the device is connected.
  - `onCharacteristicChanged` starts `MacroHeadlessTaskService` with `startForegroundService`. The task promotes itself to a short foreground service, so it can run without the long service.

### BLE permission and auto re-subscribe
- Mini-apps must declare `"ble"` in `permissions` in their `everyapp.json`, and the user must grant it.
  - It is enforced in the WebView bridge (`ble.*`) and in background tasks (`ctx.ble.*`).
  - The error is `BLE nicht erlaubt: … "ble" muss in den permissions des Manifests stehen`.
  - When a manifest adds new permissions, EveryApp shows the permission dialog again.
- `ctx.ble.notify(addr, svc, chr, true)` persists the subscription natively (SharedPreferences `everyapp_ble/subs`).
  - After a connection drop, it reconnects with backoff (2 s, doubling, max 5 min) and at most 10 attempts. The wait is an `AlarmManager` alarm (`BleRetryReceiver`), not a `Handler` delay, so the process is not kept for the wait.
  - Attempt count and `nextAttemptAt` are stored in `everyapp_ble/meta` and survive process death. Attempt 10 is the last failure: NativeLog `BLE RECONNECT STOPP`, no further alarm.
  - A successful connect or re-subscribe resets the counter (`BLE VERBUNDEN`).
  - While a retry is due or the device is connected, `ServiceGate` keeps the foreground service (`connectedDevice`). During backoff and after the cap it does not.
  - `notify(..., false)` removes the subscription.
  - `disconnect(addr)` pauses auto-reconnect for that device until the next `connect`/`notify`. A process death clears that pause (the set is in memory), matching the previous behaviour.

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

## Raw-Netzwerk, Krypto & Tuya LAN (nächster nativer Build, Modul `expo-raw-net`)

- `ctx.net` (Permission **`net`** im Manifest nötig, sonst Fehler `"net" nicht erlaubt …`):
  `tcp(host, port, {timeoutMs})` → `{send(hex|bytes), receive({minBytes, timeoutMs}) → hex ('' bei Timeout), close()}`,
  `udpSend(host, port, data, {broadcast})`, `udpListen([ports], ms)` → `[{from, port, localPort, hex}]`, `tuyaDiscover(ms)`.
- `ctx.crypto` (frei, alles Hex): `aesEcb(enc,key,data)` (NoPadding), `aesGcm(enc,key,iv,aad,data)` (Tag angehängt), `hmacSha256`, `md5`, `crc32` (Zahl), `randomHex(n)`.
- `ctx.tuyaLocal({ip?, id, localKey, version: '3.3'|'3.4'|'3.5'})` → `{status(), set({"20": true})}`; ohne `ip` per UDP-Discovery (6666/6667/7000). Protokoll: `src/services/TuyaLocal.ts` (nach tinytuya; Unit-Tests mit node:crypto, noch nicht gegen echtes Gerät getestet).
- Alte APK: alle Aufrufe werfen `… braucht nächsten Build` (kein Crash).

## Deep-Links `everyapp://<miniapp>/<path>?query`
Scheme `everyapp` in app.json (nativer Build nötig); Dev-Client-Builds haben zusätzlich `exp+everyapp`.
HomeScreen öffnet die passende Mini-App (Manifest-Name/Repo-Name, Groß/Klein, Leerzeichen egal) und liefert den Link als
`window.addEventListener('everyapp:deeplink', e => e.detail)` → `{miniapp, path, params, url}`; zusätzlich `window.EveryAppLaunch`.

## Popup-Host (Permission `popup`, nativer Build nötig)
Transparente Overlay-Activity (`PopupActivity`) mit WebView, Inhalt (HTML/JS) kommt von der Mini-App.

**Spec** `{ id, html | url (nur https), title?, state?: {}, throttleMs?: 300, style?: {...} }`
`style`: `width`/`height`: dp-Zahl | `"NN%"` | `"auto"` (Höhe = Inhalt; Breite auto = 92 %), `position`: `center|bottom|top`, `margin` (dp, 16),
`background` (`#RRGGBB`, `#AARRGGBB`, `rgba(r,g,b,a)`), `backgroundAlpha` 0..1, `scrim` Farbe, `scrimAlpha` 0..1 (0.4),
`blur` dp (Android 12+, sonst ignoriert), `cornerRadius` dp (22), `borderWidth` dp, `borderColor`, `elevation` dp (12),
`animation`: `fade|slide|scale|none`, `dismissOnOutsideTap` (true). WebView-Hintergrund ist transparent – Form kommt vom Style.

**Binden:** `setUi({tiles:[{label, icon, popup: spec}], widgets:[{id, items:[{type:'button', id, label, popup: spec}]}]})` – Tippen öffnet das Popup.
**API** (Bridge `EveryAppBridge.popup` und Hintergrund `ctx.popup`): `open(spec)` (nur wenn EveryApp im Vordergrund), `send(id, {k:v})`
(merged in den gespeicherten State, live an `onMessage`), `close(id?)`, `state(id)`.
**Seite:** `window.EveryAppPopup = { id, state, title, send(event, value), close(), onMessage(cb), resize(hDp?) }`, Event `everyapp:popupready`.
**Trigger:** `{type:'popup', popupId?, event?}` → `ctx.trigger = {type:'popup', popupId, event, value, slot?, widgetId?}`; je Event-Name
gedrosselt (vorne+hinten, `throttleMs`), beim Schließen `event:'close'`. Events gehen nur an Tasks der besitzenden Mini-App.

## Kacheln zur Laufzeit (Permission `tiles`)
`EveryAppBridge.tile(n)` / `ctx.tile(n)` (n = 1..5): `set({icon?, label?, subtitle?, state?, popup?})`, `get()`, `release()`.
- `state`: `active|inactive|unavailable` (auch `on/off/true/false`). `subtitle`: Android 10+ (darunter ignoriert).
- `icon`: eingebauter Name (`lightbulb, power, bolt, tv, wifi, …`, Material-Aliase wie `power_settings_new`), Repo-Pfad (`icons/lamp.png`, lädt aus raw.githubusercontent …/main),
  `https://…png`, `data:image/png;base64,…`, SVG (`<svg…>`, `.svg`-Pfad/URL, `data:image/svg+xml`) – SVG nur im Vordergrund (WebView rendert zu PNG).
  Native: Bild → weiße Alpha-Maske (`Icon.createWithBitmap`), System tönt es.
- Besitz: Eine Kachel gehört der Mini-App, die sie zuerst belegt; andere bekommen `Kachel n gehört der Mini-App "…"`. Persistiert (SharedPreferences), `requestListeningState` aktualisiert sofort, überlebt Neustart.
- `ctx.tile.setState/setLabel/…` (alt) funktioniert weiter.
