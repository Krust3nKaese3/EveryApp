const test = require('node:test'); const assert = require('node:assert');
const { matches, deviceMatches } = require('../src/services/triggerMatching.ts');
const { checkBridgePermission } = require('../src/bridge/permissions.ts');

test('deviceMatches name/alias/address case-insensitive', () => {
  const d = { name: 'DENON AVR', alias: 'Wohnzimmer', address: 'AA:BB:CC:DD:EE:FF' };
  assert.ok(deviceMatches('wohnzimmer', d)); assert.ok(deviceMatches(' aa:bb:cc:dd:ee:ff ', d));
  assert.ok(!deviceMatches('', d)); assert.ok(!deviceMatches('x', undefined));
});
test('bluetooth trigger filter', () => {
  const ev = { type: 'bluetoothConnected', device: { name: 'Car' }, time: 0 };
  assert.ok(matches({ type: 'bluetoothConnected' }, ev));
  assert.ok(matches({ type: 'bluetoothConnected', nameOrAddress: 'car' }, ev));
  assert.ok(!matches({ type: 'bluetoothConnected', nameOrAddress: 'Kopfhörer' }, ev));
  assert.ok(!matches({ type: 'bluetoothDisconnected' }, ev));
});
test('quickTile / tileMenu / widgetAction', () => {
  assert.ok(matches({ type: 'quickTile', name: 'Denon' }, { type: 'quickTile', tile: { index: 1, name: 'denon ' }, time: 0 }));
  assert.ok(matches({ type: 'tileMenu' }, { type: 'tileMenu', id: 'vol', time: 0 }));
  assert.ok(matches({ type: 'tileMenu', id: 'vol' }, { type: 'tileMenu', id: 'vol', time: 0 }));
  assert.ok(!matches({ type: 'widgetAction', id: 'tv' }, { type: 'widgetAction', id: 'vol', time: 0 }));
});
test('wifiChanged by bssid or ssid', () => {
  const ev = { type: 'wifiChanged', wifi: { bssid: 'aa:bb:cc:00:00:01', ssid: 'FRITZ!Box' }, time: 0 };
  assert.ok(matches({ type: 'wifiChanged' }, ev));
  assert.ok(matches({ type: 'wifiChanged', bssid: 'AA:BB:CC:00:00:01' }, ev));
  assert.ok(matches({ type: 'wifiChanged', bssid: 'fritz!box' }, ev));
  assert.ok(!matches({ type: 'wifiChanged', bssid: 'aa:bb:cc:00:00:02' }, ev));
});
test('bleNotify address + short char uuid', () => {
  const ev = { type: 'bleNotify', ble: { address: 'AA:BB', charUuid: '0000ffe1-0000-1000-8000-00805f9b34fb' }, time: 0 };
  assert.ok(matches({ type: 'bleNotify' }, ev));
  assert.ok(matches({ type: 'bleNotify', address: 'aa:bb', charUuid: 'ffe1' }, ev));
  assert.ok(!matches({ type: 'bleNotify', address: 'cc:dd' }, ev));
});
test('bridge permissions', () => {
  assert.doesNotThrow(() => checkBridgePermission('clipboard', []));
  assert.doesNotThrow(() => checkBridgePermission('ble', ['ble']));
  assert.throws(() => checkBridgePermission('ble', ['bluetooth']), /BLE nicht erlaubt/);
  assert.throws(() => checkBridgePermission('http', []), /Permission denied: http/);
});
test('secret masking', () => {
  const { maskWith } = require('../src/services/secretMask.ts');
  assert.strictEqual(maskWith(['abc123', 'abc'], 'x abc123 y abc z'), 'x ••• y ••• z');
  assert.strictEqual(maskWith(['', 'ab'], 'ab'), 'ab');
  assert.ok(require('../src/bridge/permissions.ts').FREE_CATEGORIES.includes('secrets'));
});
test('net permission + crypto free', () => {
  assert.throws(() => checkBridgePermission('net', ['ble']), /Raw-Netzwerk nicht erlaubt/);
  assert.doesNotThrow(() => checkBridgePermission('net', ['net']));
  assert.doesNotThrow(() => checkBridgePermission('crypto', []));
});
test('popup/tiles permissions', () => {
  assert.throws(() => checkBridgePermission('popup', []), /"popup"/);
  assert.throws(() => checkBridgePermission('tiles', []), /"tiles"/);
  assert.doesNotThrow(() => checkBridgePermission('popup', ['popup']));
});
test('popup trigger matching', () => {
  const ev = { type: 'popup', popupId: 'a', event: 'h', time: 0 };
  assert.ok(matches({ type: 'popup' }, ev));
  assert.ok(matches({ type: 'popup', popupId: 'a', event: 'h' }, ev));
  assert.ok(!matches({ type: 'popup', popupId: 'b' }, ev));
  assert.ok(!matches({ type: 'popup', event: 'x' }, ev));
});
