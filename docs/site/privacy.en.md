# Privacy policy for OpenScr

As of 16 November 2026

**Draft, not legal advice.** Have the text reviewed before publication. Age labels in the catalog are the publisher's recommendations, not an official rating.

## Controller

Manuel Di Liberto

Am Hasensprung 49, 60437 Frankfurt am Main, Deutschland

krust3nkaese3@gmail.com

No data protection officer is appointed. If the law requires one, the contact will be added here.

Reports about OpenScrapps (the “Melden” button) and privacy requests go to `krust3nkaese3@gmail.com`. That is not a server of the app.

## What OpenScr is

OpenScr is a container app. It loads OpenScrapps from GitHub repositories (branch `main`) and shows them in a WebView. An OpenScrapp is HTML, JavaScript, CSS and media files plus `openscr.json`. If the repository has no `openscr.json`, the app still reads `everyapp.json`.

There is no OpenScr account and no OpenScr server. The app includes no analytics SDK and no advertising SDK, and it does not build a usage profile. This static website sets no cookies and loads no analytics.

## Data that stays on the device

Stored on the device, not on an OpenScr server:

- the list of installed OpenScrapps, folders and the install time
- the downloaded OpenScrapp files and the `main` commit that was installed
- permissions allowed or denied for each OpenScrapp
- the OpenScrapp's storage. Keys start with `@miniapp_` and the OpenScrapp id. Other OpenScrapps cannot read it. A value is text, at most 256 KiB
- secrets an OpenScrapp stores. If the build includes `expo-secure-store`, they are in device-protected storage, otherwise in app storage. Older entries are moved across on first access
- the Spotify client id, if you enter one, and a copy of that id in app storage
- Spotify Web API access and refresh tokens in app-private preferences named `everyapp_spotify`. The OpenScrapp does not receive these tokens
- in developer mode, a GitHub token and the matching username. The token is in device-protected storage when the build supports it, otherwise in app storage
- a local debug log
- for a local game room: display name, room code, room id and a player secret. The secret is in device-protected storage when that module is present, otherwise only in the running process. A room with no activity ends after 24 hours
- tasks and state an OpenScrapp stores for background work, tiles or widgets

Updating an OpenScrapp replaces only the downloaded files. Saves and other storage of that OpenScrapp stay. Deleting removes the files, storage, secrets, permissions and related caches of that OpenScrapp. Uninstalling OpenScr removes this app's data from the device.

## When data leaves the device

- **GitHub.** The app asks `api.github.com` for the current commit of `main` and downloads files from `raw.githubusercontent.com`. The same applies to `catalog/catalog.json` and `catalog/blocklist.json`. GitHub sees ordinary connection data, in particular the IP address, and which URL was requested. OpenScr does not add its own user id. If the fetch fails, the copy shipped in the app is used. In developer mode the app sends the stored token only to GitHub (`Authorization`) to check the account and to load repositories of that account, including private ones. The device flow uses the public client id `Ov23liZBUKxpmryUJW1a`, no client secret, and the scope `repo`.
- **OpenScrapps.** Only after you allow it may an OpenScrapp open connections itself (`http`, local network, raw TCP/UDP). The OpenScrapp chooses the destination and the body. That can include data it has read, such as storage, a Wi-Fi name, Bluetooth devices or game messages. The operator of that OpenScrapp is responsible. Cleartext HTTP on the local network is possible.
- **Spotify.** Playback control uses the Spotify app installed on the device (Spotify App Remote). Search, profile, playlists, saved tracks and playback state use the Spotify Web API with a PKCE token that stays inside OpenScr. Spotify receives the client id, the token and the query. Spotify's privacy policy applies as well. The OpenScrapp can see the account name, Spotify user id, product type, playlists and tracks if you granted `spotify`, but not the token.
- **Local multiplayer.** Phones on the same Wi-Fi or hotspot connect directly over TCP. There is no OpenScr server and no end-to-end encryption by OpenScr. The `_openscr._tcp` advertisement carries the OpenScrapp, room code, room id, display name (at most 24 characters) and player counts. It does not carry the token, the player secret or the IP address. The IP stays inside the app. The join QR code contains the private IPv4 address, the port, the room code, a token and the OpenScrapp id. Players on the same network see the display name and the game messages the OpenScrapp sends.
- **Report.** The button opens your mail app with a prefilled message to krust3nkaese3@gmail.com (name, repository, app id, version, commit). It is sent only if you send it. Your mail provider and that mailbox then process the message, including your From address.

