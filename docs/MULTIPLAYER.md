# Lokaler Mehrspieler

Mini-Apps wie evryWerwolf oder evryGuessTheSong brauchen keine eigene Netzwerklogik. Ein Gerät ist der Host im selben WLAN oder im Handy-Hotspot. Die anderen treten per QR-Code bei. Es geht ohne Internet und zwischen Android und iOS, sobald beide EveryApp aus einem Build mit `react-native-tcp-socket` starten.

Der Host ist allein zuständig: Nachrichten laufen nur über ihn, nie direkt von Gast zu Gast. Alles ist JSON. Eine Nachricht ist höchstens 32 KiB.

## Berechtigung

In `everyapp.json`:

```json
{
  "permissions": ["multiplayer"]
}
```

Ohne diese Zustimmung lehnt die Bridge `multiplayer.*` und die Events `multiplayer.message` und `multiplayer.players` ab. Nachrichten einer anderen Mini-App oder eines anderen Raums werden nicht weitergeleitet.

Typen für den injizierten Client: `src/services/multiplayer/bridgeClient.ts` (`MultiplayerBridge`).

## API

```javascript
const mp = window.EveryAppBridge.multiplayer;

const offMessage = mp.onMessage((message) => {
  // message.from ist die Spieler-Id, message.data ist JSON
});
const offPlayers = mp.onPlayersChanged((roster) => {
  // roster.players: { id, name, host, connected }
  // roster.selfId, roster.roomCode
});

// Host. EveryApp zeigt den QR-Code groß. „Fertig“ blendet ihn aus, der Raum bleibt.
const room = await mp.host({ maxPlayers: 8, name: 'Ada' });
// room.roomCode, room.qrPayload, room.playerId, room.players

// QR wieder öffnen
await mp.showQr();

// Gast: Scanner der Container-App, nicht der Installations-Scanner
await mp.join({ scan: true, name: 'Bea' });

// oder die Zeichenkette aus dem QR, Schema everyapp-mp://join?...
await mp.join(room.qrPayload);

// an den Host (Gast) bzw. an eine Id
await mp.send({ type: 'vote', choice: 'ja' });
await mp.send({ type: 'hint' }, { to: room.playerId });

// an alle anderen, ohne Echo an sich selbst
await mp.broadcast({ type: 'state', phase: 'night' });

await mp.leave();
offMessage();
offPlayers();
```

`maxPlayers` liegt zwischen 2 und 16, Vorgabe 8. Der Host zählt mit. Der Anzeigename hat höchstens 24 Zeichen.

`send` ohne `to` geht vom Gast an den Host. Der Host muss `to` setzen oder `broadcast` nutzen.

Callbacks vor `host` oder `join` anmelden, sonst verpasst die Mini-App die erste Spielerliste.

## QR-Code

Der Code enthält die private IPv4-Adresse, den Port, einen Raumcode aus vier Zeichen und ein Token aus 16 Hex-Zeichen, dazu die Id der Mini-App. Beispiel:

`everyapp-mp://join?v=1&host=192.168.1.20&port=38421&room=K7QP&token=0123456789abcdef&app=evryWerwolf`

Öffentliche Adressen werden abgelehnt. Der Installations-Scanner auf dem Startbildschirm ignoriert dieses Schema.

WLAN-Adressen (`wlan0`, `en0`) haben Vorrang. Ein Hotspot ohne WLAN-Client (typisch `ap0` oder `bridge100`, oft `172.20.10.1`) wird verwendet, wenn keine WLAN-Adresse da ist. Liegen WLAN und Hotspot gleichzeitig an, steht die WLAN-Adresse im Code. Dann müssen die Gäste in diesem WLAN sein.

## Verbindung

- Der Host hört auf TCP (`react-native-tcp-socket`), Port wird vom System vergeben.
- Etwa alle 3 Sekunden ein Ping. Antwortet jemand 10 Sekunden nicht, gilt die Verbindung als weg.
- Dieselbe Spieler-Id kann sich etwa 20 Sekunden lang wieder anmelden. Danach ist der Platz frei.
- Während der Unterbrechung werden Spielnachrichten nicht gepuffert. Die Mini-App schickt den Spielstand nach dem Wiederverbinden selbst.
- Pro Gerät nur ein Raum. Schließt die Mini-App, endet der Raum.

Spieler, die kurz weg sind, bleiben in `onPlayersChanged` mit `connected: false`.

## Nativer Build

Diese Funktion steckt nicht in Expo Go und nicht in einem älteren EveryApp-Build. Nötig sind:

- das native Modul `react-native-tcp-socket` (Config-Plugin `with-react-native-tcp-socket`)
- Android: `INTERNET`, `ACCESS_NETWORK_STATE`, `ACCESS_WIFI_STATE` (in `app.config.js`)
- iOS: `NSLocalNetworkUsageDescription` und `NSBonjourServices` mit `_everyapp._tcp`

Bonjour sucht den Raum nicht. Der QR-Code ist die Einladung. Der Eintrag hilft iOS, die Frage nach dem lokalen Netz überhaupt zu zeigen. Die Adressliste liest das Modul `expo-network-info`, auf iOS erst mit diesem Build.

Diesen Build hier nicht starten, bevor er gewollt ist. Bis dahin antwortet die API auf Deutsch, dass ein neuer Entwicklungs-Build fehlt.
