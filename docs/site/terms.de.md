# Nutzungsbedingungen und Impressum für EveryApp

Stand: 16. November 2026

**Entwurf, keine Rechtsberatung.** Den Text vor der Veröffentlichung rechtlich prüfen lassen.

## Impressum

Angaben zum Anbieter dieses Angebots:

Manuel Di Liberto

Am Hasensprung 49, 60437 Frankfurt am Main, Deutschland

E-Mail: krust3nkaese@gmail.com

Verantwortlich für den Inhalt: Manuel Di Liberto, Anschrift wie oben.

Eine Umsatzsteuer-Identifikationsnummer wird hier genannt, sobald der Betreiber eine hat. Ob weitere Pflichtangaben nötig sind, etwa ein Register oder eine Berufsbezeichnung, muss der Betreiber für seinen Sitz prüfen lassen.

## Gegenstand

EveryApp stellt eine Laufzeitumgebung für Mini-Apps bereit. Mini-Apps werden aus GitHub-Repositories geladen, die einen Branch `main` und eine Datei `everyapp.json` haben. Sie laufen als HTML, CSS und JavaScript in einer WebView. Hintergrundaufgaben einer Mini-App sind JavaScript, das EveryApp in der eigenen JavaScript-Engine ausführt. EveryApp lädt keinen nativen Code (kein DEX, kein JAR, keine `.so`-Datei) aus dem Mini-App-Repository. EveryApp ist nicht der Betreiber dieser Mini-Apps.

Es gibt keinen eigenen EveryApp-Server, kein Nutzerkonto und kein Tracking durch EveryApp.

## Katalog und eigene Repositories

Unter „Empfohlen“ kannst du gelistete Mini-Apps mit einem Tipp installieren. Der Katalog ist eine Auswahl des Anbieters, keine Zusage, dass eine Mini-App fehlerfrei, rechtmäßig oder für ein bestimmtes Alter geeignet ist. Die Altersangabe ist eine Empfehlung und keine behördliche Kennzeichnung.

Installierst du eine Adresse, die nicht im Katalog steht (Eingabe, QR-Code oder Link), weist EveryApp dich vorher darauf hin, nur vertrauenswürdige Quellen hinzuzufügen, und nennt, worauf die Mini-App nach Zustimmung zugreifen kann. Die Installation braucht dann eine ausdrückliche Bestätigung.

Builds mit `EXPO_PUBLIC_CATALOG_ONLY=1` (Profil `production-catalog`) lassen freie GitHub-Links nicht zu. Dort gibt es den Katalog und einen freiwilligen Entwicklermodus. Im Entwicklermodus meldest du dich mit deinem GitHub-Konto an (Geräte-Anmeldung oder persönliches Token, nur auf diesem Gerät gespeichert). Danach lassen sich nur Repositories laden, deren Besitzer dieses Konto ist. Fremde Links, QR-Codes und Add-Links werden abgelehnt. Die Zugehörigkeit wird beim Hinzufügen, beim Aktualisieren und beim Öffnen erneut bei GitHub geprüft. Abmelden schaltet diese Mini-Apps aus. Das ist für einen späteren iOS-Build vorgesehen. Der Android-Build für Google Play behält die freie Installation mit Warnung.

## Berechtigungen

Eine Mini-App erhält Spotify, Speicher, Mehrspieler und andere Gerätefunktionen nur nach einmaliger Zustimmung für diese Mini-App. Du kannst die Zustimmung in den App-Infos widerrufen. Ohne Zustimmung bleibt die Funktion aus.

Dateisystem, Kontakte und GPS-Koordinaten stellt EveryApp Mini-Apps nicht zur Verfügung. Die Kamera liest QR-Codes. Ein Mikrofon wird nicht verwendet. Eine Standortberechtigung ist in diesem Release nicht enthalten.

## Melden und Sperren

„Melden“ öffnet eine E-Mail an manueldiliberto1@gmail.com mit den Daten der Mini-App. Es gibt keinen Melde-Server in der App. Eine ferne Sperrliste (`catalog/blocklist.json`) kann Mini-Apps für alle Installationen deaktivieren. Dann zeigt EveryApp den hinterlegten Grund und startet die Mini-App nicht.

## Deine Pflichten

Füge nur Repositories hinzu, denen du vertraust. Du bist dafür verantwortlich, keine Mini-Apps zu nutzen oder weiterzugeben, die gegen geltendes Recht verstoßen, andere Personen ausspähen oder Geräte beschädigen. Mini-Apps können nach deiner Zustimmung Netzwerk, Bluetooth oder andere freigegebene Funktionen nutzen.

Im lokalen Mehrspieler sehen Mitspieler im selben WLAN oder Hotspot deinen Anzeigenamen und die Nachrichten der Mini-App. Nutze den Spielraum nicht, um fremde Geräte anzugreifen oder Personen zu belästigen.

## Spotify

Funktionen mit Spotify setzen die installierte Spotify-App und ein Spotify-Konto voraus. Es gelten die Bedingungen von Spotify. EveryApp speichert die Client-ID und die Web-API-Token lokal und betreibt keinen eigenen Spotify-Dienst.

## Updates

„Aktualisieren“ lädt den aktuellen Commit von `main`. Der bisherige Speicher der Mini-App (zum Beispiel ein Spielstand) bleibt dabei erhalten. Die App kann beim Öffnen prüfen, ob ein neuerer Commit vorliegt.

## Löschen

Löschen entfernt die Mini-App, ihren Speicher, ihre Geheimnisse, ihre Berechtigungen und zugehörige Zwischenspeicher. Deinstallieren entfernt die Daten von EveryApp auf dem Gerät. Ein EveryApp-Konto, das serverseitig zu löschen wäre, gibt es nicht.

## Haftung

Die App und die geladenen Mini-Apps werden bereitgestellt, wie sie sind. Für Schäden aus Mini-Apps Dritter haftet der Anbieter nur, soweit das zwingende Recht das vorsieht, insbesondere bei Vorsatz und grober Fahrlässigkeit und bei Verletzung von Leben, Körper oder Gesundheit. Dieser Absatz ist ein Entwurf und ersetzt keine Rechtsberatung.

## Anwendbares Recht

Entwurf für einen Sitz in Deutschland: Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des UN-Kaufrechts. Zwingende Verbraucherschutzvorschriften des Staates, in dem du wohnst, bleiben unberührt. Sitzt der Betreiber nicht in Deutschland, ist dieser Abschnitt zu ersetzen.

## Änderungen

Diese Bedingungen liegen in der App unter „Nutzung“ und auf dieser Seite. Es gilt die Fassung mit dem Datum oben.
