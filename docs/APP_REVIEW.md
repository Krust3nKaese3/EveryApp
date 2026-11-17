# App Review: Lern- und Entwicklerwerkzeug

Stand: 17. November 2026

**Das ist keine Rechtsberatung und keine Aussage, dass Apple OpenScr bereits freigegeben hat.** Die Richtlinie wird auf [developer.apple.com/app-store/review/guidelines](https://developer.apple.com/app-store/review/guidelines/) gepflegt. Unten steht, was die iOS-App tatsächlich tut. Was die App nicht tut, ist ausdrücklich genannt, damit es in den Review-Notizen nicht behauptet wird.

## Was die iOS-App ist

Die iOS-Version ist ein Werkzeug, mit dem eine Person eigene OpenScrapps schreibt und auf dem eigenen Gerät ausführt. Eine OpenScrapp ist HTML, CSS und JavaScript plus `openscr.json` in einem GitHub-Repository.

Die Person meldet sich mit dem eigenen GitHub-Konto an (OAuth Device Flow oder ein persönliches Token). Der Device Flow ist eingerichtet: die öffentliche Client-ID `Ov23liZBUKxpmryUJW1a` gilt, wenn `EXPO_PUBLIC_GITHUB_CLIENT_ID` nicht gesetzt ist. Ein Client Secret gibt es nicht. Das Token liegt nur auf dem Gerät und geht nur als `Authorization` an GitHub.

Danach gilt:

- Installiert wird ein Repository nur, wenn der Besitzer in der GitHub-URL **und** `owner.login` aus `GET /repos/{owner}/{repo}` dem angemeldeten Benutzer entsprechen. Groß- und Kleinschreibung spielt keine Rolle. Organisationen und fremde Repositories zählen nicht, auch wenn das Token sie lesen kann.
- Private Repositories des angemeldeten Kontos sind erlaubt. Der Download nutzt dasselbe Token.
- Fremde Links, QR-Codes und Add-Links (`openscr://add?url=…`) werden abgelehnt. Die Meldung ist deutsch. Es gibt keine Bestätigung „trotzdem hinzufügen“.
- Dieselbe Prüfung läuft beim Hinzufügen, bei jedem Aktualisieren und bei jedem Öffnen. Ohne erfolgreiche Antwort von GitHub startet die OpenScrapp nicht.
- Abmelden löscht das Token. Die Dateien bleiben auf dem Gerät, lassen sich aber nicht öffnen oder aktualisieren, bis sich dasselbe Konto wieder anmeldet.

Es gibt auf iOS keinen Katalog und keine Liste „Empfohlen“. `catalog/catalog.json` und jede andere ferne Datei können das nicht einschalten. Die Entscheidung ist `Platform.OS === 'ios'` im Programm (`src/services/iosPolicy.ts`).

„Melden“ öffnet eine E-Mail. Die Sperrliste kann ein Repository deaktivieren und nennt den Grund. Es gibt keinen OpenScr-Server.

## Quelltext und Entwicklungsumgebung

Der Quelltext einer geladenen OpenScrapp lässt sich nur lesen, nicht in der App ändern. Die Ansicht zeigt die geladenen HTML- und JavaScript-Dateien, die Einstiegsdatei zuerst. Sie liegt im Menü der OpenScrapp und auf der Leiste der Entwicklungsumgebung.

Während eine OpenScrapp läuft, bleibt die Leiste „Entwicklungsumgebung · eigener Code“ sichtbar, mit „Zurück“ und „Quelltext“. Die Seite nutzt höchstens 80 Prozent der Höhe. Sie füllt den Bildschirm nicht aus.

## Bridge auf iOS

Die OpenScrapp erreicht das Gerät nur über die Allowlist. Auf iOS sind das:

- Speicher: `storage.get`, `storage.set`, `storage.remove`
- HTTP: `http.fetch`, `http.request` (nur `http:` und `https:`)
- Sensoren: `sensors.getAccelerometer`, `sensors.getGyroscope`
- Bluetooth LE: `ble.isAvailable`, `ble.scan`, `ble.connect`, `ble.disconnect`, `ble.write`, `ble.read`, `ble.notify`
- Vibration, solange die OpenScrapp sichtbar ist: `vibration.vibrate`
- das Event `app.start`

Jede dieser Kategorien braucht eine einmalige Zustimmung, außer dem Event-Kanal. Dateisystem, Kontakte und Standort gibt es nicht.

Auf iOS nicht verfügbar, auch nicht durch eine ferne Datei: Roh-TCP, Roh-UDP, Tuya, Hintergrundaufgaben, Makros, Kacheln, Popups, klassisches Bluetooth, Benachrichtigungen, Kamera, Spotify, Medientasten, WLAN-Info, Zwischenablage, Geheimnisse, Kryptografie und Mehrspieler. Der Aufruf antwortet auf Deutsch: „Diese Funktion ist auf iOS nicht verfügbar. Erlaubt sind Speicher, Sensoren, HTTP, Bluetooth LE und Vibration.“

Die Android-App ist ein anderes Programm: Katalog, freie öffentliche Repositories nach Warnung, und die längere Bridge. Diese Notiz beschreibt die iOS-App.

## Richtlinie 2.5.2 und der Developer Program License Agreement

2.5.2 verlangt, dass Apps in ihrem Bundle enthalten sind und keinen Code nachladen, der die Funktionen der App verändert. Genannt ist eine Ausnahme für Apps, die ausführbaren Code zum Lernen, Entwickeln oder Testen bereitstellen, und dass dieser Quelltext für die nutzende Person einsehbar sein muss. Abschnitt 3.3.1(B) des Apple Developer Program License Agreement beschreibt dieselbe Ausnahme.

OpenScr auf iOS folgt dem Muster, das Expo für Expo Go auf dem iPhone beschreibt, und dem Muster von Lernumgebungen, die eigenen Code auf dem eigenen Gerät ausführen:

- [Expo-Dokumentation „You need to be signed in to Expo Go and Expo CLI“](https://docs.expo.dev/troubleshooting/expo-go-sign-in-required): Auf einem physischen iOS-Gerät öffnet Expo Go ein Projekt vom Development-Server nur, wenn Expo Go und die Expo CLI im selben Expo-Konto angemeldet sind.
- OpenScr prüft den GitHub-Besitzer. Auf dem Gerät läuft nur Code, der zum angemeldeten Konto gehört.
- **Swift Playgrounds** (Apple) führt Swift aus, den man auf dem Gerät schreibt.
- **Scriptable** führt JavaScript aus, das man selbst schreibt oder in die eigene Bibliothek übernimmt.
- **Pythonista** führt Python aus, das man selbst schreibt oder importiert.

Das sind Beschreibungen dieser Apps, keine Entscheidung von Apple über OpenScr.

## Was diese Notiz nicht behauptet

- Die iOS-App bietet keine Verzeichnis-Software für beliebige Personen an und erfüllt die Notiz nicht über einen Katalog nach 4.7.
- Es gibt keine Universal Links pro OpenScrapp.
- Es gibt keine Altersschranke. Die iOS-App zeigt keine Katalog-Altersangaben.
- Die Brücke gibt keine nativen Schnittstellen frei, die außerhalb der sichtbaren Entwicklungsumgebung laufen. Diese Notiz behauptet nicht, dass Apple eine darüber hinausgehende Erlaubnis erteilt hat.

## English section for App Store Connect review notes

The iOS build of OpenScr is a learning and developer tool. It runs HTML/JavaScript OpenScrapps from GitHub repositories owned by the GitHub account that is signed in on that device. This note describes that binary. It is not legal advice and it is not a claim that Apple has approved the app.

Sign-in uses the GitHub device flow (public client id `Ov23liZBUKxpmryUJW1a` when `EXPO_PUBLIC_GITHUB_CLIENT_ID` is unset, no client secret) or a personal access token stored only on the device. The token is sent only to GitHub. Signing out deletes it.

A repository is installed only when both the owner in the URL and `owner.login` from `GET /repos/{owner}/{repo}` equal the authenticated user. The check is case-insensitive. Organization repositories and repositories owned by anyone else are rejected, even if the token can read them. Private repositories owned by that user are allowed. The same check runs on add, on every update, and on every open. QR codes and `openscr://add` links for any other repository are rejected. There is no confirmation that overrides the check.

The iOS app has no curated catalog and no “Empfohlen” list. `catalog/catalog.json` cannot enable catalog installs. The choice is `Platform.OS === 'ios'` in `src/services/iosPolicy.ts`. “Melden” opens an email. A blocklist can still disable a repository and show the reason. There is no OpenScr account server.

The user can read the fetched HTML and JavaScript (the entry file first) from the app menu and from the development bar. The view is read-only. While an OpenScrapp runs, a persistent bar says “Entwicklungsumgebung · eigener Code” and offers Back and Source. The page uses at most 80% of the screen height.

iOS bridge methods are storage, HTTP fetch, accelerometer and gyroscope, Bluetooth LE, vibration, and the `app.start` event. Each category needs one-time consent except the event channel. The app does not expose the file system, contacts, or location. Calls to raw TCP/UDP, Tuya, background tasks, macros, tiles, popups, classic Bluetooth, notifications, camera, Spotify, media keys, Wi-Fi info, clipboard, secrets, crypto, and multiplayer return a German error and do not run. A remote file cannot add those methods back.

Android is a different build: a catalog, public repositories after a warning, and the longer bridge. This note is about iOS.

This follows the pattern Expo documents for Expo Go on a physical iPhone (https://docs.expo.dev/troubleshooting/expo-go-sign-in-required) and the pattern of Swift Playgrounds, Scriptable, and Pythonista: the person runs code they can read, on their own device, from their own account. Those are descriptions of what those apps do, not a determination that OpenScr is in the same category.

Please do not read this note as claiming a public catalog under Guideline 4.7, universal links for each OpenScrapp, an age gate, or permission from Apple to expose native APIs beyond the list above.

To review: sign in with a GitHub account you control, open “Dein erstes OpenScrapp”, and load a repository that account owns. A repository that account does not own will not install. Open Quelltext from the app menu or from the bar while it runs. A call such as a raw socket or a background task returns the German unavailable message.
