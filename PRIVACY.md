# Datenschutzerklärung für EveryApp

Stand: 14. November 2026

**Entwurf.** Vor der Veröffentlichung im Store die Stellen mit „BITTE AUSFÜLLEN“ ersetzen und den Text rechtlich prüfen lassen. Die Altersangaben im Katalog sind Empfehlungen des Anbieters, keine behördliche Kennzeichnung.

## Verantwortliche Stelle

[BITTE AUSFÜLLEN: Name des Anbieters]

[BITTE AUSFÜLLEN: Anschrift (Straße, PLZ, Ort, Land)]

[BITTE AUSFÜLLEN: E-Mail für Datenschutzanfragen]

Meldungen zu Mini-Apps (Schaltfläche „Melden“) öffnen eine E-Mail an manueldiliberto1@gmail.com. Das ist kein eigener Server der App.

## Was EveryApp ist

EveryApp ist eine Container-App für das Handy. Sie lädt Mini-Apps aus öffentlichen GitHub-Repositories (Branch `main`) und zeigt sie in einer abgeschotteten WebView. Eine Mini-App besteht aus HTML, JavaScript, CSS und Mediendateien plus der Datei `everyapp.json`.

Es gibt kein EveryApp-Benutzerkonto und keinen eigenen Server von EveryApp. Die App enthält kein Analyse- oder Werbe-SDK und baut kein Nutzungsprofil.

## Daten, die auf dem Gerät bleiben

Auf dem Gerät, nicht auf einem EveryApp-Server, liegen:

- die Liste der installierten Mini-Apps, Ordner und der Zeitpunkt der Installation
- die heruntergeladenen Dateien der Mini-App
- der Commit von `main`, der installiert wurde
- erlaubte und abgelehnte Berechtigungen je Mini-App
- der Speicher der Mini-App. Schlüssel beginnen mit `@miniapp_` und der Kennung der Mini-App. Andere Mini-Apps lesen diesen Speicher nicht
- Geheimnisse, die eine Mini-App ablegt (lokal, je nach Build im App-Speicher oder im gerätegeschützten Speicher)
- die Spotify-Client-ID, wenn du sie einträgst
- ein lokales Debug-Protokoll

Aktualisieren einer Mini-App ersetzt nur die geladenen Dateien. Spielstände und anderer Speicher dieser Mini-App bleiben erhalten. Löschen entfernt die Dateien, den Speicher, die Geheimnisse, die Berechtigungen und zugehörige Zwischenspeicher dieser Mini-App.

## Wann eine Verbindung aufgebaut wird

- **GitHub.** Die App fragt `api.github.com` nach dem aktuellen Commit von `main` und lädt Dateien von `raw.githubusercontent.com`. Dasselbe gilt für den Katalog `catalog/catalog.json` und die Sperrliste `catalog/blocklist.json` in diesem Repository. GitHub sieht dabei die üblichen Verbindungsdaten, insbesondere die IP-Adresse. EveryApp hängt keine Nutzerkennung an. Schlägt der Abruf fehl, gilt die in der App mitgelieferte Fassung von Katalog und Sperrliste.
- **Mini-Apps.** Erst nach deiner Zustimmung darf eine Mini-App selbst Verbindungen aufbauen (`http`, lokales Netz). Ziel und Inhalt bestimmt die Mini-App. Dafür ist der Betreiber dieser Mini-App verantwortlich, nicht ein Server von EveryApp.
- **Spotify.** Steuerung und Suche laufen über die auf dem Gerät installierte Spotify-App (Spotify App Remote), nicht über einen Dienst von EveryApp. Es gilt zusätzlich die Datenschutzerklärung von Spotify.
- **Melden.** Die Schaltfläche öffnet deine Mail-App mit einer vorausgefüllten Nachricht an manueldiliberto1@gmail.com (Name, Repository, App-Kennung, Version, Commit). Gesendet wird sie nur, wenn du das selbst tust.

## Berechtigungen

Spotify, Speicher und jede andere Brücken-Funktion brauchen eine eigene Zustimmung pro Mini-App: beim ersten Öffnen, wenn das Manifest sie nennt, oder beim ersten Benutzen. Die Entscheidung wird zu dieser Mini-App gespeichert. In „Info und Berechtigungen“ kannst du sie widerrufen oder später erlauben.

Die Brücke gibt kein Dateisystem, keine Kontakte und keinen Standort (keine GPS-Koordinaten) frei. Der WLAN-Name ist eine eigene Berechtigung und enthält keine Koordinaten.

## Katalog und Sperrliste

„Empfohlen“ zeigt Mini-Apps aus dem Katalog (Name, Repository, Beschreibung, Altersangabe). Eine Sperrliste kann eine Mini-App für alle Installationen deaktivieren; die App zeigt dann den Grund und startet sie nicht. Es gibt keine zusätzliche Nutzerdatenbank dafür.

Eine Build-Einstellung `EXPO_PUBLIC_CATALOG_ONLY` kann freie GitHub-Links und QR-Codes abschalten, damit nur der Katalog installiert werden kann.

## Kinder

Der Katalog nennt eine Altersempfehlung. Die App prüft das Alter der nutzenden Person nicht.

## Weitergabe

EveryApp verkauft keine Daten und gibt sie nicht zu Werbezwecken weiter. Eine Übermittlung findet nur in den oben beschriebenen Fällen statt (GitHub, von dir erlaubte Ziele einer Mini-App, die Spotify-App auf dem Gerät, deine Mail-App).

## Speicherdauer

Bis du die Mini-App oder EveryApp löschst oder einzelne Einträge in der Mini-App entfernst.

## Deine Rechte

Soweit die DSGVO gilt, hast du Rechte auf Auskunft, Berichtigung, Löschung, Einschränkung, Widerspruch und Beschwerde bei einer Aufsichtsbehörde. Viele dieser Daten liegen nur auf deinem Gerät und lassen sich durch Löschen der Mini-App oder von EveryApp entfernen.

Anfragen an: [BITTE AUSFÜLLEN: E-Mail für Datenschutzanfragen]

## Änderungen

Diese Erklärung liegt in der App unter „Datenschutz“ und in diesem Repository als `PRIVACY.md`.
