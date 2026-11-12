// Extends app.json. The EAS "development" profile sets APP_VARIANT=development,
// producing a separately installable dev-client app ("SrvEveryApp", package suffix .dev).
const IS_DEV = process.env.APP_VARIANT === 'development';

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
    },
  };
};
