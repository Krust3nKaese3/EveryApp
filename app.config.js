// Extends app.json. The EAS "development" profile sets APP_VARIANT=development,
// producing a separately installable dev-client app ("SrvEveryApp", package suffix .dev).
// CATALOG_ONLY / EXPO_PUBLIC_CATALOG_ONLY=1 hides free GitHub installs and offers own-repo developer mode.
const IS_DEV = process.env.APP_VARIANT === 'development';
const flagOn = (value) => ['1', 'true', 'yes'].includes(String(value || '').trim().toLowerCase());
const CATALOG_ONLY = flagOn(process.env.CATALOG_ONLY) || flagOn(process.env.EXPO_PUBLIC_CATALOG_ONLY);
if (CATALOG_ONLY) process.env.EXPO_PUBLIC_CATALOG_ONLY = process.env.EXPO_PUBLIC_CATALOG_ONLY || '1';

module.exports = ({ config }) => {
  const fromEnv = process.env.SPOTIFY_CLIENT_ID;
  const fromConfig = config.extra && config.extra.spotifyClientId;
  return {
    ...config,
    name: IS_DEV ? 'SrvEveryApp' : 'EveryApp',
    android: {
      ...config.android,
      package: IS_DEV ? `${config.android.package}.dev` : config.android.package,
    },
    // Optional prefill only. Empty is normal; the settings screen is the source of truth.
    extra: {
      ...config.extra,
      spotifyClientId: fromEnv || fromConfig || '',
      catalogOnly: CATALOG_ONLY,
      githubClientId: process.env.EXPO_PUBLIC_GITHUB_CLIENT_ID || '',
    },
  };
};