## Permissions

Spotify, storage, multiplayer and every other bridge feature need their own consent for each OpenScrapp. The choice is stored for that OpenScrapp. You can revoke it under “Info und Berechtigungen”.

The bridge does not expose the file system, contacts or GPS coordinates. The camera is used to read QR codes (install an OpenScrapp or join a game room). OpenScr does not save a photo from that scan. The microphone is not used.

OpenScr does not request a location permission. `ACCESS_FINE_LOCATION` and `ACCESS_BACKGROUND_LOCATION` are not part of this release. GPS coordinates are not read. On current Android versions the Wi-Fi name is not available without that permission, so it stays hidden. Bluetooth scanning is not used to derive a location (`neverForLocation`).

A foreground service with a visible notification (“OpenScr aktiv”) runs only while an OpenScrapp needs an interval, a due or connected Bluetooth LE notification, or a hosted game room. The notification does not leave the device.

## Catalog and blocklist

“Empfohlen” shows OpenScrapps from the catalog (name, repository, description, age label). A blocklist can disable an OpenScrapp for every install; the app then shows the reason and does not start it. There is no separate user database for that.

The build flag `EXPO_PUBLIC_CATALOG_ONLY` turns free GitHub links off. That build has the catalog and, if you turn it on, developer mode: sign in with your own GitHub account, then only repositories owned by that account. Signing out deletes the token and disables those OpenScrapps. Builds without the flag keep free installation with a warning. The Play build leaves the flag off.

## Legal bases

- Art. 6 (1) (b) GDPR where processing is needed to perform the feature you start: load and store an OpenScrapp, update it, play locally, control Spotify, or load your own repository in developer mode.
- Art. 6 (1) (a) GDPR for optional device permissions and optional sign-in. You can withdraw consent in the app or in system settings. Withdrawal applies going forward.
- Art. 6 (1) (f) GDPR for a report you send and for the blocklist, so abusive OpenScrapps can be switched off. You may object.

There is no statutory duty to provide this data. Without a network connection the catalog and OpenScrapps cannot be refreshed. Developer mode and Spotify require you to sign in with GitHub or Spotify.

## Recipients

OpenScr does not sell data and does not share it for advertising. A transfer happens only in the cases above: GitHub (Microsoft), Spotify, destinations an OpenScrapp contacts after you allow it, players on the same local network, your mail app, and the mailbox krust3nkaese3@gmail.com if you send a report.

## Countries outside the EEA

GitHub and Spotify also process data in the United States. OpenScr does not run that transfer through its own server; the connection goes from the device to those services when you use the feature. Their safeguards, including the EU-US Data Privacy Framework and standard contractual clauses, are described in their policies:

- [GitHub General Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement)
- [Spotify Privacy Policy](https://www.spotify.com/privacy)

## Retention

Data on the device stays until you delete the OpenScrapp, sign out of the feature, or uninstall OpenScr. An idle game room ends after 24 hours. The controller deletes report emails when the review is finished, and at the latest after 12 months, unless the law requires longer.

## Your rights

Where the GDPR applies, you have the rights of access, rectification, erasure, restriction, portability and objection, the right to withdraw consent, and the right to lodge a complaint with a supervisory authority. That is usually the authority of your place of residence or of the controller's establishment.

Much of this data exists only on your device and can be removed by deleting the OpenScrapp or OpenScr. Requests: krust3nkaese3@gmail.com

## Automated decisions

There is no automated decision-making and no profiling within the meaning of Art. 22 GDPR.

## Children

The catalog shows an age recommendation. The app does not check age and is not directed at children under 16. If a report shows that we received a child's data, we delete it.

## Changes

This policy is in the app under “Datenschutz” and on this page: https://krust3nkaese3.github.io/OpenScr/site/privacy.html. The version with the date above is the one that applies.
