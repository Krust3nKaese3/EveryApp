# Nutzungsbedingungen für EveryApp

Stand: 14. November 2026

**Entwurf.** Vor der Veröffentlichung im Store die Stellen mit „BITTE AUSFÜLLEN“ ersetzen und den Text rechtlich prüfen lassen.

## Anbieter

[BITTE AUSFÜLLEN: Name des Anbieters]

[BITTE AUSFÜLLEN: Anschrift (Straße, PLZ, Ort, Land)]

[BITTE AUSFÜLLEN: Kontakt-E-Mail]

## Gegenstand

EveryApp stellt eine Laufzeitumgebung für Mini-Apps bereit. Mini-Apps werden aus öffentlichen GitHub-Repositories geladen, die einen Branch `main` und eine Datei `everyapp.json` haben. EveryApp ist nicht der Betreiber dieser Mini-Apps.

Es gibt keinen eigenen EveryApp-Server, kein Nutzerkonto und kein Tracking durch EveryApp.

## Katalog und eigene Repositories

Unter „Empfohlen“ kannst du gelistete Mini-Apps mit einem Tipp installieren. Der Katalog ist eine Auswahl des Anbieters, keine Zusage, dass eine Mini-App fehlerfrei, rechtmäßig oder für ein bestimmtes Alter geeignet ist. Die Altersangabe ist eine Empfehlung und muss vor dem Store-Release geprüft werden.

Installierst du eine Adresse, die nicht im Katalog steht (Eingabe, QR-Code oder Link), weist EveryApp dich vorher darauf hin, nur vertrauenswürdige Quellen hinzuzufügen, und nennt, worauf die Mini-App nach Zustimmung zugreifen kann. Die Installation braucht dann eine ausdrückliche Bestätigung.

Builds mit `EXPO_PUBLIC_CATALOG_ONLY=1` (Profil `production-catalog`) lassen freie GitHub-Links nicht zu. Dort gibt es den Katalog und einen freiwilligen Entwicklermodus. Im Entwicklermodus meldest du dich mit deinem GitHub-Konto an (Geräte-Anmeldung oder persönliches Token, nur auf diesem Gerät gespeichert). Danach lassen sich nur Repositories laden, deren Besitzer dieses Konto ist. Fremde Links, QR-Codes und Add-Links werden abgelehnt. Die Zugehörigkeit wird beim Hinzufügen, beim Aktualisieren und beim Öffnen erneut bei GitHub geprüft. Abmelden schaltet diese Mini-Apps aus. Das ist für einen späteren iOS-Build vorgesehen. Builds ohne diese Einstellung behalten die freie Installation mit Warnung.

## Berechtigungen

Eine Mini-App erhält Spotify, Speicher und andere Gerätefunktionen nur nach einmaliger Zustimmung für diese Mini-App. Du kannst die Zustimmung in den App-Infos widerrufen. Ohne Zustimmung bleibt die Funktion aus.

Dateisystem, Kontakte und Standort (GPS) stellt EveryApp Mini-Apps nicht zur Verfügung.

## Melden und Sperren

„Melden“ öffnet eine E-Mail an manueldiliberto1@gmail.com mit den Daten der Mini-App. Es gibt keinen Melde-Server in der App. Eine ferne Sperrliste (`catalog/blocklist.json`) kann Mini-Apps für alle Installationen deaktivieren. Dann zeigt EveryApp den hinterlegten Grund und startet die Mini-App nicht.

## Deine Pflichten

Füge nur Repositories hinzu, denen du vertraust. Du bist dafür verantwortlich, keine Mini-Apps zu nutzen oder weiterzugeben, die gegen geltendes Recht verstoßen, andere Personen ausspähen oder Geräte beschädigen. Mini-Apps können nach deiner Zustimmung Netzwerk, Bluetooth oder andere freigegebene Funktionen nutzen.

## Spotify

Funktionen mit Spotify setzen die installierte Spotify-App und ein Spotify-Konto voraus. Es gelten die Bedingungen von Spotify. EveryApp speichert die Client-ID lokal und betreibt keinen eigenen Spotify-Dienst.

## Updates

„Aktualisieren“ lädt den aktuellen Commit von `main`. Der bisherige Speicher der Mini-App (zum Beispiel ein Spielstand) bleibt dabei erhalten. Die App kann beim Öffnen prüfen, ob ein neuerer Commit vorliegt.

## Löschen

Löschen entfernt die Mini-App, ihren Speicher, ihre Geheimnisse, ihre Berechtigungen und zugehörige Zwischenspeicher.

## Haftung

Die App und die geladenen Mini-Apps werden bereitgestellt, wie sie sind. Für Schäden aus Mini-Apps Dritter haftet der Anbieter nur, soweit das zwingende Recht das vorsieht, insbesondere bei Vorsatz und grober Fahrlässigkeit und bei Verletzung von Leben, Körper oder Gesundheit. Dieser Absatz ist ein Entwurf und ersetzt keine Rechtsberatung.

[BITTE AUSFÜLLEN: Gerichtsstand und anwendbares Recht, falls gewünscht]

## Änderungen

Diese Bedingungen liegen in der App unter „Nutzung“ und in diesem Repository als `TERMS.md`.
