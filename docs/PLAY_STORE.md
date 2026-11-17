# Google Play: erster Release von EveryApp

Stand: 16. November 2026. Das ist eine Ausfüllhilfe anhand des Codes in diesem Repository, keine Rechtsberatung und keine Zusage, dass Google die App freigibt. Die Console ändert Feldnamen. Wenn ein Feld anders heißt, gilt die Frage in der Console, nicht diese Überschrift.

Es wurde kein nativer Build und kein EAS-Build ausgeführt. Das zusammengeführte Android-Manifest steht erst nach `eas build` oder einem lokalen Prebuild fest. Die Angaben unten folgen `app.json`, `app.config.js`, den Modul-Manifesten und dem JavaScript.

## Store-Eintrag

App-Name (höchstens 30 Zeichen): **EveryApp**

Kategorie: **Tools**. Die App ist eine Laufzeitumgebung. Entertainment passt schlechter, weil Katalog und freie Repositories auch Automatisierung enthalten. Die App nicht als Spiel markieren.

### Kurzbeschreibung Deutsch (höchstens 80 Zeichen)

<!-- store:short-de -->
Mini-Apps aus GitHub im WebView, lokales Mehrspieler-WLAN und Spotify.
<!-- /store:short-de -->

### Kurzbeschreibung Englisch (höchstens 80 Zeichen)

<!-- store:short-en -->
GitHub mini-apps in a WebView, local Wi-Fi multiplayer, and Spotify.
<!-- /store:short-en -->

### Lange Beschreibung Deutsch (höchstens 4000 Zeichen)

<!-- store:long-de -->
EveryApp lädt kleine Apps aus GitHub und führt sie auf dem Handy aus. Eine Mini-App ist HTML und JavaScript in einer WebView, kein eigenes Play-Store-Paket. Es gibt kein EveryApp-Konto und keinen Server von EveryApp.

Das kannst du damit machen:

- Empfohlene Mini-Apps mit einem Tipp installieren.
- Ein öffentliches GitHub-Repository selbst hinzufügen, als Adresse, Link oder QR-Code. EveryApp weist dich vorher darauf hin, nur Quellen hinzuzufügen, denen du vertraust.
- Mit anderen Handys im selben WLAN oder Hotspot spielen, ohne Internet. Ein Gerät ist der Host, die anderen treten per QR-Code oder über die Suche in der Nähe bei.
- Die installierte Spotify-App steuern, wenn du das einer Mini-App erlaubst. Die Wiedergabe bleibt in Spotify.
- Bluetooth und das lokale Netz nutzen, wenn du das einer Mini-App erlaubst, zum Beispiel für eigene Automationen.

Jede dieser Funktionen braucht eine eigene Zustimmung pro Mini-App. Ohne Zustimmung bleibt sie aus. EveryApp gibt kein Dateisystem, keine Kontakte und keine GPS-Koordinaten frei. Die Kamera liest QR-Codes und speichert dabei kein Foto. Ein Mikrofon wird nicht verwendet.

Daten der App bleiben auf dem Gerät. Es gibt keine Werbung und kein Analyse-SDK. GitHub sieht die üblichen Verbindungsdaten, wenn eine Mini-App geladen wird. Spotify gilt nur, wenn du es einer Mini-App erlaubst. Mitspieler im selben Netz sehen den Anzeigenamen und die Spielnachrichten. Eine Meldung öffnet deine Mail-App; gesendet wird sie nur, wenn du das selbst tust.

Die Datenschutzerklärung und die Nutzungsbedingungen erreichst du über den Link im Store-Eintrag. Mini-Apps stammen von ihren Autoren. EveryApp ist die Laufzeitumgebung, nicht der Anbieter jeder Mini-App.
<!-- /store:long-de -->

### Lange Beschreibung Englisch (höchstens 4000 Zeichen)

<!-- store:long-en -->
EveryApp loads small apps from GitHub and runs them on your phone. A mini-app is HTML and JavaScript in a WebView, not its own Play Store package. There is no EveryApp account and no EveryApp server.

