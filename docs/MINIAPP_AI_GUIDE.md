# OpenScrapp für OpenScr

OpenScr steht für Open Smartphone Code Runner. Die kleinen Apps heißen OpenScrapps (Einzahl OpenScrapp).

Diese Datei reicht als Auftrag für eine KI. Die OpenScrapp liegt in **ihrem eigenen Git-Repository**. OpenScr lädt sie von dort. Es gibt keinen Zugriff auf Dateien des Geräts, Kontakte oder Standort.

Sag deiner KI:

```text
Baue eine OpenScrapp für OpenScr. Lies zuerst
https://raw.githubusercontent.com/Krust3nKaese3/OpenScr/main/llms.txt
und halte dich an den Guide, die Bridge-API und, falls Mehrspieler vorkommt, an MULTIPLAYER.md.
Lege openscr.json, eine Einstiegsdatei und nur die Berechtigungen an, die du brauchst.
Nutze ausschließlich window.OpenScrBridge. Schreibe Namen und Spielnachrichten mit textContent, nie mit innerHTML.
Beim Mehrspieler: Callbacks vor host/join/resume, der Host ist allein zuständig, den Spielstand selbst in OpenScrBridge.storage speichern und nach resume neu senden, höchstens 32 KiB JSON. Der Raum endet mit endRoom, nicht beim Schließen der App.
```

## Dateien

Empfehlung für den Repository-Namen: `<Name>Scrapps`, zum Beispiel `KrustenScrapps`. OpenScr verlangt den Namen nicht.

`openscr.json` im Ordner, den OpenScr als Wurzel nimmt. Liegt keine `openscr.json` im Repository, gilt weiter `everyapp.json` (so sind WerwolfScrapp, GuessTheSongScrapp, MacroScrapp und EveryRollDice gebaut). Neue OpenScrapps legen `openscr.json` an:

```json
{
  "name": "Mein Spiel",
  "version": "1.0.0",
  "description": "Ein Satz, was die App tut.",
  "entrypoint": "index.html",
  "permissions": ["multiplayer"]
}
```

`entrypoint` ist der Start, meist `index.html`. Relative Skripte und Bilder daneben sind in Ordnung. Pfade mit `..` oder `file://` werden verworfen.

`permissions` ist die Liste, die OpenScr vor dem ersten Nutzen zeigt. Unbekannte Namen werden ignoriert. Eine Fähigkeit ohne Eintrag fragt OpenScr beim ersten Aufruf. Die Nutzerin kann ablehnen.

Eine fertige Lobby steht unter `examples/multiplayer-lobby/`.

## Bridge

