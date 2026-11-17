# Datenschutzerklärung für OpenScr

Stand: 16. November 2026

**Entwurf, keine Rechtsberatung.** Den Text vor der Veröffentlichung rechtlich prüfen lassen. Altersangaben im Katalog sind Empfehlungen des Anbieters, keine behördliche Kennzeichnung.

## Verantwortliche Stelle

Manuel Di Liberto

Am Hasensprung 49, 60437 Frankfurt am Main, Deutschland

krust3nkaese@gmail.com

Ein Datenschutzbeauftragter ist nicht benannt. Besteht eine Bestellpflicht, wird die Kontaktstelle hier ergänzt.

Meldungen zu Scrapps (Schaltfläche „Melden“) öffnen eine E-Mail an manueldiliberto1@gmail.com. Das ist kein Server der App. Datenschutzanfragen gehören an `krust3nkaese@gmail.com`.

## Was OpenScr ist

OpenScr ist eine Container-App für das Handy. Sie lädt Scrapps aus GitHub-Repositories (Branch `main`) und zeigt sie in einer WebView. Eine Scrapp besteht aus HTML, JavaScript, CSS und Mediendateien plus der Datei `openscr.json`. Liegt keine `openscr.json` im Repository, liest die App weiter `everyapp.json`.

Es gibt kein OpenScr-Benutzerkonto und keinen eigenen Server von OpenScr. Die App enthält kein Analyse- und kein Werbe-SDK und bildet kein Nutzungsprofil. Diese statische Website setzt keine Cookies und ruft keine Analyse auf.

## Daten, die auf dem Gerät bleiben

Auf dem Gerät, nicht auf einem OpenScr-Server, liegen:

- die Liste der installierten Scrapps, Ordner und der Zeitpunkt der Installation
- die heruntergeladenen Dateien der Scrapp und der Commit von `main`, der installiert wurde
- erlaubte und abgelehnte Berechtigungen je Scrapp
- der Speicher der Scrapp. Schlüssel beginnen mit `@miniapp_` und der Kennung der Scrapp. Andere Scrapps lesen diesen Speicher nicht. Ein Wert ist Text und höchstens 256 KiB
- Geheimnisse, die eine Scrapp ablegt. Liegt das Modul `expo-secure-store` im Build, stehen sie im gerätegeschützten Speicher, sonst im App-Speicher. Beim ersten Zugriff werden ältere Einträge dorthin übernommen
- die Spotify-Client-ID, wenn du sie einträgst, und ein Spiegel derselben ID im App-Speicher
- Zugriffs- und Aktualisierungstoken der Spotify-Web-API in den app-privaten Einstellungen unter dem Namen `everyapp_spotify`. Die Scrapp erhält diese Token nicht
- im Entwicklermodus ein GitHub-Token und der zugehörige Benutzername. Das Token liegt im gerätegeschützten Speicher, wenn der Build das unterstützt, sonst im App-Speicher
- ein lokales Debug-Protokoll
- für einen lokalen Spielraum: Anzeigename, Raumcode, Raum-Id und ein Spielergeheimnis. Das Geheimnis liegt im gerätegeschützten Speicher, wenn das Modul da ist, sonst nur im laufenden Prozess. Ein Raum ohne Aktivität endet nach 24 Stunden
- Aufgaben und Zustände, die eine Scrapp für den Hintergrund, für Kacheln oder für Widgets ablegt

Aktualisieren einer Scrapp ersetzt nur die geladenen Dateien. Spielstände und anderer Speicher dieser Scrapp bleiben erhalten. Löschen entfernt die Dateien, den Speicher, die Geheimnisse, die Berechtigungen und zugehörige Zwischenspeicher dieser Scrapp. Deinstallieren von OpenScr entfernt die Daten dieser App auf dem Gerät.

## Wann Daten das Gerät verlassen