What you can do:

- Install recommended mini-apps with one tap.
- Add a public GitHub repository yourself, as an address, a link or a QR code. EveryApp warns you first to add only sources you trust.
- Play with other phones on the same Wi-Fi or hotspot, without the Internet. One device hosts, the others join with a QR code or from the nearby list.
- Control the installed Spotify app when you allow a mini-app to do so. Playback stays in Spotify.
- Use Bluetooth and the local network when you allow a mini-app to do so, for example for your own automations.

Each of these features needs its own consent per mini-app. Without consent it stays off. EveryApp does not expose the file system, contacts or GPS coordinates. The camera reads QR codes and does not save a photo from that scan. The microphone is not used.

App data stays on the device. There are no ads and no analytics SDK. GitHub sees ordinary connection data when a mini-app is loaded. Spotify applies only if you allow it for a mini-app. Players on the same network see the display name and the game messages. A report opens your mail app; it is sent only if you send it yourself.

The privacy policy and the terms are linked from the store listing. Mini-apps come from their authors. EveryApp is the runtime, not the publisher of every mini-app.
<!-- /store:long-en -->

Datenschutz-URL, sobald GitHub Pages für den Ordner `/docs` auf `main` aktiv ist:

`https://krust3nkaese3.github.io/EveryApp/site/datenschutz.html`

Die englische Fassung liegt daneben als `privacy.html`, die Nutzungsbedingungen als `nutzung.html` und `terms.html`. Die URL erst eintragen, wenn die Platzhalter in der öffentlichen Fassung ersetzt sind.

Grafiken liefert dieser Stand nicht: Symbol 512, Feature-Grafik 1024×500, mindestens zwei Telefon-Screenshots. Die liegen bei EveryMan.

## Datensicherheit (Data safety)

Überblick:

- **Does your app collect or share any of the required user data types?** Yes. Es gibt keinen EveryApp-Server. „Collected“ ist in der Console auch eine Übermittlung an einen Dritten.
- **Is all of the user data collected by your app encrypted in transit?** No. GitHub und Spotify nutzen HTTPS. Lokaler Mehrspieler ist unverschlüsseltes TCP im WLAN. Mini-Apps dürfen nach Zustimmung unverschlüsseltes HTTP im lokalen Netz verwenden.
- **Which account-creation methods does your app support?** Die App legt kein EveryApp-Konto an. GitHub (Entwicklermodus) und Spotify sind optionale Konten dieser Dienste.
- **Do you provide a way for users to request that their data is deleted?** Yes. URL: die Datenschutzerklärung. Löschen in der App entfernt die Mini-App, Abmelden löscht Token, Deinstallieren entfernt die App-Daten. Für eine gesendete Meldung: `{{SUPPORT_EMAIL}}`.
- Verkauf von Daten: No. Werbung: No. Kein Werbe-SDK, `AD_ID` ist blockiert.

Punkt für Punkt. „Ephemeral“ nur ankreuzen, wenn die Console Daten meint, die nur im Speicher und nicht darüber hinaus liegen. Das trifft die gespeicherten Token nicht.

