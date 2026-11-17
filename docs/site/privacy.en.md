# Privacy policy for EveryApp

As of 16 November 2026

**Draft, not legal advice.** Before publication, replace `{{BETREIBER_NAME}}`, `{{BETREIBER_ADRESSE}}` and `{{SUPPORT_EMAIL}}` and have the text reviewed. Age labels in the catalog are the publisher's recommendations, not an official rating.

## Controller

{{BETREIBER_NAME}}

{{BETREIBER_ADRESSE}}

{{SUPPORT_EMAIL}}

No data protection officer is appointed. If the law requires one, the contact will be added here.

Reports about mini-apps (the “Melden” button) open an email to manueldiliberto1@gmail.com. That is not a server of the app. Privacy requests go to `{{SUPPORT_EMAIL}}`.

## What EveryApp is

EveryApp is a container app. It loads mini-apps from GitHub repositories (branch `main`) and shows them in a WebView. A mini-app is HTML, JavaScript, CSS and media files plus `everyapp.json`.

There is no EveryApp account and no EveryApp server. The app includes no analytics SDK and no advertising SDK, and it does not build a usage profile. This static website sets no cookies and loads no analytics.

## Data that stays on the device

Stored on the device, not on an EveryApp server:

- the list of installed mini-apps, folders and the install time
- the downloaded mini-app files and the `main` commit that was installed
- permissions allowed or denied for each mini-app
- the mini-app's storage. Keys start with `@miniapp_` and the mini-app id. Other mini-apps cannot read it. A value is text, at most 256 KiB
- secrets a mini-app stores. If the build includes `expo-secure-store`, they are in device-protected storage, otherwise in app storage. Older entries are moved across on first access
- the Spotify client id, if you enter one, and a copy of that id in app storage
- Spotify Web API access and refresh tokens in app-private preferences named `everyapp_spotify`. The mini-app does not receive these tokens
- in developer mode, a GitHub token and the matching username. The token is in device-protected storage when the build supports it, otherwise in app storage
- a local debug log
- for a local game room: display name, room code, room id and a player secret. The secret is in device-protected storage when that module is present, otherwise only in the running process. A room with no activity ends after 24 hours
- tasks and state a mini-app stores for background work, tiles or widgets

Updating a mini-app replaces only the downloaded files. Saves and other storage of that mini-app stay. Deleting removes the files, storage, secrets, permissions and related caches of that mini-app. Uninstalling EveryApp removes this app's data from the device.

## When data leaves the device

- **GitHub.** The app asks `api.github.com` for the current commit of `main` and downloads files from `raw.githubusercontent.com`. The same applies to `catalog/catalog.json` and `catalog/blocklist.json`. GitHub sees ordinary connection data, in particular the IP address, and which URL was requested. EveryApp does not add its own user id. If the fetch fails, the copy shipped in the app is used. In developer mode the app sends the stored token only to GitHub (`Authorization`) to check the account and to load repositories of that account, including private ones. The device flow uses the public client id `Ov23liZBUKxpmryUJW1a`, no client secret, and the scope `repo`.
- **Mini-apps.** Only after you allow it may a mini-app open connections itself (`http`, local network, raw TCP/UDP). The mini-app chooses the destination and the body. That can include data it has read, such as storage, a Wi-Fi name, Bluetooth devices or game messages. The operator of that mini-app is responsible. Cleartext HTTP on the local network is possible.
- **Spotify.** Playback control uses the Spotify app installed on the device (Spotify App Remote). Search, profile, playlists, saved tracks and playback state use the Spotify Web API with a PKCE token that stays inside EveryApp. Spotify receives the client id, the token and the query. Spotify's privacy policy applies as well. The mini-app can see the account name, Spotify user id, product type, playlists and tracks if you granted `spotify`, but not the token.
- **Local multiplayer.** Phones on the same Wi-Fi or hotspot connect directly over TCP. There is no EveryApp server and no end-to-end encryption by EveryApp. The `_everyapp._tcp` advertisement carries the mini-app, room code, room id, display name (at most 24 characters) and player counts. It does not carry the token, the player secret or the IP address. The IP stays inside the app. The join QR code contains the private IPv4 address, the port, the room code, a token and the mini-app id. Players on the same network see the display name and the game messages the mini-app sends.
- **Report.** The button opens your mail app with a prefilled message to manueldiliberto1@gmail.com (name, repository, app id, version, commit). It is sent only if you send it. Your mail provider and that mailbox then process the message, including your From address.

