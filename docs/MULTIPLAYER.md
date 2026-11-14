# Lokaler Mehrspieler

Mini-Apps wie evryWerwolf oder evryGuessTheSong brauchen keine eigene Netzwerklogik. Ein Gerät ist der Host im selben WLAN oder im Handy-Hotspot. Die anderen finden den Raum in der Nähe oder treten per QR-Code bei. Es geht ohne Internet und zwischen Android und iOS, sobald beide EveryApp aus einem Build mit `react-native-tcp-socket` und dem Modul `expo-mdns` starten.

Der Host ist allein zuständig: Nachrichten laufen nur über ihn, nie direkt von Gast zu Gast. Alles ist JSON. Eine Nachricht ist höchstens 32 KiB. Die Mini-App speichert ihren Spielstand selbst über `EveryAppBridge.storage`. EveryApp merkt sich nur den Raum.

## Berechtigung

In `everyapp.json`:

```json
{
  "permissions": ["multiplayer"]
}
```

Ohne diese Zustimmung lehnt die Bridge `multiplayer.*` und die Events `multiplayer.message`, `multiplayer.players`, `multiplayer.rooms`, `multiplayer.joinRequest`, `multiplayer.resumed` und `multiplayer.hostAway` ab. Nachrichten einer anderen Mini-App oder eines anderen Raums werden nicht weitergeleitet.

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

// Host. Vorgabe: der Raum ist in der Nähe sichtbar und ein Beitritt ohne Token braucht Zustimmung.
const room = await mp.host({ maxPlayers: 8, name: 'Ada', discoverable: true, joinApproval: true });
// room.roomCode, room.qrPayload, room.playerId, room.players

await mp.showQr();
await mp.setDiscoverable(false);

// Gast sucht nur Räume derselben Mini-App. Die Liste nennt Name, Raumcode und Spielerzahl, keine Adresse.
const stop = await mp.discover({
  onRooms: (rooms) => {
    // rooms: { id, roomCode, hostName, players, maxPlayers }
  },
});
await mp.join({ room: rooms[0].id, name: 'Bea' });
await mp.stopDiscovery();

// QR bleibt ohne Zustimmungsdialog. Schema everyapp-mp://join?...
await mp.join({ scan: true, name: 'Bea' });
await mp.join(room.qrPayload);

// Beitritt über die Suche ist eine Anfrage. Entweder EveryApp zeigt den Dialog,
// oder die Mini-App hört selbst zu und entscheidet.
mp.onJoinRequest((request) => {
  // request.id, request.name, request.roomCode, request.hostName
  void mp.approveJoin(request.id);
  void mp.denyJoin(request.id);
});

await mp.send({ type: 'vote', choice: 'ja' });
await mp.send({ type: 'hint' }, { to: room.playerId });
await mp.broadcast({ type: 'state', phase: 'night' });

// Gast: Platz freigeben. Host: blendet nur aus, der Raum bleibt.
await mp.leave();
// Host beendet den Raum für alle.
await mp.endRoom();

// Nach dem erneuten Öffnen, auch nach einem Neustart der App.
const back = await mp.resume();
// back: { role, roomCode, selfId, players, status } und status ist 'ready' oder 'hostAway'
mp.onResumed((info) => {
  // Spielstand aus EveryAppBridge.storage lesen. Der Host schickt ihn danach an die Gäste.
});
mp.onHostAway((info) => {
  // info.message ist „Host ist kurz weg“. Die Mini-App wartet, EveryApp versucht es weiter.
});
```

`maxPlayers` liegt zwischen 2 und 16, Vorgabe 8. Der Host zählt mit. Der Anzeigename hat höchstens 24 Zeichen. `discoverable` ist standardmäßig an, `joinApproval` ebenfalls. Steht `joinApproval` auf `false`, kommt ein Gast aus der Suche ohne Dialog herein. Der QR-Weg fragt nie.

`send` ohne `to` geht vom Gast an den Host. Der Host muss `to` setzen oder `broadcast` nutzen.

Callbacks vor `host`, `join` oder `resume` anmelden. `resume()` liefert den Stand auch als Rückgabe, falls das Event vor dem Callback kam.

## Suche in der Nähe

Der Host meldet den Raum als `_everyapp._tcp`. Im TXT-Record stehen nur die Protokollversion, die Mini-App-Id, der Raumcode, eine stabile Raum-Id, der Anzeigename (höchstens 24 Zeichen) und die Spielerzahlen. Token, Spielergeheimnis und IP stehen dort nicht. Die IP liefert die Suche selbst und bleibt in EveryApp.

`join({ room })` schickt eine Anfrage ohne Token. Erst nach Zustimmung gehen Token und Spielergeheimnis an dieses Gerät. Dieselbe Person kommt später mit dem gespeicherten Geheimnis wieder, ohne QR und ohne Dialog.

Eine fremde Ankündigung mit demselben Namen ist möglich. Die Liste zeigt deshalb den Namen und den Raumcode. Die Mini-App soll beides anzeigen, bevor sie beitritt.

## QR-Code

Der Code enthält die private IPv4-Adresse, den Port, einen Raumcode aus vier Zeichen und ein Token aus 16 Hex-Zeichen, dazu die Id der Mini-App. Beispiel:

`everyapp-mp://join?v=1&host=192.168.1.20&port=38421&room=K7QP&token=0123456789abcdef&app=evryWerwolf`