| Datentyp in der Console | Ankreuzen | Pflicht? | Zweck | Begründung aus dem Code |
| --- | --- | --- | --- | --- |
| Location, Approximate | Nein | – | – | Keine Standortberechtigung in diesem Release, keine GPS-Koordinaten. |
| Location, Precise | Nein | – | – | Wie oben. |
| Personal info, Name | Ja, collected und shared | Nein, Nutzer kann die Funktion lassen | App functionality | Anzeigename im lokalen Spielraum geht an Mitspieler im selben Netz. Spotify-Anzeigename kommt von Spotify, wenn `spotify` erlaubt wurde. |
| Personal info, Email address | Nein | – | – | Die App liest die Mailadresse nicht. Eine Meldung schreibt der Nutzer in seiner Mail-App. |
| Personal info, User IDs | Ja, collected und shared | Nein | App functionality, Account management | GitHub-Benutzername und Spotify-Benutzer-ID, nur nach Anmeldung. Token bleiben auf dem Gerät und gehen an GitHub bzw. Spotify. |
| Personal info, übrige (Adresse, Telefon, politische Meinung und so weiter) | Nein | – | – | Nicht vorhanden. |
| Financial, Health, Contacts, Calendar, Photos, Videos, Audio files, Files and docs, Web browsing, App activity, Crash logs, Diagnostics, Device or other IDs | Nein | – | – | Kein Werbe-ID, keine Analyse, keine Kontakte, kein Mikrofon, kein gespeichertes Foto. Die QR-Kamera legt kein Bild ab. Bluetooth-Adressen bleiben auf dem Gerät, außer eine Mini-App sendet sie nach Zustimmung selbst. |
| Messages, Other in-app messages | Ja, shared | Nein | App functionality | Spielnachrichten gehen per TCP an Mitspieler im selben Netz, nicht an einen EveryApp-Server. |

Hinweis, den die Console so nicht als Feld hat, der aber in einer Rückfrage gilt: Eine Mini-App mit der Zustimmung `http` oder `net` kann weitere Daten an ein Ziel schicken, das sie selbst wählt. Das ist nicht der EveryApp-Server. Wenn Google das als weitere Datentypen wertet, die Typen nachziehen, statt den Fragebogen zu knapp zu lassen.

## Altersfreigabe (IARC)

Die App nicht als reines Spiel einstufen. Kategorie der Inhaltsbewertung: Utility / Other, passend zu Tools.

So antworten, weil der Android-Build freie GitHub-Repositories zulässt und das Alter nicht prüft:

- Gewalt, Sexualität, derbe Sprache, Drogen, Glücksspiel um echtes oder simuliertes Geld, In-App-Käufe: **Nein** für den Container. Der Würfel ist ein Würfel, keine Glücksspielmechanik. Keine Werbung.
- Können Nutzer miteinander interagieren oder Inhalte austauschen? **Ja.** Nur lokal im selben WLAN oder Hotspot, kein öffentliches soziales Netz, kein Standort an andere Nutzer.
- Teilt die App den Standort mit anderen Nutzern? **Nein.**
- Enthält die App oder ermöglicht sie den Zugang zu Inhalten aus dem offenen Internet, die nicht für jedes Alter geeignet sein müssen? **Ja.** Katalog plus jedes öffentliche Repository, das die nutzende Person einträgt. Die Alterszeilen im Katalog sind Empfehlungen (höchstes Label im mitgelieferten Katalog: ab 16 bei EveryMacro) und keine geprüfte Schranke.

Die berechnete Stufe übernehmen, nicht eine eigene Zahl einsetzen. Wegen der freien Repositories ist mit **PEGI 18 / Mature 17+** oder einer ähnlich hohen Stufe zu rechnen. Eine niedrigere Stufe wäre nur vertretbar, wenn der Play-Build freie Repositories abschaltet (`production-catalog`). Das ist hier bewusst nicht der Fall.

Zielgruppe in „Target audience and content“: **nicht für Kinder gestaltet**, Altersgruppe erst ab der IARC-Stufe, im Zweifel 18+. Nicht am Families-Programm teilnehmen. Es gibt keine Altersschranke in der App.

Weitere App-Inhalte, jeweils Nein, solange der Code so bleibt: Ads, News-App, COVID-19-Kontaktprotokoll, Regierungs-App, Finanzprodukte, Gesundheit.

## Berechtigungen, so wie die Console sie abfragt

Vorher im App-Bundle-Explorer des hochgeladenen AAB prüfen, was wirklich im Manifest steht.

### Vordergrunddienst

Sichtbar nur bei Bedarf, Benachrichtigung „EveryApp aktiv“, Text aus Intervall, BLE und „Spielraum“. Stoppen über die Benachrichtigung beendet den Dienst. Nicht für Werbung oder Tracking.