- **GitHub.** Die App fragt `api.github.com` nach dem aktuellen Commit von `main` und lädt Dateien von `raw.githubusercontent.com`. Dasselbe gilt für den Katalog `catalog/catalog.json` und die Sperrliste `catalog/blocklist.json`. GitHub sieht dabei die üblichen Verbindungsdaten, insbesondere die IP-Adresse, und welche Adresse abgerufen wird. OpenScr hängt keine eigene Nutzerkennung an. Schlägt der Abruf fehl, gilt die in der App mitgelieferte Fassung. Im Entwicklermodus sendet die App das gespeicherte Token nur an GitHub (`Authorization`), um das Konto zu prüfen und Repositories dieses Kontos zu laden, auch private. Der Gerätefluss nutzt die öffentliche Client-ID `Ov23liZBUKxpmryUJW1a`, ohne Client-Secret, mit dem Umfang `repo`.
- **Scrapps.** Erst nach deiner Zustimmung darf eine Scrapp selbst Verbindungen aufbauen (`http`, lokales Netz, Roh-TCP/UDP). Ziel und Inhalt bestimmt die Scrapp. Dazu können Daten gehören, die sie zuvor gelesen hat, etwa Speicher, WLAN-Name, Bluetooth-Geräte oder Spielnachrichten. Dafür ist der Betreiber dieser Scrapp verantwortlich. Im lokalen Netz ist unverschlüsseltes HTTP möglich.
- **Spotify.** Steuerung läuft über die auf dem Gerät installierte Spotify-App (Spotify App Remote). Suche, Profil, Playlists, gespeicherte Titel und der Wiedergabestatus laufen über die Spotify-Web-API mit einem PKCE-Token, das in OpenScr bleibt. Spotify erhält die Client-ID, das Token und die Abfrage. Es gilt zusätzlich die Datenschutzerklärung von Spotify. Die Scrapp sieht Kontoname, Spotify-Benutzer-ID, Produkttyp, Playlist- und Titeldaten, wenn du die Berechtigung `spotify` erteilt hast, aber nicht das Token.
- **Lokaler Mehrspieler.** Telefone im selben WLAN oder Hotspot verbinden sich direkt per TCP. Es gibt dafür keinen OpenScr-Server und keine Ende-zu-Ende-Verschlüsselung durch OpenScr. Die Bekanntgabe `_openscr._tcp` nennt Scrapp, Raumcode, Raum-Id, Anzeigename (höchstens 24 Zeichen) und Spielerzahlen. Token, Spielergeheimnis und IP stehen nicht darin. Die IP bleibt in der App. Der QR-Code zum Beitreten enthält die private IPv4-Adresse, den Port, den Raumcode, ein Token und die Scrapp-Id. Mitspieler im selben Netz sehen den Anzeigenamen und die Spielnachrichten, die die Scrapp sendet.
- **Melden.** Die Schaltfläche öffnet deine Mail-App mit einer vorausgefüllten Nachricht an manueldiliberto1@gmail.com (Name, Repository, App-Kennung, Version, Commit). Gesendet wird sie nur, wenn du das selbst tust. Dann verarbeiten dein Mail-Anbieter und dieses Postfach die Nachricht, einschließlich deiner Absenderadresse.

## Berechtigungen

Spotify, Speicher, Mehrspieler und jede andere Brücken-Funktion brauchen eine eigene Zustimmung pro Scrapp. Die Entscheidung wird zu dieser Scrapp gespeichert. In „Info und Berechtigungen“ kannst du sie widerrufen.

Die Brücke gibt kein Dateisystem, keine Kontakte und keine GPS-Koordinaten frei. Die Kamera dient dem Lesen von QR-Codes (Scrapp installieren oder einem Spielraum beitreten). OpenScr speichert dabei kein Foto. Ein Mikrofon wird nicht verwendet.

OpenScr fordert keine Standortberechtigung an. `ACCESS_FINE_LOCATION` und `ACCESS_BACKGROUND_LOCATION` sind nicht Teil dieses Release. GPS-Koordinaten werden nicht gelesen. Den WLAN-Namen gibt Android auf aktuellen Versionen ohne diese Berechtigung nicht heraus; dann bleibt er verborgen. Bluetooth-Suche ist nicht dazu da, einen Standort abzuleiten (`neverForLocation`).

Ein Vordergrunddienst mit sichtbarer Benachrichtigung („OpenScr aktiv“) läuft nur, solange eine Scrapp ein Intervall, eine fällige oder verbundene Bluetooth-LE-Benachrichtigung oder einen gehosteten Spielraum braucht. Die Benachrichtigung verlässt das Gerät nicht.

## Katalog und Sperrliste