Öffentliche Adressen werden abgelehnt. Der Installations-Scanner auf dem Startbildschirm ignoriert dieses Schema.

WLAN-Adressen (`wlan0`, `en0`) haben Vorrang. Ein Hotspot ohne WLAN-Client (typisch `ap0` oder `bridge100`, oft `172.20.10.1`) wird verwendet, wenn keine WLAN-Adresse da ist. Liegen WLAN und Hotspot gleichzeitig an, steht die WLAN-Adresse im Code. Dann müssen die Gäste in diesem WLAN sein.

## Verbindung

- Der Host hört auf TCP (`react-native-tcp-socket`), Port wird vom System vergeben. Nach einem Neustart darf der Port neu sein. Die Raum-Id bleibt.
- Etwa alle 3 Sekunden ein Ping. Antwortet jemand 10 Sekunden nicht, gilt die Verbindung als weg. Der Platz bleibt.
- Der Platz bleibt reserviert, bis der Gast `leave()` ruft oder der Host `endRoom()` aufruft. Dafür gibt der Host nur diesem Spieler ein Geheimnis. Die Mini-App sieht es nicht. Es liegt im app-eigenen Speicher (Secure Store, wenn das Modul da ist).
- Schließt man die Mini-App oder EveryApp, endet der Raum nicht. Android hält den Host im Hintergrund über den vorhandenen Vordergrunddienst, mit der sichtbaren Zeile „Spielraum“, solange der Raum läuft. iOS hält den Host nicht im Hintergrund. Beim nächsten Öffnen startet der Raum neu und meldet dieselbe Raum-Id.
- Solange der Host weg ist, bekommen Gäste `multiplayer.hostAway` („Host ist kurz weg“) und versuchen es mit wachsendem Abstand weiter. Zuerst die gespeicherte Adresse, danach die Suche nach der Raum-Id, weil sich die IP ändern kann.
- `multiplayer.resume()` und das Event `multiplayer.resumed` liefern `{ role, roomCode, selfId, players, status }`. Den Spielstand muss die Mini-App selbst aus `EveryAppBridge.storage` holen. Der Host schickt ihn den Gästen danach.
- Ein gespeicherter Raum ohne Aktivität verschwindet nach 24 Stunden.
- Während der Unterbrechung werden Spielnachrichten nicht gepuffert.
- Pro Gerät nur ein Raum. Wer als Gast gespeichert ist, kann keinen neuen Raum öffnen, bevor `leave()` den Platz freigibt.

Spieler, die kurz weg sind, bleiben in `onPlayersChanged` mit `connected: false`.

## Nativer Build

Diese Funktion steckt nicht in Expo Go und nicht in einem älteren EveryApp-Build. Nötig sind:

- das native Modul `react-native-tcp-socket` (Config-Plugin `with-react-native-tcp-socket`)
- das lokale Modul `modules/expo-mdns` (Android `NsdManager`, iOS `NetService`)
- Android: `INTERNET`, `ACCESS_NETWORK_STATE`, `ACCESS_WIFI_STATE`. `CHANGE_WIFI_MULTICAST_STATE` nur im Modul und nur, solange gesucht oder angekündigt wird. Standort ist dafür nicht nötig.
- iOS: `NSLocalNetworkUsageDescription` erklärt, dass EveryApp Spiele in der Nähe sucht und verbindet. `NSBonjourServices` enthält `_everyapp._tcp`.

Ohne das mDNS-Modul bleibt der QR-Code nutzbar. `discover()` antwortet dann auf Deutsch, dass ein neuer Entwicklungs-Build fehlt.

Diesen Build hier nicht starten, bevor er gewollt ist. Bis dahin antwortet die API auf Deutsch, dass ein neuer Entwicklungs-Build fehlt.

Was ein Gerät im selben WLAN trotzdem kann, steht in [MULTIPLAYER_SECURITY.md](MULTIPLAYER_SECURITY.md). Für Mini-App-Autoren, die einer KI nur einen Link geben: [MINIAPP_AI_GUIDE.md](MINIAPP_AI_GUIDE.md) und [llms.txt](../llms.txt).
