const { withAndroidManifest } = require('@expo/config-plugins');

const PERMISSIONS = [
  'android.permission.RECEIVE_BOOT_COMPLETED',
  'android.permission.ACCESS_NETWORK_STATE',
  'android.permission.ACCESS_WIFI_STATE',
  'android.permission.WAKE_LOCK',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
  'android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE',
  'android.permission.SCHEDULE_EXACT_ALARM',
];

function upsert(list, name, entry) {
  const idx = list.findIndex((item) => item.$['android:name'] === name);
  if (idx >= 0) list[idx] = entry;
  else list.push(entry);
}

function tileService(className, label) {
  return {
    $: {
      'android:name': className,
      'android:exported': 'true',
      'android:icon': '@android:drawable/ic_menu_compass',
      'android:label': label,
      'android:permission': 'android.permission.BIND_QUICK_SETTINGS_TILE',
    },
    'intent-filter': [
      {
        action: [{ $: { 'android:name': 'android.service.quicksettings.action.QS_TILE' } }],
      },
    ],
  };
}

module.exports = function withEveryAppConfig(config) {
  return withAndroidManifest(config, (config) => {
    const androidManifest = config.modResults;
    const mainApplication = androidManifest.manifest.application[0];
    mainApplication.$['android:usesCleartextTraffic'] = 'true';

    if (!androidManifest.manifest['uses-permission']) androidManifest.manifest['uses-permission'] = [];
    for (const name of PERMISSIONS) {
      const exists = androidManifest.manifest['uses-permission'].some((p) => p.$['android:name'] === name);
      if (!exists) androidManifest.manifest['uses-permission'].push({ $: { 'android:name': name } });
    }

    if (!mainApplication.service) mainApplication.service = [];
    upsert(mainApplication.service, 'expo.modules.backgroundservice.EveryAppBackgroundService', {
      $: {
        'android:name': 'expo.modules.backgroundservice.EveryAppBackgroundService',
        'android:enabled': 'true',
        'android:exported': 'false',
        'android:foregroundServiceType': 'dataSync|connectedDevice',
      },
    });
    upsert(mainApplication.service, 'expo.modules.backgroundservice.EveryAppHeadlessTaskService', {
      $: {
        'android:name': 'expo.modules.backgroundservice.EveryAppHeadlessTaskService',
        'android:enabled': 'true',
        'android:exported': 'false',
        'android:foregroundServiceType': 'shortService|dataSync',
      },
    });
    for (let i = 1; i <= 5; i += 1) {
      const name = `expo.modules.backgroundservice.EveryAppTile${i}`;
      upsert(mainApplication.service, name, tileService(name, `EveryApp ${i}`));
    }

    if (!mainApplication.receiver) mainApplication.receiver = [];
    upsert(mainApplication.receiver, 'expo.modules.backgroundservice.MacroTriggerReceiver', {
      $: {
        'android:name': 'expo.modules.backgroundservice.MacroTriggerReceiver',
        'android:enabled': 'true',
        'android:exported': 'true',
      },
      'intent-filter': [
        {
          action: [
            { $: { 'android:name': 'android.intent.action.BOOT_COMPLETED' } },
            { $: { 'android:name': 'android.bluetooth.device.action.ACL_CONNECTED' } },
            { $: { 'android:name': 'android.bluetooth.device.action.ACL_DISCONNECTED' } },
          ],
        },
      ],
    });
    upsert(mainApplication.receiver, 'expo.modules.backgroundservice.InternalTriggerReceiver', {
      $: {
        'android:name': 'expo.modules.backgroundservice.InternalTriggerReceiver',
        'android:enabled': 'true',
        'android:exported': 'false',
      },
      'intent-filter': [
        {
          action: [
            { $: { 'android:name': 'expo.modules.backgroundservice.WIFI' } },
            { $: { 'android:name': 'expo.modules.backgroundservice.WIFI_DEBOUNCE' } },
            { $: { 'android:name': 'expo.modules.backgroundservice.INTERVAL' } },
            { $: { 'android:name': 'expo.modules.backgroundservice.BLE_RETRY' } },
            { $: { 'android:name': 'expo.modules.backgroundservice.WIDGET' } },
          ],
        },
      ],
    });

    if (!mainApplication.activity) mainApplication.activity = [];
    upsert(mainApplication.activity, 'expo.modules.backgroundservice.PopupActivity', {
      $: {
        'android:name': 'expo.modules.backgroundservice.PopupActivity',
        'android:exported': 'false',
        'android:excludeFromRecents': 'true',
        'android:launchMode': 'singleTask',
        'android:theme': '@android:style/Theme.DeviceDefault.Dialog',
      },
    });

    return config;
  });
};