- **dataSync** (`FOREGROUND_SERVICE_DATA_SYNC`): Intervall-Aufgaben einer Mini-App, der die Person „Hintergrund“ erlaubt hat. Die Aufgaben sprechen Ziele an, die die Mini-App nennt (oft Geräte im Hausnetz). Häkchen, das der Formulierung am nächsten kommt: Datenübertragung, die der Nutzer eingeschaltet hat, mit dauerhaft sichtbarer Benachrichtigung.
- **connectedDevice** (`FOREGROUND_SERVICE_CONNECTED_DEVICE`): Bluetooth-LE-Benachrichtigung, solange das Gerät verbunden oder ein neuer Versuch fällig ist, und der TCP-Host eines Spielraums, solange der Raum läuft. Häkchen: fortlaufende Verbindung zu einem Gerät, das der Nutzer verwendet.
- **shortService** (`FOREGROUND_SERVICE_SHORT_SERVICE`): kurze Aufgabe nach Bluetooth, Boot oder einem ähnlichen Ereignis, unter der Android-Grenze für `shortService`. Dafür gibt es oft kein eigenes Console-Formular. Die Berechtigung muss trotzdem im Manifest stehen, sonst bricht Android 14 beim Start ab.

Ein Video der Benachrichtigung verlangt die Console oft erst in der Erklärung. Das nimmt EveryMan am Gerät auf. Diesen Build nicht aus der Cloud starten.

### Kamera

`CAMERA` nur für QR-Codes: Mini-App installieren und einem Spielraum beitreten. Kein Zugriff auf die Mediathek (`READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO` sind nicht deklariert). Kein Video, kein Mikrofon. `RECORD_AUDIO` ist aus `app.json` entfernt, `expo-camera` hat `recordAudioAndroid: false`, und `blockedPermissions` sperrt `RECORD_AUDIO`.

Falls „Photos and videos“ trotzdem erscheint: Nutzung ist das Scannen eines QR-Codes auf Zuruf, kein dauerhaftes Lesen von Fotos. Häufig fällt die Kamera nicht unter diese Erklärung, sondern unter die normale Berechtigungsliste.

### Geräte in der Nähe und lokales Netz

- `BLUETOOTH_SCAN` mit `neverForLocation`, `BLUETOOTH_CONNECT`: Suche und Verbindung für Mini-Apps mit Zustimmung `bluetooth` oder `ble`. Nicht, um einen Standort zu berechnen.
- `BLUETOOTH` und `BLUETOOTH_ADMIN` nur bis API 30.
- Lokales Netz: `INTERNET`, `ACCESS_NETWORK_STATE`, `ACCESS_WIFI_STATE`, `CHANGE_WIFI_MULTICAST_STATE` (nur während ein Raum bekannt gegeben oder gesucht wird). Damit finden sich Handys per mDNS (`_everyapp._tcp`) und sprechen per TCP. Android hat dafür keine iOS-artige Laufzeitfrage. In einem Freitext: nur Geräte im selben WLAN oder Hotspot, kein GPS.

### Standort

`ACCESS_FINE_LOCATION` und `ACCESS_BACKGROUND_LOCATION` sind in diesem Release entfernt und über `blockedPermissions` gesperrt. Nichts im Code fordert sie an. Auf aktuellem Android bleibt der WLAN-Name deshalb verborgen; der Code protokolliert das bereits als verdeckte BSSID. In der Standorterklärung: **die App nutzt keinen Standort**, auch nicht im Hintergrund.

Wer den WLAN-Trigger mit SSID/BSSID braucht, muss die Berechtigungen, einen Hinweis vor der Systemfrage und die Play-Erklärung (bei Hintergrund inklusive Video) wieder aufnehmen. Das ist eine offene Produktentscheidung, kein Versehen.

### Hintergrund, Boot, Wecker, Akku

