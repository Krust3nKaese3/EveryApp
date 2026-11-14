const test = require('node:test'); const assert = require('node:assert');
const P = require('../src/services/servicePolicy.ts');

test('ble backoff caps at 5 minutes and stops after 10', () => {
  assert.strictEqual(P.bleBackoffMs(1), 2000);
  assert.strictEqual(P.bleBackoffMs(2), 4000);
  assert.strictEqual(P.bleBackoffMs(9), P.BLE_BACKOFF_CAP_MS);
  assert.strictEqual(P.BLE_BACKOFF_CAP_MS, 300000);
  assert.strictEqual(P.bleShouldRetry(9), true);
  assert.strictEqual(P.bleShouldRetry(10), false);
});

test('foreground service ignores wifi', () => {
  assert.deepStrictEqual(P.needsForegroundService({ interval: false, dueOrConnectedBle: 0 }), { needed: false, reasons: [] });
  assert.deepStrictEqual(P.needsForegroundService({ interval: true, dueOrConnectedBle: 0 }).reasons, ['interval']);
  assert.deepStrictEqual(P.needsForegroundService({ interval: false, dueOrConnectedBle: 1 }).reasons, ['bleNotify']);
  assert.deepStrictEqual(P.needsForegroundService({ interval: false, dueOrConnectedBle: 0, hosting: true }).reasons, ['spielraum']);
  const stop = P.serviceDecisionLine('boot', { interval: false, dueOrConnectedBle: 0, waitingBle: 1, exhaustedBle: 2, wifi: true }, true);
  assert.match(stop, /^DIENST STOPP \|/);
  assert.match(stop, /WLAN ohne Vordergrunddienst/);
});

test('wifi duplicates never emit, changes debounce', () => {
  const seed = P.decideWifi(P.initialWifiState(), { ssid: 'Home', bssid: 'aa' }, 1000);
  assert.strictEqual(seed.type, 'seed');
  const dup = P.decideWifi(seed.state, { ssid: 'Home', bssid: 'aa' }, 2000);
  assert.strictEqual(dup.type, 'ignore');
  assert.match(dup.reason, /doppelter Callback/);
  const changed = P.decideWifi(seed.state, { ssid: 'Cafe', bssid: 'bb' }, 5000);
  assert.strictEqual(changed.type, 'emit');
  const again = P.decideWifi(changed.state, { ssid: 'Work', bssid: 'cc' }, 6000);
  assert.strictEqual(again.type, 'schedule');
  assert.strictEqual(again.at, 5000 + P.WIFI_DEBOUNCE_MS);
  const alarm = P.decideWifiAlarm(again.state, 5000 + P.WIFI_DEBOUNCE_MS);
  assert.strictEqual(alarm.type, 'emit');
  assert.strictEqual(alarm.identity.ssid, 'Work');
});
