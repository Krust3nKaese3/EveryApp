// react-native-ble-manager is a React Native module (autolinked), not an Android Service.
// Registering it as <service> breaks lintVitalRelease, so this plugin intentionally adds nothing.
// BLE permissions are declared on the native modules (neverForLocation, maxSdk 30).
module.exports = function withBleManager(config) {
  return config;
};
