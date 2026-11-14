const test = require('node:test');
const assert = require('node:assert');
const {
  bridgeMethod,
  bridgeMethodNames,
  parseBridgeMessage,
  takeRate,
  clearRate,
  assertStorageKey,
  assertStorageValue,
  storageRecordKey,
  STORAGE_LIMITS,
  RATE_LIMIT_ERROR,
} = require('../src/bridge/allowlist.ts');

test('unknown methods and messages are rejected', () => {
  assert.strictEqual(bridgeMethod('network.requestLocation'), null);
  assert.strictEqual(bridgeMethod('contacts.list'), null);
  assert.strictEqual(bridgeMethod('filesystem.read'), null);
  assert.strictEqual(bridgeMethod('location.get'), null);
  assert.ok(bridgeMethod('storage.set'));
  assert.ok(bridgeMethod('spotify.play'));
  const names = bridgeMethodNames().join(' ');
  assert.ok(!/requestLocation|contacts|filesystem|location\./.test(names));
  assert.strictEqual(parseBridgeMessage(null).kind, 'reject');
  assert.strictEqual(parseBridgeMessage({ type: 'hack' }).kind, 'reject');
  assert.strictEqual(parseBridgeMessage({ method: 'nope', args: [] }).method, 'nope');
  assert.strictEqual(parseBridgeMessage({ type: 'event', event: 'clipboard.stolen', action: 'on' }).kind, 'reject');
  assert.strictEqual(parseBridgeMessage({ type: 'event', event: 'spotify.player', action: 'on' }).kind, 'event');
});

test('storage keys stay namespaced and values are size limited', () => {
  assert.strictEqual(storageRecordKey('app', 'score'), '@miniapp_app_score');
  assert.throws(() => assertStorageKey(''), /128/);
  assert.throws(() => assertStorageKey('a'.repeat(STORAGE_LIMITS.maxKeyChars + 1)), /128/);
  assert.throws(() => assertStorageValue('x'.repeat(STORAGE_LIMITS.maxValueBytes + 1)), /gro/);
  assert.strictEqual(assertStorageValue('ok'), 'ok');
  const spec = bridgeMethod('storage.set');
  assert.throws(() => spec.validate(['score', 1]), /Text/);
  assert.deepStrictEqual(spec.validate(['score', '1']), ['score', '1']);
  assert.throws(() => bridgeMethod('http.fetch').validate(['file:///etc/passwd']), /http/);
  assert.throws(() => bridgeMethod('http.request').validate([{ url: 'content://contacts' }]), /http/);
  assert.strictEqual(bridgeMethod('http.fetch').validate(['https://example.com/a'])[0], 'https://example.com/a');
});

test('rate limit trips and then recovers', () => {
  clearRate('app-rate');
  const rule = { max: 2, windowMs: 1000 };
  assert.strictEqual(takeRate('app-rate', 'bluetooth.scan', rule, 0), true);
  assert.strictEqual(takeRate('app-rate', 'bluetooth.scan', rule, 10), true);
  assert.strictEqual(takeRate('app-rate', 'bluetooth.scan', rule, 20), false);
  assert.strictEqual(takeRate('app-rate', 'bluetooth.scan', rule, 2000), true);
  assert.ok(RATE_LIMIT_ERROR.includes('warten'));
  clearRate('app-rate');
});
