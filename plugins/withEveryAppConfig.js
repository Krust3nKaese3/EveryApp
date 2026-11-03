const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withEveryAppConfig(config) {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    const mainApplication = androidManifest.manifest.application[0];

    mainApplication.$['android:usesCleartextTraffic'] = 'true';

    if (!mainApplication.service) {
      mainApplication.service = [];
    }

    const backgroundService = {
      $: {
        'android:name': 'expo.modules.backgroundservice.EveryAppBackgroundService',
        'android:enabled': 'true',
        'android:exported': 'false',
        'android:foregroundServiceType': 'dataSync',
      },
    };

    const existingService = mainApplication.service.find(
      (s) => s.$['android:name'] === backgroundService.$['android:name']
    );

    if (!existingService) {
      mainApplication.service.push(backgroundService);
    }

    return config;
  });
};
