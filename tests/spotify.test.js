const test = require('node:test');
const assert = require('node:assert');
const { checkBridgePermission, FREE_CATEGORIES } = require('../src/bridge/permissions.ts');
const {
  MISSING_SPOTIFY_CLIENT_ID,
  BAD_SPOTIFY_CLIENT_ID,
  SPOTIFY_REDIRECT_URI,
  normalizeSpotifyClientId,
  normalizeSpotifySearch,
  resolveSpotifyClientId,
  shapeSpotifyClientId,
} = require('../src/services/spotifyClientId.ts');

const SETTINGS = 'a'.repeat(32);
const BRIDGE = 'b'.repeat(32);
const PREFILL = 'c'.repeat(32);

test('spotify permission is not free', () => {
  assert.ok(FREE_CATEGORIES.includes('media'));
  assert.ok(!FREE_CATEGORIES.includes('spotify'));
  assert.throws(() => checkBridgePermission('spotify', []), /Spotify nicht erlaubt/);
  assert.throws(() => checkBridgePermission('spotify', ['media']), /"spotify"/);
  assert.doesNotThrow(() => checkBridgePermission('spotify', ['spotify']));
  assert.doesNotThrow(() => checkBridgePermission('media', []));
});

test('client id precedence: settings, then mini-app, then prefill', () => {
  assert.deepStrictEqual(resolveSpotifyClientId({ settings: SETTINGS, bridge: BRIDGE, prefill: PREFILL }), {
    clientId: SETTINGS, source: 'settings',
  });
  assert.deepStrictEqual(resolveSpotifyClientId({ settings: '  ', bridge: BRIDGE, prefill: PREFILL }), {
    clientId: BRIDGE, source: 'bridge',
  });
  assert.deepStrictEqual(resolveSpotifyClientId({ settings: '', bridge: '', prefill: PREFILL }), {
    clientId: PREFILL, source: 'prefill',
  });
  assert.deepStrictEqual(resolveSpotifyClientId({}), { clientId: null, source: 'none' });
  const shaped = shapeSpotifyClientId({ settingsClientId: SETTINGS, bridgeClientId: BRIDGE, prefillClientId: '' });
  assert.strictEqual(shaped.source, 'settings');
  assert.strictEqual(shaped.clientId, SETTINGS);
  assert.strictEqual(shaped.bridgeClientId, BRIDGE);
});

test('client id format', () => {
  assert.strictEqual(normalizeSpotifyClientId('  ' + SETTINGS.toUpperCase() + ' '), SETTINGS.toUpperCase());
  assert.strictEqual(normalizeSpotifyClientId('   ', true), '');
  assert.throws(() => normalizeSpotifyClientId(''), new RegExp(MISSING_SPOTIFY_CLIENT_ID));
  assert.throws(() => normalizeSpotifyClientId('not-a-client-id'), new RegExp(BAD_SPOTIFY_CLIENT_ID));
  assert.strictEqual(SPOTIFY_REDIRECT_URI, 'everyapp://spotify-callback');
});

test('search request normalization', () => {
  assert.deepStrictEqual(normalizeSpotifySearch('  Beatles  '), {
    query: 'Beatles', types: ['track'], limit: 10, offset: 0,
  });
  assert.deepStrictEqual(normalizeSpotifySearch('abba', { types: ['Track', 'album'], limit: 80, offset: -4 }), {
    query: 'abba', types: ['track', 'album'], limit: 50, offset: 0,
  });
  assert.throws(() => normalizeSpotifySearch('   '), /Suchbegriff fehlt/);
  assert.throws(() => normalizeSpotifySearch('x', { types: ['audio-features'] }), /Unbekannter Spotify-Suchtyp: audio-features/);
  assert.throws(() => normalizeSpotifySearch('x'.repeat(201)), /zu lang/);
});