- `RECEIVE_BOOT_COMPLETED`: nach dem Neustart des Geräts die vom Nutzer eingeschalteten Aufgaben erneut bewerten. Kein stiller Start zu Werbezwecken.
- `POST_NOTIFICATIONS`: lokale Benachrichtigungen einer Mini-App und die laufende Dienst-Benachrichtigung.
- `WAKE_LOCK`: der Vordergrunddienst und kurze Aufgaben sollen nicht mitten in der Arbeit einschlafen.
- `SCHEDULE_EXACT_ALARM`: ein Bluetooth-LE-Abo wird nach einem Abbruch zu einem berechneten Zeitpunkt erneut versucht (`AlarmManager`), damit der Prozess in der Wartezeit nicht offen bleibt. Falls die Console eine Erklärung für exakte Wecker zeigt: kein Wecker und kein Kalender für den Nutzer, sondern der Wiederverbindungsversuch einer erlaubten Mini-App. Die Person kann die Sonderfreigabe in den Systemeinstellungen entziehen.
- `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` ist entfernt. Nichts hat die Sonderfreigabe aufgerufen. Wer den Dienst zuverlässig behalten will, stellt die Akku-Nutzung von EveryApp von Hand auf uneingeschränkt.

## Nachgeladener Code

Play verbietet, ausführbaren Code aus einer anderen Quelle als Google Play nachzuladen, etwa DEX, JAR oder native Bibliotheken. JavaScript, das in einer WebView läuft, nennt die Richtlinie als Ausnahme, solange die übrige Richtlinie gilt.

Was dieser Build tatsächlich tut:

- Die Oberfläche einer Mini-App ist HTML, CSS und JavaScript in einer WebView. Es wird kein DEX, kein JAR und keine `.so` aus dem Repository installiert.
- Die Brücke ist eine Allowlist. Dateisystem, Kontakte und GPS sind nicht dabei. Jede Funktion braucht die Zustimmung für diese Mini-App.
- Hintergrundaufgaben sind kein WebView. Der Rumpf steht als Text in der Mini-App und wird mit `new Function` in der JavaScript-Engine der App ausgeführt (`src/services/BackgroundTasks.ts`), mit Zugriff auf die erlaubten Brückenfunktionen (HTTP, Bluetooth, Speicher, Benachrichtigung). Das ist weiterhin JavaScript, kein nativer Code, aber es ist mehr als eine abgeschlossene Webseite.

In einer Rückfrage zu „Device and Network Abuse“ / ausführbarem Code so antworten und nicht behaupten, jede Mini-App laufe ausschließlich in der WebView. Das Restrisiko bleibt: Google hat Container abgelehnt, deren nachgeladenes JavaScript native Fähigkeiten bekommt. Ein engerer Build ist das Profil `production-catalog` (nur Katalog plus eigene Repositories). `production-play` lässt freie Repositories an, wie der bisherige Android-Build.

## Release-Konfiguration

- `expo.version`: `1.0.0`
- `android.versionCode`: `1`
- `cli.appVersionSource`: `local`
- Profil `production`: bleibt **APK** (Sideload).
- Profil `production-play`: **AAB** (`buildType: app-bundle`), dieselben Variablen wie `production` (kein `CATALOG_ONLY`), `autoIncrement: true`.
- `targetSdkVersion`: **36** über `expo-build-properties`. Seit dem 31. August 2026, und nach dem Ende der Verlängerung am 1. November 2026, verlangt Play für neue Apps API 36.
- `submit.production.android.track`: `internal`
- `submit.production.android.serviceAccountKeyPath`: `{{PLAY_SERVICE_ACCOUNT_JSON}}`
- Dieselbe Submit-Angabe liegt unter `submit.production-play`, damit das Profil zum AAB-Build passt.

Bei `appVersionSource: local` und `autoIncrement: true` erhöht EAS den `versionCode` im Projekt vor dem Build. Der erste `production-play`-Build wird dadurch **versionCode 2**, nicht 1. Wer mit 1 in den Store will, setzt `autoIncrement` für diesen einen Build auf `false` und danach wieder auf `true`. Die Änderung muss committet werden, sonst zählt der nächste Build wieder bei 1 und Play lehnt das Duplikat ab. `version` (die 1.0.0) erhöht `autoIncrement` nicht.

