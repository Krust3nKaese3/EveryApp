// Extends app.json. The EAS "development" profile sets APP_VARIANT=development,
// producing a separately installable dev-client app ("SrvEveryApp", package suffix .dev).
// CATALOG_ONLY / EXPO_PUBLIC_CATALOG_ONLY=1 hides free GitHub installs and offers own-repo developer mode.
const IS_DEV = process.env.APP_VARIANT === 'development';
const flagOn = (value) => ['1', 'true', 'yes'].includes(String(value || '').trim().toLowerCase());
const CATALOG_ONLY = flagOn(process.env.CATALOG_ONLY) || flagOn(process.env.EXPO_PUBLIC_CATALOG_ONLY);
if (CATALOG_ONLY) process.env.EXPO_PUBLIC_CATALOG_ONLY = process.env.EXPO_PUBLIC_CATALOG_ONLY || '1';
// Public GitHub OAuth client id (Device Flow). Not a secret. Metro inherits this when the env var is unset.
const DEFAULT_GITHUB_CLIENT_ID = 'Ov23liZBUKxpmryUJW1a';
if (!String(process.env.EXPO_PUBLIC_GITHUB_CLIENT_ID || '').trim()) {
  process.env.EXPO_PUBLIC_GITHUB_CLIENT_ID = DEFAULT_GITHUB_CLIENT_ID;
}

module.exports = ({ config }) => {
  const fromEnv = process.env.SPOTIFY_CLIENT_ID;
  const fromConfig = config.extra && config.extra.spotifyClientId;
  return {
    ...config,
    name: IS_DEV ? 'SrvEveryApp' : 'EveryApp',
    android: {
      ...config.android,
      package: IS_DEV ? `${config.android.package}.dev` : config.android.package,
      // Lokaler Mehrspieler: Internet (Sockets) plus Netzstatus, um die WLAN-Adresse zu lesen.
      permissions: ['INTERNET', 'ACCESS_NETWORK_STATE', 'ACCESS_WIFI_STATE'].reduce((list, name) => {
        const next = Array.isArray(list) ? list.slice() : [];
        if (!next.includes(name)) next.push(name);
        return next;
      }, config.android && config.android.permissions),
    },
    ios: {
      ...config.ios,
      infoPlist: {
        ...(config.ios && config.ios.infoPlist),
        // Abfrage für Verbindungen im lokalen Netz. Der QR-Code ist die Einladung, Bonjour löst auf iOS oft erst die Systemfrage aus.
        NSLocalNetworkUsageDescription:
          'EveryApp sucht Spiele in der Nähe und verbindet Mitspieler im selben WLAN oder Hotspot, ohne Internet.',
        NSBonjourServices: ['_everyapp._tcp'],
      },
    },
    plugins: [...(config.plugins || []), 'with-react-native-tcp-socket'],
    // Optional prefill only. Empty is normal; the settings screen is the source of truth.
    extra: {
      ...config.extra,
      spotifyClientId: fromEnv || fromConfig || '',
      catalogOnly: CATALOG_ONLY,
      githubClientId: process.env.EXPO_PUBLIC_GITHUB_CLIENT_ID || DEFAULT_GITHUB_CLIENT_ID,
    },
  };
};
