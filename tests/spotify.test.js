const test = require('node:test');
const assert = require('node:assert');
const { checkBridgePermission, FREE_CATEGORIES } = require('../src/bridge/permissions.ts');
const {
  MISSING_SPOTIFY_CLIENT_ID,
  BAD_SPOTIFY_CLIENT_ID,
  SPOTIFY_REDIRECT_URI,
  SPOTIFY_DASHBOARD_URL,
  DEVELOPMENT_ANDROID_PACKAGE,
  PRODUCTION_ANDROID_PACKAGE,
  DEVELOPMENT_DEBUG_SHA1,
  normalizeSpotifyClientId,
  normalizeSpotifySearch,
  resolveSpotifyClientId,
  shapeSpotifyClientId,
  androidPackageFromExpoConstants,
  spotifyAndroidDashboardTarget,
} = require('../src/services/spotifyClientId.ts');

const SETTINGS = 'a'.repeat(32);
const BRIDGE = 'b'.repeat(32);
const PREFILL = 'c'.repeat(32);

test('spotify and media need a per-app grant', () => {
  assert.ok(!FREE_CATEGORIES.includes('media'));
  assert.ok(!FREE_CATEGORIES.includes('spotify'));
  assert.throws(() => checkBridgePermission('spotify', []), /Spotify nicht erlaubt/);
  assert.throws(() => checkBridgePermission('spotify', ['media']), /"spotify"/);
  assert.doesNotThrow(() => checkBridgePermission('spotify', ['spotify']));
  assert.throws(() => checkBridgePermission('media', []), /Permission denied: media/);
  assert.doesNotThrow(() => checkBridgePermission('media', ['media']));
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

test('dashboard package and sha-1 follow the running variant', () => {
  assert.strictEqual(SPOTIFY_DASHBOARD_URL, 'https://developer.spotify.com/dashboard');
  assert.strictEqual(DEVELOPMENT_ANDROID_PACKAGE, 'com.everyapp.container.dev');
  assert.strictEqual(PRODUCTION_ANDROID_PACKAGE, 'com.everyapp.container');
  assert.strictEqual(DEVELOPMENT_DEBUG_SHA1, '5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25');

  const dev = spotifyAndroidDashboardTarget(DEVELOPMENT_ANDROID_PACKAGE);
  assert.strictEqual(dev.variant, 'development');
  assert.strictEqual(dev.appName, 'SrvEveryApp');
  assert.strictEqual(dev.packageName, DEVELOPMENT_ANDROID_PACKAGE);
  assert.strictEqual(dev.sha1, DEVELOPMENT_DEBUG_SHA1);

  const prod = spotifyAndroidDashboardTarget(PRODUCTION_ANDROID_PACKAGE);
  assert.strictEqual(prod.variant, 'production');
  assert.strictEqual(prod.appName, 'EveryApp');
  assert.strictEqual(prod.packageName, PRODUCTION_ANDROID_PACKAGE);
  assert.strictEqual(prod.sha1, null);

  const unknown = spotifyAndroidDashboardTarget('com.example.other');
  assert.strictEqual(unknown.variant, 'unknown');
  assert.strictEqual(unknown.packageName, 'com.example.other');
  assert.strictEqual(unknown.sha1, null);
  assert.strictEqual(spotifyAndroidDashboardTarget('  ').sha1, null);
  assert.strictEqual(spotifyAndroidDashboardTarget(null).packageName, null);

  assert.strictEqual(
    androidPackageFromExpoConstants({ expoConfig: { android: { package: DEVELOPMENT_ANDROID_PACKAGE } } }),
    DEVELOPMENT_ANDROID_PACKAGE,
  );
  assert.strictEqual(
    androidPackageFromExpoConstants({
      manifest2: { extra: { expoClient: { android: { package: PRODUCTION_ANDROID_PACKAGE } } } },
    }),
    PRODUCTION_ANDROID_PACKAGE,
  );
  assert.strictEqual(androidPackageFromExpoConstants({}), null);
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
