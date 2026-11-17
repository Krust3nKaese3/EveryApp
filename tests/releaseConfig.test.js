const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function between(markdown, name) {
  const match = markdown.match(new RegExp(`<!-- store:${name} -->\\n([\\s\\S]*?)\\n<!-- /store:${name} -->`));
  assert.ok(match, name);
  return match[1];
}

test('play release config keeps an AAB profile and drops unused permissions', () => {
  const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
  const eas = JSON.parse(fs.readFileSync(path.join(root, 'eas.json'), 'utf8'));
  assert.strictEqual(app.expo.version, '1.0.0');
  assert.strictEqual(app.expo.android.versionCode, 1);
  const permissions = app.expo.android.permissions.map(String);
  for (const name of ['RECORD_AUDIO', 'ACCESS_FINE_LOCATION', 'ACCESS_BACKGROUND_LOCATION', 'REQUEST_IGNORE_BATTERY_OPTIMIZATIONS']) {
    assert.ok(!permissions.some((permission) => permission.includes(name)), name);
  }
  assert.ok(permissions.includes('FOREGROUND_SERVICE_SHORT_SERVICE'));
  const blocked = app.expo.android.blockedPermissions;
  assert.ok(blocked.includes('android.permission.RECORD_AUDIO'));
  assert.ok(blocked.includes('android.permission.ACCESS_BACKGROUND_LOCATION'));
  assert.ok(blocked.includes('com.google.android.gms.permission.AD_ID'));
  const buildProps = app.expo.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-build-properties');
  assert.strictEqual(buildProps[1].android.targetSdkVersion, 36);
  assert.strictEqual(eas.cli.appVersionSource, 'local');
  assert.strictEqual(eas.build.production.android.buildType, 'apk');
  assert.strictEqual(eas.build['production-play'].android.buildType, 'app-bundle');
  assert.strictEqual(eas.build['production-play'].autoIncrement, true);
  assert.strictEqual(eas.submit.production.android.track, 'internal');
  assert.strictEqual(eas.submit.production.android.serviceAccountKeyPath, '{{PLAY_SERVICE_ACCOUNT_JSON}}');
  assert.strictEqual(eas.submit['production-play'].android.track, 'internal');
});

test('store listing texts stay inside the Play character limits', () => {
  const listing = fs.readFileSync(path.join(root, 'docs/PLAY_STORE.md'), 'utf8');
  assert.ok(between(listing, 'short-de').length <= 80);
  assert.ok(between(listing, 'short-en').length <= 80);
  assert.ok(between(listing, 'long-de').length <= 4000);
  assert.ok(between(listing, 'long-en').length <= 4000);
  assert.ok(between(listing, 'short-de').length > 0);
  assert.ok(between(listing, 'long-en').includes('WebView'));
});
