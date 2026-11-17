# Terms of use and legal notice for OpenScr

As of 16 November 2026

**Draft, not legal advice.** Have the text reviewed before publication.

## Legal notice

Provider of this offering:

Manuel Di Liberto

Am Hasensprung 49, 60437 Frankfurt am Main, Deutschland

Email: krust3nkaese@gmail.com

Responsible for content: Manuel Di Liberto, address as above.

A VAT identification number will be added here once the provider has one. The provider must check, for the place of establishment, whether further mandatory disclosures apply, such as a register or a professional title.

## Subject

OpenScr provides a runtime for Scrapps. Scrapps are loaded from GitHub repositories that have a `main` branch and an `openscr.json` file. `everyapp.json` is still accepted when `openscr.json` is absent. They run as HTML, CSS and JavaScript in a WebView. Background tasks of a Scrapp are JavaScript that OpenScr runs in its own JavaScript engine. OpenScr does not download native code (no DEX, no JAR, no `.so` file) from the Scrapp repository. OpenScr is not the operator of those Scrapps.

There is no OpenScr server, no user account and no tracking by OpenScr.

## Catalog and your own repositories

Under “Empfohlen” you can install listed Scrapps with one tap. The catalog is the provider's selection. It is not a promise that a Scrapp is correct, lawful or suitable for a given age. The age label is a recommendation, not an official rating.

If you install an address that is not in the catalog (typed URL, QR code or link), OpenScr warns you first to add only sources you trust, and it names what the Scrapp can use after you consent. Installation then needs an explicit confirmation.

Builds with `EXPO_PUBLIC_CATALOG_ONLY=1` (profile `production-catalog`) do not allow free GitHub links. That build has the catalog and an optional developer mode. In developer mode you sign in with your GitHub account (device flow or a personal token stored only on this device). After that, only repositories owned by that account can be loaded. Other links, QR codes and add-links are rejected. Ownership is checked again on add, on update and on open. Signing out disables those Scrapps. That build is intended for a later iOS release. The Android build for Google Play keeps free installation with a warning.

## Permissions

A Scrapp receives Spotify, storage, multiplayer and other device features only after one-time consent for that Scrapp. You can revoke consent in the app info. Without consent the feature stays off.

OpenScr does not give Scrapps the file system, contacts or GPS coordinates. The camera reads QR codes. The microphone is not used. This release does not include a location permission.

## Reports and blocking

“Melden” opens an email to manueldiliberto1@gmail.com with the Scrapp's details. There is no report server in the app. A remote blocklist (`catalog/blocklist.json`) can disable Scrapps for every install. OpenScr then shows the stored reason and does not start the Scrapp.

## Your duties

Add only repositories you trust. You are responsible for not using or distributing Scrapps that break the law, spy on other people or damage devices. After you consent, Scrapps can use the network, Bluetooth or other granted features.

In local multiplayer, players on the same Wi-Fi or hotspot see your display name and the messages the Scrapp sends. Do not use a room to attack other devices or to harass people.

## Spotify

Spotify features require the installed Spotify app and a Spotify account. Spotify's terms apply. OpenScr stores the client id and the Web API tokens locally and does not operate its own Spotify service.

## Updates

“Aktualisieren” loads the current commit of `main`. The Scrapp's existing storage (for example a saved game) is kept. The app can check on open whether a newer commit exists.

## Deletion

Delete removes the Scrapp, its storage, its secrets, its permissions and related caches. Uninstalling removes OpenScr's data from the device. There is no OpenScr account that would have to be deleted on a server.

## Liability

The app and the loaded Scrapps are provided as they are. For damage caused by third-party Scrapps, the provider is liable only to the extent mandatory law requires, in particular for intent and gross negligence and for injury to life, body or health. This paragraph is a draft and is not legal advice.

## Governing law

Draft for an establishment in Germany: the law of the Federal Republic of Germany applies, excluding the UN Convention on Contracts for the International Sale of Goods. Mandatory consumer-protection rules of the country where you live remain in force. If the provider is not established in Germany, this section must be replaced.

## Changes

These terms are in the app under “Nutzung” and on this page: https://krust3nkaese3.github.io/OpenScr/site/terms.html. The version with the date above is the one that applies.
