# App Review: Katalog und Entwicklermodus

Stand: 14. November 2026

**Das ist keine Rechtsberatung und keine Aussage, dass Apple EveryApp bereits freigegeben hat.** Die Richtlinie wird auf [developer.apple.com/app-store/review/guidelines](https://developer.apple.com/app-store/review/guidelines/) gepflegt. Unten steht, was die App tatsächlich tut, und wie sich das zu den Punkten verhält, die Review bei 2.5.2 und 4.7 prüft. Was die App nicht tut, ist ausdrücklich genannt, damit es in den Review-Notizen nicht behauptet wird.

## Zwei Bereiche

Der Build mit `EXPO_PUBLIC_CATALOG_ONLY=1` (EAS-Profil `production-catalog`, vorgesehen für iOS) hat zwei getrennte Bereiche.

1. **Katalog („Empfohlen“).** Jede Person kann die gelisteten Mini-Apps installieren und öffnen, ohne GitHub-Anmeldung. Quelle ist `catalog/catalog.json` (Name, Repository, Beschreibung, Altersempfehlung). Eine Sperrliste kann Einträge für alle deaktivieren. „Melden“ öffnet eine E-Mail. Es gibt keinen EveryApp-Server.
2. **Entwicklermodus.** Freiwillig, in den Einstellungen einzuschalten. Danach ist eine Anmeldung mit dem eigenen GitHub-Konto nötig. Der OAuth Device Flow ist eingerichtet: die öffentliche Client-ID `Ov23liZBUKxpmryUJW1a` gilt, wenn `EXPO_PUBLIC_GITHUB_CLIENT_ID` nicht gesetzt ist (Metro und alle EAS-Profile). Ein Client Secret gibt es nicht. Ein persönliches Token geht ebenfalls. Das Token liegt nur auf dem Gerät (Secret Store). EveryApp schickt es ausschließlich als `Authorization` an GitHub.

Ohne das Flag (Android) bleibt die bisherige freie Installation mit der Warnung „Nur vertrauenswürdige Quellen hinzufügen…“. Der Entwicklermodus ersetzt diesen Weg nicht.

## Nur eigene Repositories

Im Entwicklermodus gilt:

- Installiert wird ein Repository nur, wenn der Besitzer in der GitHub-URL **und** `owner.login` aus `GET /repos/{owner}/{repo}` dem angemeldeten Benutzer entsprechen. Groß- und Kleinschreibung spielt keine Rolle. Organisationen und fremde Repositories, auch wenn das Token sie lesen kann, zählen nicht.
- Private Repositories des angemeldeten Kontos sind erlaubt. Der Download nutzt dasselbe Token.
- Fremde Links, QR-Codes und Add-Links (`everyapp://add?url=…`) werden abgelehnt. Es gibt keine Bestätigung „trotzdem hinzufügen“ und keine Weitergabe an ein anderes Konto.
- Dieselbe Prüfung läuft beim Hinzufügen, bei jedem Aktualisieren und bei jedem Öffnen. Ohne erfolgreiche Antwort von GitHub startet eine Entwickler-Mini-App nicht.
- Abmelden löscht das Token. Die Mini-Apps bleiben installiert, lassen sich aber nicht öffnen oder aktualisieren, bis sich dasselbe Konto wieder anmeldet.

Der Katalog ist davon ausgenommen. Eine Katalog-App bleibt ohne Anmeldung nutzbar.

## Richtlinie 2.5.2

2.5.2 verlangt, dass Apps in ihrem Bundle enthalten sind und keinen Code nachladen, der Funktionen der App verändert. Genannt ist eine enge Ausnahme für Lern-Apps, die ausführbaren Code zum Üben bereitstellen, und dass dieser Quelltext für die nutzende Person einsehbar und bearbeitbar sein muss.

Der Entwicklermodus ist an dem Muster gebaut, das Expo für Expo Go auf dem iPhone beschreibt, nicht an einem offenen Laden für fremde Software:

- [Expo-Dokumentation „You need to be signed in to Expo Go and Expo CLI“](https://docs.expo.dev/troubleshooting/expo-go-sign-in-required): Auf einem physischen iOS-Gerät öffnet Expo Go ein Projekt vom Development-Server nur, wenn Expo Go und die Expo CLI im **selben Expo-Konto** angemeldet sind. Weichen die Konten ab, öffnet sich das Projekt nicht. Die Prüfung gilt dort für den Development-Server auf dem physischen Gerät, nicht für Android und nicht für den Simulator.
- EveryApp prüft nicht ein Expo-Konto, sondern den GitHub-Besitzer. Zweck ist derselbe: Auf dem Gerät läuft nur Code, der zum angemeldeten Konto gehört. Ein anderes Konto auf demselben oder einem anderen Gerät kann dieses Repository nicht über den Entwicklermodus laden.

Weitere Apps im App Store führen Code aus, den die nutzende Person selbst schreibt oder in ihre eigene Bibliothek holt. Das ist eine Beschreibung ihrer Funktion, keine Entscheidung von Apple über EveryApp:

- **Swift Playgrounds** (Apple) führt Swift aus, den man auf dem Gerät schreibt, in einer von Apple gelieferten Lernumgebung.
- **Scriptable** führt JavaScript aus, das man in der App schreibt oder in die eigene Bibliothek übernimmt. Es ist kein öffentlicher Katalog fremder Mini-Apps.
- **Pythonista** ist eine Python-Umgebung auf dem Gerät. Skripte schreibt oder importiert man selbst.
- **a-Shell** ist eine lokale Shell. Befehle und Skripte laufen in der Sandbox der App, ausgelöst von der Person am Gerät.
- **Pyto** führt Python aus, das man auf dem Gerät schreibt, einschließlich Pakete, die man selbst installiert.

Diese Apps sind keine HTML-Mini-App-Läden. Sie zeigen, dass Apple Umgebungen akzeptiert hat, in denen Personen ihren eigenen Code auf dem eigenen Gerät ausführen. Ob Review EveryApp genauso einordnet, entscheidet Apple.

## Richtlinie 4.7

4.7 erlaubt bestimmte Software außerhalb des Binaries, darunter HTML5- und JavaScript-Mini-Apps. Der Anbieter bleibt für diese Software verantwortlich. 4.7.1 bis 4.7.5 gelten zusätzlich.

Was dieser Build dafür hat:

- Der Katalog ist das Verzeichnis der Mini-Apps, die allen angeboten werden, mit Name, Beschreibung, Repository und Altersempfehlung.
- „Melden“ und die Sperrliste sind der Weg, einen Eintrag zu beanstanden und für alle zu deaktivieren.
- Gerätefunktionen (Speicher, Spotify, Netzwerk und die übrigen Brücken-Methoden) gibt es nur nach einmaliger Zustimmung pro Mini-App. Die Brücke ist eine Allowlist. Dateisystem, Kontakte und Standort sind nicht dabei. Siehe `docs/BRIDGE_API.md`.

Was dieser Build **nicht** tut und in den Notizen nicht behauptet werden darf:

- 4.7.4 verlangt Universal Links auf jede angebotene Software. Die App hat ein Verzeichnis im Programm, aber keine Universal Links pro Mini-App.
- 4.7.5 verlangt eine Altersschranke anhand eines geprüften oder erklärten Alters. Die Altersangaben im Katalog sind Empfehlungen. Die App prüft das Alter nicht.
- 4.7.2 untersagt, native Plattform-APIs an nicht eingebettete Software weiterzugeben, ohne vorherige Erlaubnis von Apple. Die Brücke gibt nach Zustimmung der nutzenden Person ausgewählte Gerätefunktionen frei. Das ist nicht dieselbe Erlaubnis. Diese Notiz behauptet nicht, dass Apple sie schon erteilt hat.

Der Entwicklermodus ist kein zweiter Katalog und kein Weg, 4.7 für fremde Repositories zu umgehen. Fremde Repositories lassen sich in diesem Build nicht installieren.

## English section for App Store Connect review notes

EveryApp has two areas in the `EXPO_PUBLIC_CATALOG_ONLY=1` build (the iOS build). This note describes the binary. It is not legal advice and it is not a claim that Apple has approved the app.

**Catalog.** Anyone can install the curated mini-apps listed under “Empfohlen” without a GitHub login. The list is `catalog/catalog.json` (name, repository, description, age recommendation). A remote blocklist can disable an entry for every install. “Melden” opens a prefilled email to the developer. There is no EveryApp account server.

**Developer mode.** The user turns it on in settings. They then sign in with their own GitHub account. The OAuth device flow is configured: the public client id `Ov23liZBUKxpmryUJW1a` is used when `EXPO_PUBLIC_GITHUB_CLIENT_ID` is unset (Metro and every EAS profile). There is no client secret. A personal access token also works. The token is stored only on the device and is sent only to GitHub. Signing out deletes it.

After sign-in, the app installs a repository only when both the owner in the GitHub URL and `owner.login` from `GET /repos/{owner}/{repo}` equal the authenticated user. The check is case-insensitive. Organization repositories and repositories owned by anyone else are rejected, even if the token can read them. Private repositories owned by that user are allowed. The same check runs on add, on every update, and on every open. If GitHub cannot confirm ownership, the mini-app does not start. QR codes and `everyapp://add` links for any other repository are rejected. There is no share path to another account. Signing out leaves the files on the device but disables open and update until the same account signs in again. Catalog mini-apps keep working without a session.

This follows the pattern Expo documents for Expo Go on a physical iPhone: Expo Go opens a development-server project only when Expo Go and Expo CLI are signed into the same Expo account, and a different account cannot open it (https://docs.expo.dev/troubleshooting/expo-go-sign-in-required). EveryApp uses the GitHub repository owner instead of an Expo account. The same idea appears in apps that run code the user writes on their own device: Swift Playgrounds (Apple’s Swift learning environment), Scriptable (the user’s own JavaScript library), Pythonista and Pyto (the user’s own Python), and a-Shell (a local shell in the app sandbox). Those are descriptions of what those apps do, not a determination that EveryApp is in the same category.

Builds without the catalog-only flag (Android) keep the existing flow: a repository outside the catalog requires an explicit warning and confirmation. Developer mode does not replace that flow.

Please do not read this note as claiming the following, because the app does not do them: universal links for each mini-app (Guideline 4.7.4), an age gate based on verified or declared age (4.7.5; catalog ages are recommendations only), or prior permission from Apple to expose native APIs to mini-apps (4.7.2). Native capabilities are an allowlist and require one-time consent per mini-app. The app does not expose the file system, contacts, or location.

To review developer mode, sign in with any GitHub account you control. A repository that account does not own will not install. Catalog apps do not need a login.