„Empfohlen“ zeigt Scrapps aus dem Katalog (Name, Repository, Beschreibung, Altersangabe). Eine Sperrliste kann eine Scrapp für alle Installationen deaktivieren; die App zeigt dann den Grund und startet sie nicht. Es gibt keine zusätzliche Nutzerdatenbank dafür.

Eine Build-Einstellung `EXPO_PUBLIC_CATALOG_ONLY` schaltet freie GitHub-Links ab. In dem Build gibt es den Katalog und, wenn du ihn einschaltest, den Entwicklermodus: Anmeldung mit dem eigenen GitHub-Konto, danach nur Repositories, deren Besitzer dieses Konto ist. Abmelden löscht das Token und schaltet diese Scrapps aus. Builds ohne diese Einstellung behalten die freie Installation mit Warnung. Der Play-Build lässt die Einstellung aus.

## Rechtsgrundlagen

- Art. 6 Abs. 1 lit. b DSGVO, soweit die Verarbeitung nötig ist, um die Funktion auszuführen, die du startest: Scrapp laden und speichern, aktualisieren, lokal spielen, Spotify steuern, im Entwicklermodus das eigene Repository laden.
- Art. 6 Abs. 1 lit. a DSGVO für optionale Gerätefreigaben und optionale Anmeldungen. Du kannst die Zustimmung in der App oder in den Systemeinstellungen widerrufen. Der Widerruf wirkt für die Zukunft.
- Art. 6 Abs. 1 lit. f DSGVO für eine Meldung, die du absendest, und für die Sperrliste, damit missbräuchliche Scrapps abgeschaltet werden können. Du kannst dem widersprechen.

Eine gesetzliche Pflicht, diese Daten bereitzustellen, besteht nicht. Ohne Netzverbindung lassen sich Katalog und Scrapps nicht neu laden. Entwicklermodus und Spotify setzen voraus, dass du dich bei GitHub beziehungsweise Spotify anmeldest.

## Empfänger

OpenScr verkauft keine Daten und gibt sie nicht zu Werbezwecken weiter. Eine Übermittlung findet nur in den oben beschriebenen Fällen statt: GitHub (Microsoft), Spotify, von dir erlaubte Ziele einer Scrapp, Mitspieler im selben lokalen Netz, deine Mail-App und das Postfach manueldiliberto1@gmail.com, wenn du eine Meldung absendest.

## Drittländer

GitHub und Spotify verarbeiten Daten auch in den USA. OpenScr betreibt die Übermittlung nicht über einen eigenen Server; die Verbindung geht vom Gerät zu diesen Diensten, sobald du die Funktion nutzt. Welche Garantien sie verwenden, steht in ihren Erklärungen, insbesondere zum EU-US Data Privacy Framework und zu Standardvertragsklauseln:

- [GitHub General Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement)
- [Spotify Privacy Policy](https://www.spotify.com/privacy)

## Speicherdauer

Daten auf dem Gerät bleiben, bis du die Scrapp löschst, die einzelne Funktion abmeldest oder OpenScr deinstallierst. Ein ungenutzter Spielraum endet nach 24 Stunden. Meldungen im Postfach löscht der Betreiber, sobald die Prüfung abgeschlossen ist, spätestens nach 12 Monaten, sofern keine gesetzliche Pflicht entgegensteht.

## Deine Rechte

Soweit die DSGVO gilt, hast du Rechte auf Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch sowie das Recht, eine Einwilligung zu widerrufen und dich bei einer Aufsichtsbehörde zu beschweren. Zuständig ist in der Regel die Behörde deines Wohnorts oder des Sitzes des Verantwortlichen.

Viele dieser Daten liegen nur auf deinem Gerät und lassen sich durch Löschen der Scrapp oder von OpenScr entfernen. Anfragen an: krust3nkaese@gmail.com

## Automatisierte Entscheidungen

Es gibt keine automatisierte Entscheidungsfindung und kein Profiling im Sinne von Art. 22 DSGVO.

## Kinder

Der Katalog nennt eine Altersempfehlung. Die App prüft das Alter nicht und richtet sich nicht an Kinder unter 16 Jahren. Erhalten wir über eine Meldung erkennbar Daten eines Kindes, löschen wir sie.

## Änderungen

Diese Erklärung liegt in der App unter „Datenschutz“ und auf dieser Seite: https://krust3nkaese3.github.io/OpenScr/site/datenschutz.html. Es gilt die Fassung mit dem Datum oben.