## Permissions

Spotify, storage, multiplayer and every other bridge feature need their own consent for each mini-app. The choice is stored for that mini-app. You can revoke it under “Info und Berechtigungen”.

The bridge does not expose the file system, contacts or GPS coordinates. The camera is used to read QR codes (install a mini-app or join a game room). EveryApp does not save a photo from that scan. The microphone is not used.

EveryApp does not request a location permission. `ACCESS_FINE_LOCATION` and `ACCESS_BACKGROUND_LOCATION` are not part of this release. GPS coordinates are not read. On current Android versions the Wi-Fi name is not available without that permission, so it stays hidden. Bluetooth scanning is not used to derive a location (`neverForLocation`).

A foreground service with a visible notification (“EveryApp aktiv”) runs only while a mini-app needs an interval, a due or connected Bluetooth LE notification, or a hosted game room. The notification does not leave the device.

## Catalog and blocklist

“Empfohlen” shows mini-apps from the catalog (name, repository, description, age label). A blocklist can disable a mini-app for every install; the app then shows the reason and does not start it. There is no separate user database for that.

The build flag `EXPO_PUBLIC_CATALOG_ONLY` turns free GitHub links off. That build has the catalog and, if you turn it on, developer mode: sign in with your own GitHub account, then only repositories owned by that account. Signing out deletes the token and disables those mini-apps. Builds without the flag keep free installation with a warning. The Play build leaves the flag off.

## Legal bases

- Art. 6 (1) (b) GDPR where processing is needed to perform the feature you start: load and store a mini-app, update it, play locally, control Spotify, or load your own repository in developer mode.
- Art. 6 (1) (a) GDPR for optional device permissions and optional sign-in. You can withdraw consent in the app or in system settings. Withdrawal applies going forward.
- Art. 6 (1) (f) GDPR for a report you send and for the blocklist, so abusive mini-apps can be switched off. You may object.

There is no statutory duty to provide this data. Without a network connection the catalog and mini-apps cannot be refreshed. Developer mode and Spotify require you to sign in with GitHub or Spotify.

## Recipients

EveryApp does not sell data and does not share it for advertising. A transfer happens only in the cases above: GitHub (Microsoft), Spotify, destinations a mini-app contacts after you allow it, players on the same local network, your mail app, and the mailbox manueldiliberto1@gmail.com if you send a report.

## Countries outside the EEA

GitHub and Spotify also process data in the United States. EveryApp does not run that transfer through its own server; the connection goes from the device to those services when you use the feature. Their safeguards, including the EU-US Data Privacy Framework and standard contractual clauses, are described in their policies:

- [GitHub General Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement)
- [Spotify Privacy Policy](https://www.spotify.com/privacy)

## Retention

Data on the device stays until you delete the mini-app, sign out of the feature, or uninstall EveryApp. An idle game room ends after 24 hours. The controller deletes report emails when the review is finished, and at the latest after 12 months, unless the law requires longer.

## Your rights

Where the GDPR applies, you have the rights of access, rectification, erasure, restriction, portability and objection, the right to withdraw consent, and the right to lodge a complaint with a supervisory authority. That is usually the authority of your place of residence or of the controller's establishment.

Much of this data exists only on your device and can be removed by deleting the mini-app or EveryApp. Requests: {{SUPPORT_EMAIL}}

## Automated decisions

There is no automated decision-making and no profiling within the meaning of Art. 22 GDPR.

## Children

The catalog shows an age recommendation. The app does not check age and is not directed at children under 16. If a report shows that we received a child's data, we delete it.

## Changes

This policy is in the app under “Datenschutz” and on this page. The version with the date above is the one that applies.
