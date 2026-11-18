const { withEntitlementsPlist } = require('@expo/config-plugins');

// iOS-only: OpenScr on iOS never registers for or receives push notifications,
// so the Push Notifications capability (aps-environment entitlement) is removed.
// Android is not touched. List this plugin BEFORE "expo-notifications" in app.json
// (Expo runs mods of later plugins first, so it then runs after expo-notifications added the entitlement).
module.exports = function withoutIosPush(config) {
  return withEntitlementsPlist(config, (config) => {
    delete config.modResults['aps-environment'];
    return config;
  });
};
