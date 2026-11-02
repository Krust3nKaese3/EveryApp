const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withBleManager(config) {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    const mainApplication = androidManifest.manifest.application[0];

    if (!mainApplication.service) {
      mainApplication.service = [];
    }

    const bleService = {
      $: {
        'android:name': 'it.innove.BleManager',
        'android:enabled': 'true',
      },
    };

    mainApplication.service.push(bleService);

    return config;
  });
};