Im Spiel gibt es `window.OpenScrBridge`. `window.EveryAppBridge` ist dasselbe Objekt und nur der Kompatibilitätsname. Neue OpenScrapps nutzen `OpenScrBridge`. Die vollständige Liste steht in [BRIDGE_API.md](https://raw.githubusercontent.com/Krust3nKaese3/OpenScr/main/docs/BRIDGE_API.md).

Aufrufe geben ein Promise zurück. Fehler kommen als Ablehnung mit deutschem Text.

Speicher ist Text, nur für diese OpenScrapp, höchstens 256 KiB pro Wert:

```javascript
await OpenScrBridge.storage.set('stand', JSON.stringify(stand));
const raw = await OpenScrBridge.storage.get('stand');
```

HTTP nur mit `http:` oder `https:`. Kein Dateisystem, keine Kontakte, kein GPS.

## Mehrspieler

Berechtigung `multiplayer`. Ein Handy ist Host im selben WLAN oder Hotspot. Die anderen finden den Raum in der Nähe oder scannen den QR-Code, den OpenScr anzeigt. Ohne Internet, Android und iOS gemischt, sobald die installierte OpenScr den lokalen Server und die Suche enthält.

Die OpenScrapp speichert den Spielstand selbst mit `OpenScrBridge.storage`. OpenScr speichert nur den Raum. Token und Spielergeheimnis bekommt die OpenScrapp nicht.

Methoden: `host`, `join`, `send`, `broadcast`, `onMessage`, `onPlayersChanged`, `leave`, `showQr`, `discover`, `stopDiscovery`, `setDiscoverable`, `approveJoin`, `denyJoin`, `onJoinRequest`, `endRoom`, `resume`, `onResumed`, `onHostAway`.

```javascript
const mp = window.OpenScrBridge.multiplayer;

mp.onMessage((message) => {
  // message.from ist die Spieler-Id. message.data ist JSON.
});
mp.onPlayersChanged((roster) => {
  // roster.players: { id, name, host, connected }
  // roster.selfId, roster.roomCode
});
mp.onJoinRequest((request) => {
  // request.name und request.roomCode anzeigen, dann approveJoin oder denyJoin.
});
mp.onResumed((info) => {
  // info.role, info.roomCode, info.selfId, info.players. Stand aus storage lesen.
});
mp.onHostAway((info) => {
  // „Host ist kurz weg“. OpenScr versucht es weiter.
});

const room = await mp.host({ maxPlayers: 8, name: 'Ada', discoverable: true, joinApproval: true });
await mp.showQr();
await mp.setDiscoverable(true);
await mp.discover({ onRooms: (rooms) => {} });
await mp.stopDiscovery();
await mp.join({ room: 'raum-id', name: 'Bea' });
await mp.join({ scan: true, name: 'Bea' });
await mp.join(room.qrPayload);
await mp.approveJoin('anfrage');
await mp.denyJoin('anfrage');
await mp.send({ type: 'vote', choice: 'ja' });
await mp.send({ type: 'hint' }, { to: room.playerId });
await mp.broadcast({ type: 'state', phase: 'night' });
const back = await mp.resume();
await mp.leave();
await mp.endRoom();
```

`maxPlayers` ist 2 bis 16, Vorgabe 8, der Host zählt mit. Namen höchstens 24 Zeichen. `discoverable` und `joinApproval` sind standardmäßig an. `send` ohne `to` geht vom Gast an den Host. Der Host muss `to` setzen oder `broadcast` nutzen. Es gibt kein Echo an den Absender.

`discover` liefert nur Räume derselben OpenScrapp: `id`, `roomCode`, `hostName`, `players`, `maxPlayers`. Die Adresse bleibt in OpenScr. Beitritt über `join({ room })` ist eine Anfrage. Der QR-Code nicht. Die Liste soll den Host-Namen und den Raumcode zeigen, weil jemand denselben Namen ankündigen kann.

### Tun

- `onMessage`, `onPlayersChanged`, `onResumed` und `onHostAway` **vor** `host`, `join` oder `resume` setzen. `resume()` gibt denselben Stand auch zurück.
- Den Spielstand bei jeder Änderung in `OpenScrBridge.storage` schreiben. Nach `multiplayer.resumed` von dort lesen. Ist die OpenScrapp der Host, den Stand danach per `broadcast` schicken.
- Den Host rechnen lassen. Gäste schicken Absichten (`vote`, `move`). Der Host prüft und schickt den neuen Stand.
- Nach `connected: false` und wieder `true` den Spielstand neu senden. Die Pause puffert keine Nachrichten.
- JSON senden: Objekte, Listen, Zahlen, Zeichenketten, `true`, `false`, `null`.
- Anzeigen nur über `textContent` oder `createTextNode`.
- Den Raum mit `endRoom()` beenden, wenn das Spiel vorbei ist. `leave()` des Hosts beendet ihn nicht.

### Lassen

- Keine eigenen Sockets, kein WebRTC, kein Fetch an die IP aus dem QR-Code.
- Nicht über 32 KiB pro Nachricht. Ein Bild gehört nicht in `broadcast`.
- Keine Funktionen, `undefined` oder Klassenzeilen. `JSON.stringify` muss klappen.
- Den Stand nicht den Gästen glauben, wenn der Host ihn schon kennt. Ein Gast kann `count: 999` schicken.
- `innerHTML` mit Namen oder Nachrichtentext. Ein Name kann `<` enthalten, der Container schneidet das zwar, die OpenScrapp soll es trotzdem nicht als HTML lesen.
- `join({ scan: true })` nicht selbst mit einer Kamera-Bibliothek nachbauen. OpenScr öffnet den Scanner.
- Das Spielergeheimnis nicht selbst speichern wollen. Es kommt in der Bridge nicht an.

`onMessage` und `onPlayersChanged` geben eine Funktion zurück, die den Callback wieder abnimmt.

Der Platz bleibt, bis der Gast `leave()` ruft oder der Host `endRoom()` aufruft. Dieselbe Id kommt zurück. Die OpenScrapp sieht das Geheimnis dafür nicht. Es bleibt im Container. Ist der Host weg, kommt `hostAway`, und der Platz bleibt trotzdem.

Details: [MULTIPLAYER.md](https://raw.githubusercontent.com/Krust3nKaese3/OpenScr/main/docs/MULTIPLAYER.md).

## Am PC testen

Die Lobby-Vorlage hat ein Feld „Raumcode am PC“. Leer gelassen ruft sie `join({ scan: true })` auf, das ist der Weg in OpenScr. Im Browser trägt Tab 2 den vierstelligen Code aus Tab 1 ein. Die echte App versteht diesen Kurzcode nicht, nur die `openscr-mp://`-Zeichenkette oder den Scanner.

Ohne Handy die Attrappe laden, **vor** der OpenScrapp:

```html
<script src="https://raw.githubusercontent.com/Krust3nKaese3/OpenScr/main/examples/multiplayer-mock/everyapp-mock.js"></script>
<script src="app.js"></script>
```

Oder lokal `examples/multiplayer-mock/everyapp-mock.js`. Zwei Browser-Tabs auf dieselbe Datei. Tab 1 ruft `host` auf und zeigt `roomCode`. Tab 2 tritt mit dem Code bei:

```javascript
await OpenScrBridge.multiplayer.join({ payload: 'K7QP', name: 'Bea' });
```

`join({ scan: true })` wirft einen Hinweis. Die Kamera gibt es nur in OpenScr. Die Attrappe spricht über `BroadcastChannel`. Ein Tab ist ein Gerät. Dieselben Grenzen: JSON, 32 KiB, Host verteilt, kein Echo. TCP-Fluten und das WLAN bildet sie nicht ab.

In Node, zwei Instanzen im selben Prozess:

```javascript
const { installOpenScrMock } = require('./examples/multiplayer-mock/everyapp-mock.js');
const host = installOpenScrMock({ global: {}, appId: 'mein-spiel' });
const guest = installOpenScrMock({ global: {}, appId: 'mein-spiel' });
```

Dieselbe `appId` und derselbe Kanal, sonst finden sie sich nicht.

## Typische Fehler

| Symptom | Ursache |
| --- | --- |
| `multiplayer` ist undefined | Berechtigung fehlt, oder die Attrappe wurde nach der App geladen |
| Erste Spielerliste fehlt | Callback erst nach `host`/`join` gesetzt |
| Gast sieht den Zug nicht | Host hat ihn nicht per `broadcast` weitergegeben |
| Nach dem Wegstecken ist der Stand alt | Niemand hat `{ type: 'state', state }` neu geschickt |
| `Nachricht ist zu groß` | Über 32 KiB, oft ein Bild oder das ganze Log |
| `Der Host braucht einen Empfänger` | Host hat `send` ohne `to` genutzt |
| `Permission denied: multiplayer` | Nicht erlaubt oder nicht im Manifest und abgelehnt |
| Raumcode wirkt tot | Anderes WLAN, alter Build ohne TCP-Server, oder im Browser `scan: true` statt Raumcode |
| Zähler springt | Gast und Host zählen beide. Nur der Host zählt, dann broadcast |

## Was OpenScr nicht tut

Die OpenScrapp läuft in einer WebView. Sie kann die Nutzerin nicht an andere Apps binden und keine nativen Module nachladen. Speicher, Geheimnisse und Berechtigungen gehören nur zu dieser App und verschwinden beim Löschen. Ein Update löscht den Speicher nicht.
