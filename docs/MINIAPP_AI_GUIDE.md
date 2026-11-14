# Mini-App für EveryApp

Diese Datei reicht als Auftrag für eine KI. Die Mini-App liegt in **ihrem eigenen Git-Repository**. EveryApp lädt sie von dort. Es gibt keinen Zugriff auf Dateien des Geräts, Kontakte oder Standort.

Sag deiner KI:

```text
Baue eine EveryApp-Mini-App. Lies zuerst
https://raw.githubusercontent.com/Krust3nKaese3/EveryApp/main/llms.txt
und halte dich an den Guide, die Bridge-API und, falls Mehrspieler vorkommt, an MULTIPLAYER.md.
Lege everyapp.json, eine Einstiegsdatei und nur die Berechtigungen an, die du brauchst.
Nutze ausschließlich window.EveryAppBridge. Schreibe Namen und Spielnachrichten mit textContent, nie mit innerHTML.
Beim Mehrspieler: Callbacks vor host/join, der Host ist allein zuständig, nach einem Reconnect den Spielstand neu senden, höchstens 32 KiB JSON.
```

## Dateien

`everyapp.json` im Ordner, den EveryApp als Wurzel nimmt:

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

`permissions` ist die Liste, die EveryApp vor dem ersten Nutzen zeigt. Unbekannte Namen werden ignoriert. Eine Fähigkeit ohne Eintrag fragt EveryApp beim ersten Aufruf. Die Nutzerin kann ablehnen.

Eine fertige Lobby steht unter `examples/multiplayer-lobby/`.

## Bridge

Im Spiel gibt es `window.EveryAppBridge`. Andere Namen gibt es nicht. Die vollständige Liste steht in [BRIDGE_API.md](https://raw.githubusercontent.com/Krust3nKaese3/EveryApp/main/docs/BRIDGE_API.md).

Aufrufe geben ein Promise zurück. Fehler kommen als Ablehnung mit deutschem Text.

Speicher ist Text, nur für diese Mini-App, höchstens 256 KiB pro Wert:

```javascript
await EveryAppBridge.storage.set('stand', JSON.stringify(stand));
const raw = await EveryAppBridge.storage.get('stand');
```

HTTP nur mit `http:` oder `https:`. Kein Dateisystem, keine Kontakte, kein GPS.

## Mehrspieler

Berechtigung `multiplayer`. Ein Handy ist Host im selben WLAN oder Hotspot. Die anderen scannen den QR-Code, den EveryApp anzeigt. Ohne Internet, Android und iOS gemischt, sobald die installierte EveryApp den lokalen Server enthält.

Typen, die zur echten API passen: `host`, `join`, `send`, `broadcast`, `onMessage`, `onPlayersChanged`, `leave`, `showQr`.

```javascript
const mp = window.EveryAppBridge.multiplayer;

mp.onMessage((message) => {
  // message.from ist die Spieler-Id. message.data ist JSON.
});
mp.onPlayersChanged((roster) => {
  // roster.players: { id, name, host, connected }
  // roster.selfId, roster.roomCode
});

const room = await mp.host({ maxPlayers: 8, name: 'Ada' });
await mp.showQr();
await mp.join({ scan: true, name: 'Bea' });
await mp.join(room.qrPayload);
await mp.send({ type: 'vote', choice: 'ja' });
await mp.send({ type: 'hint' }, { to: room.playerId });
await mp.broadcast({ type: 'state', phase: 'night' });
await mp.leave();
```

`maxPlayers` ist 2 bis 16, Vorgabe 8, der Host zählt mit. Namen höchstens 24 Zeichen. `send` ohne `to` geht vom Gast an den Host. Der Host muss `to` setzen oder `broadcast` nutzen. Es gibt kein Echo an den Absender.

### Tun

- `onMessage` und `onPlayersChanged` **vor** `host` oder `join` setzen. Sonst fehlt die erste Spielerliste.
- Den Host rechnen lassen. Gäste schicken Absichten (`vote`, `move`). Der Host prüft und schickt den neuen Stand.
- Nach `connected: false` und wieder `true` den Spielstand neu senden. Die Pause puffert keine Nachrichten.
- JSON senden: Objekte, Listen, Zahlen, Zeichenketten, `true`, `false`, `null`.
- Anzeigen nur über `textContent` oder `createTextNode`.

### Lassen

- Keine eigenen Sockets, kein WebRTC, kein Fetch an die IP aus dem QR-Code.
- Nicht über 32 KiB pro Nachricht. Ein Bild gehört nicht in `broadcast`.
- Keine Funktionen, `undefined` oder Klassenzeilen. `JSON.stringify` muss klappen.
- Den Stand nicht den Gästen glauben, wenn der Host ihn schon kennt. Ein Gast kann `count: 999` schicken.
- `innerHTML` mit Namen oder Nachrichtentext. Ein Name kann `<` enthalten, der Container schneidet das zwar, die Mini-App soll es trotzdem nicht als HTML lesen.
- `join({ scan: true })` nicht selbst mit einer Kamera-Bibliothek nachbauen. EveryApp öffnet den Scanner.

`onMessage` und `onPlayersChanged` geben eine Funktion zurück, die den Callback wieder abnimmt.

Spieler mit `connected: false` sind höchstens etwa 20 Sekunden reserviert. Dieselbe Id kommt zurück, wenn die Person rechtzeitig wieder da ist. Die Mini-App sieht das Geheimnis dafür nicht. Es bleibt im Container.

Details: [MULTIPLAYER.md](https://raw.githubusercontent.com/Krust3nKaese3/EveryApp/main/docs/MULTIPLAYER.md).

## Am PC testen

Die Lobby-Vorlage hat ein Feld „Raumcode am PC“. Leer gelassen ruft sie `join({ scan: true })` auf, das ist der Weg in EveryApp. Im Browser trägt Tab 2 den vierstelligen Code aus Tab 1 ein. Die echte App versteht diesen Kurzcode nicht, nur die `everyapp-mp://`-Zeichenkette oder den Scanner.

Ohne Handy die Attrappe laden, **vor** der Mini-App:

```html
<script src="https://raw.githubusercontent.com/Krust3nKaese3/EveryApp/main/examples/multiplayer-mock/everyapp-mock.js"></script>
<script src="app.js"></script>
```

Oder lokal `examples/multiplayer-mock/everyapp-mock.js`. Zwei Browser-Tabs auf dieselbe Datei. Tab 1 ruft `host` auf und zeigt `roomCode`. Tab 2 tritt mit dem Code bei:

```javascript
await EveryAppBridge.multiplayer.join({ payload: 'K7QP', name: 'Bea' });
```

`join({ scan: true })` wirft einen Hinweis. Die Kamera gibt es nur in EveryApp. Die Attrappe spricht über `BroadcastChannel`. Ein Tab ist ein Gerät. Dieselben Grenzen: JSON, 32 KiB, Host verteilt, kein Echo. TCP-Fluten und das WLAN bildet sie nicht ab.

In Node, zwei Instanzen im selben Prozess:

```javascript
const { installEveryAppMock } = require('./examples/multiplayer-mock/everyapp-mock.js');
const host = installEveryAppMock({ global: {}, appId: 'mein-spiel' });
const guest = installEveryAppMock({ global: {}, appId: 'mein-spiel' });
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

## Was EveryApp nicht tut

Die Mini-App läuft in einer WebView. Sie kann die Nutzerin nicht an andere Apps binden und keine nativen Module nachladen. Speicher, Geheimnisse und Berechtigungen gehören nur zu dieser App und verschwinden beim Löschen. Ein Update löscht den Speicher nicht.
