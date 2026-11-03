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
