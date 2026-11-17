# Erlaubte Bridge-API

`window.OpenScrBridge` ist die Schnittstelle einer OpenScrapp zu Gerätefunktionen. `window.EveryAppBridge` ist dasselbe Objekt und bleibt nur als Kompatibilität für bestehende OpenScrapps. Der native Teil nimmt nur Nachrichten an, die auf dieser Liste stehen. Unbekannte Methoden, unbekannte Events und unbekannte Nachrichtentypen werden abgelehnt. Argumente werden geprüft (Typ, Länge, `http`/`https` statt `file:` oder `content:`). Das Manifest heißt `openscr.json`. `everyapp.json` wird weiter gelesen, wenn keine `openscr.json` im Repository liegt.

Quelle der Liste: `src/bridge/allowlist.ts`.

## Nicht vorhanden

Die Bridge hat keine Methoden für das Dateisystem des Geräts, für Kontakte oder für den Standort. Es gibt keine GPS-Koordinaten. `network.requestLocation` ist entfernt. Der WLAN-Name hängt an der Berechtigung `network` und liefert keine Koordinaten.

Dateien der OpenScrapp selbst liest die WebView nur innerhalb ihres eigenen Ordners. Pfade mit `..` oder `file://` auf den Rest des Geräts werden verworfen.

## Zustimmung

Jede Kategorie außer dem reinen Event-Kanal braucht eine einmalige Zustimmung pro OpenScrapp. Sie wird unter `@everyapp_permissions` bzw. `@everyapp_permission_denied` gespeichert und kann unter „Info und Berechtigungen“ widerrufen werden. Steht die Funktion im Manifest, fragt OpenScr beim ersten Öffnen. Sonst beim ersten Aufruf.

## Speicher

- Schlüssel werden zu `@miniapp_<appId>_<schlüssel>`.
- Schlüssel: 1–128 Zeichen, keine Steuerzeichen.
- Werte: Text, höchstens 256 KiB.
- Löschen der OpenScrapp entfernt alle Schlüssel mit diesem Präfix, die Geheimnisse und die Berechtigungen. Ein Update tut das nicht.

## Rate-Limits

Laute Aufrufe sind begrenzt, darunter Scans, HTTP, Sensoren, Benachrichtigungen und UDP. Bei Überschreitung antwortet die Bridge mit „Zu viele Anfragen. Bitte kurz warten.“ Die Zähler gelten pro OpenScrapp und Methode.

## Methoden

Speicher: `storage.get`, `storage.set`, `storage.remove`

Geheimnisse: `secrets.get`, `secrets.set`, `secrets.delete`, `secrets.list`, `secrets.info`

HTTP: `http.request`, `http.fetch` (nur `http:` und `https:`)

Bluetooth: `bluetooth.scan`, `bluetooth.connect`, `bluetooth.disconnect`, `bluetooth.getConnectedDevices`

Benachrichtigungen: `notifications.schedule`

Kamera: `camera.takePicture`

Sensoren: `sensors.getAccelerometer`, `sensors.getGyroscope`

Vibration: `vibration.vibrate`

Hintergrund: `background.enable`, `background.disable`, `background.isEnabled`, `background.handlesTriggers`, `background.getLog`, `background.clearLog`, `background.registerTask`, `background.unregisterTask`, `background.unregisterAll`, `background.listTasks`, `background.getTileSlots`, `background.setUi`, `background.getUi`, `background.tileUpdate`, `background.widgetUpdate`

Spotify: `spotify.isAvailable`, `spotify.login`, `spotify.logout`, `spotify.connect`, `spotify.disconnect`, `spotify.play`, `spotify.pause`, `spotify.resume`, `spotify.stop`, `spotify.skipNext`, `spotify.skipPrevious`, `spotify.seek`, `spotify.getPlayerState`, `spotify.search`, `spotify.getMe`, `spotify.getMyPlaylists`, `spotify.getSavedTracks`, `spotify.setClientId`, `spotify.getClientId`

Medientasten: `media.play`, `media.pause`, `media.toggle`, `media.next`, `media.previous`, `media.stop`

Netzinfo: `network.isAvailable`, `network.getInfo`, `network.getWifi`

Popup: `popup.open`, `popup.send`, `popup.close`, `popup.state`

Kacheln: `tiles.set`, `tiles.get`, `tiles.release`, `tiles.fetchSvg`

Lokales Netz: `net.isAvailable`, `net.tcpOpen`, `net.tcpSend`, `net.tcpReceive`, `net.tcpClose`, `net.udpSend`, `net.udpListen`, `net.tuyaStatus`, `net.tuyaSet`, `net.tuyaDiscover`

Kryptografie: `crypto.isAvailable`, `crypto.aesEcb`, `crypto.aesGcm`, `crypto.hmacSha256`, `crypto.md5`, `crypto.crc32`, `crypto.randomHex`

BLE: `ble.isAvailable`, `ble.scan`, `ble.connect`, `ble.disconnect`, `ble.write`, `ble.read`, `ble.notify`

Zwischenablage: `clipboard.setString`, `clipboard.getString`

Mehrspieler (Berechtigung `multiplayer`, Details in [MULTIPLAYER.md](MULTIPLAYER.md)): `multiplayer.host`, `multiplayer.join`, `multiplayer.send`, `multiplayer.broadcast`, `multiplayer.leave`, `multiplayer.showQr`, `multiplayer.discover`, `multiplayer.stopDiscovery`, `multiplayer.setDiscoverable`, `multiplayer.approveJoin`, `multiplayer.denyJoin`, `multiplayer.endRoom`, `multiplayer.resume`

Events (nur diese Namen): `app.start`, `bluetooth.connected`, `bluetooth.disconnected`, `spotify.connected`, `spotify.disconnected`, `spotify.player`, `spotify.error`, `multiplayer.message`, `multiplayer.players`, `multiplayer.rooms`, `multiplayer.joinRequest`, `multiplayer.resumed`, `multiplayer.hostAway`. Bluetooth-, Spotify- und Mehrspieler-Events brauchen die passende Berechtigung. Die OpenScrapp speichert ihren Spielstand selbst. Token und Spielergeheimnis gibt die Bridge nicht heraus.

## Melden

„Melden“ öffnet eine E-Mail an `krust3nkaese3@gmail.com` (Betreff und Text sind vorausgefüllt). Es wird kein Ticket-Server aufgerufen.