Build und Submit macht EveryMan lokal, nicht diese Änderung:

```bash
eas build --platform android --profile production-play
eas submit --platform android --profile production-play --latest
```

`--latest` darf nicht ein älteres APK aus `production` erwischen. In der Build-Liste den AAB prüfen.

## Checkliste geschlossener Test und Upload

Persönliche Play-Konten, die nach dem 13. November 2023 angelegt wurden, brauchen vor der Produktion einen geschlossenen Test mit mindestens **12 Testern**, die **14 aufeinanderfolgende Tage** angemeldet bleiben. Ob dieses Konto darunterfällt, sagt der Hinweis beim Produktionszugang. Die 14 Tage zählen die Anmeldung (opt-in), nicht tägliche Nutzung. In den 14 Tagen niemanden aus dem Test nehmen.

1. Platzhalter in `docs/site/*.md` ersetzen, `node scripts/sync-legal.js`, committen. GitHub Pages: Quelle `/docs`, Branch `main`. Datenschutz-URL im Browser öffnen und sehen, dass keine geschweiften Platzhalter mehr dastehen.
2. Play Console: App anlegen, Paket `com.everyapp.container`, Standardsprache, Play App Signing einschalten.
3. Store-Eintrag: Name, beide Kurztexte, beide Langtexte, Kategorie Tools, Symbol, Feature-Grafik, Screenshots, Datenschutz-URL.
4. Datensicherheit wie oben ausfüllen. Vorschau lesen: es dürfen keine Analyse- und keine Werbedaten erscheinen.
5. IARC abschicken und die berechnete Stufe übernehmen. Zielgruppe nicht für Kinder.
6. Anzeigen: Nein. Nachrichten, Regierung, Finanzen, Gesundheit: Nein.
7. Vordergrunddienst-Typen `dataSync` und `connectedDevice` erklären. Standort: nicht verwendet. Kamera wie oben, falls gefragt. Exakter Wecker, falls gefragt.
8. Dienstkonto der Play Console als JSON speichern, Pfad in `eas.json` statt `{{PLAY_SERVICE_ACCOUNT_JSON}}` eintragen, Datei nicht committen (`secrets/` ist ignoriert).
9. `eas build --platform android --profile production-play`. Kein APK in den Play-Track legen.
10. `eas submit` auf den Track **internal**. Release in der Console ausrollen, selbst installieren: Katalog, QR-Installation, Datenschutz-Dialog, ein Spielraum, Abbruch über die Benachrichtigung.
11. Geschlossenen Test anlegen, mindestens 12 Personen einladen, opt-in abwarten, 14 Tage nicht anfassen. Rückmeldungen nur als neues AAB mit höherem `versionCode`.
12. Danach Produktionszugang beantragen. Den Track nicht von internal direkt auf Produktion schieben, bevor die Console den Zugang freigibt.

## Offene Punkte

- Name, Anschrift und Kontakt sind Platzhalter. Sitz außerhalb Deutschlands: den Abschnitt zum anwendbaren Recht ersetzen.
- Ob ein Datenschutzbeauftragter und eine Umsatzsteuer-ID nötig sind.
- Ob das Melde-Postfach `manueldiliberto1@gmail.com` das spätere `{{SUPPORT_EMAIL}}` sein soll. Der Code sendet weiter an die feste Adresse.
- Freie GitHub-Repositories im Play-Build oder nur Katalog (`production-catalog`), falls die Prüfung den nachgeladenen Code ablehnt.
- WLAN-Name braucht Standortberechtigungen, die dieser Release nicht enthält.
- Der erste AAB bekommt mit `autoIncrement` den `versionCode` 2.
- Screenshots, Feature-Grafik und das Vordergrunddienst-Video entstehen am Gerät.
- Der Text ist ein Entwurf und ersetzt keine anwaltliche Prüfung.
