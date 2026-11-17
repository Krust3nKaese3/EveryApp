const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { decideAdd, parseCatalog } = require('../src/services/storePolicy.ts');
const { bundledCatalogFile, bundledBlocklistFile } = require('../src/services/remoteLists.ts');
const { installedAppAccess } = require('../src/services/developerMode.ts');
const {
  installModeForPlatform,
  showsCuratedCatalog,
  showsLearningChrome,
  learningPaneHeights,
  iosBlockedCapability,
  assessBridgeCall,
  permissionsOfferedOnPlatform,
  selectSourceFiles,
  IOS_CAPABILITY_ERROR,
} = require('../src/services/iosPolicy.ts');

const catalog = bundledCatalogFile();
const blocklist = bundledBlocklistFile();
const foreign = 'https://github.com/example/not-in-catalog';
const own = 'https://github.com/Ada/my-miniapp';
const werwolf = 'https://github.com/Krust3nKaese3/WerwolfScrapp';
const root = path.join(__dirname, '..');

test('iOS is own-repos-only even if the android catalog flag and a remote file say otherwise', () => {
  const remote = {
    iosCatalog: true,
    mode: 'catalog',
    apps: catalog.apps,
  };
  assert.strictEqual(installModeForPlatform('ios', true), 'own-repos-only');
  assert.strictEqual(installModeForPlatform('ios', false), 'own-repos-only');
  assert.strictEqual(installModeForPlatform('android', false), 'open');
  assert.strictEqual(installModeForPlatform('android', true), 'catalog-only');
  assert.strictEqual(showsCuratedCatalog('ios'), false);
  assert.strictEqual(showsCuratedCatalog('android'), true);
  assert.strictEqual(showsLearningChrome('ios'), true);
  assert.strictEqual(showsLearningChrome('android'), false);
  assert.strictEqual(iosBlockedCapability('ios', 'net', remote), IOS_CAPABILITY_ERROR);
  assert.strictEqual(iosBlockedCapability('android', 'net', remote), null);
});

test('iOS rejects catalog entries and foreign repos and accepts an owned repo', () => {
  const remote = parseCatalog({
    allowCatalogOnIos: true,
    apps: [
      { name: 'Fremd', repoUrl: foreign, description: 'x', ageRating: 'ab 0' },
      { name: 'Eigen', repoUrl: own, description: 'x', ageRating: 'ab 0' },
      ...catalog.apps,
    ],
  });
  const ios = { catalog: remote, blocklist, catalogOnly: true, ownReposOnly: true, developerMode: true };
  assert.strictEqual(decideAdd(werwolf, { ...ios, signedInLogin: 'Ada' }).type, 'reject');
  assert.strictEqual(decideAdd(foreign, { ...ios, signedInLogin: 'Ada' }).type, 'reject');
  assert.ok(decideAdd(foreign, { ...ios, signedInLogin: 'Ada' }).message.includes('nicht zum angemeldeten'));
  assert.strictEqual(decideAdd(foreign, { ...ios, signedInLogin: null }).type, 'reject');
  assert.ok(decideAdd(own, { ...ios, signedInLogin: null }).message.includes('Melde dich'));
  const accepted = decideAdd(own, { ...ios, developerMode: false, signedInLogin: 'Ada' });
  assert.strictEqual(accepted.type, 'install-own');
  assert.strictEqual(decideAdd(werwolf, { ...ios, signedInLogin: 'Krust3nKaese3' }).type, 'install-own');
  const androidCatalog = decideAdd(werwolf, { catalog, blocklist, catalogOnly: false, signedInLogin: null });
  assert.strictEqual(androidCatalog.type, 'install');
  assert.strictEqual(androidCatalog.origin, 'catalog');
  const blocked = decideAdd(own, {
    ...ios,
    signedInLogin: 'Ada',
    blocklist: parseBlocklist(own),
  });
  assert.strictEqual(blocked.type, 'blocked');
});

function parseBlocklist(repoUrl) {
  return { entries: [{ repo: repoUrl, reason: 'Gesperrt' }] };
}

test('iOS will not open a catalog install just because the remote list contains it', () => {
  const catalogApp = { origin: 'catalog', ownerLogin: 'Ada', repoUrl: own };
  const denied = installedAppAccess(catalogApp, {
    catalogOnly: true,
    ownReposOnly: true,
    developerMode: true,
    signedInLogin: 'Ada',
    inCatalog: true,
  });
  assert.strictEqual(denied.allowed, false);
  const ownApp = { origin: 'developer', ownerLogin: 'Ada', repoUrl: own };
  assert.deepStrictEqual(installedAppAccess(ownApp, {
    catalogOnly: false,
    ownReposOnly: true,
    developerMode: false,
    signedInLogin: 'Ada',
    inCatalog: true,
  }), { allowed: true, verifyOwnership: true });
  const android = installedAppAccess(catalogApp, {
    catalogOnly: false,
    developerMode: false,
    signedInLogin: null,
    inCatalog: true,
  });
  assert.deepStrictEqual(android, { allowed: true, verifyOwnership: false });
});

test('iOS bridge allows the learning set and rejects sockets, macros, tiles and popups', () => {
  for (const method of ['storage.set', 'http.fetch', 'http.request', 'sensors.getAccelerometer', 'ble.scan', 'vibration.vibrate']) {
    assert.strictEqual(assessBridgeCall('ios', method), null, method);
    assert.strictEqual(assessBridgeCall('android', method), null, method);
  }
  for (const method of [
    'net.tcpOpen',
    'net.udpSend',
    'net.tuyaStatus',
    'background.registerTask',
    'tiles.set',
    'popup.open',
    'bluetooth.scan',
    'notifications.schedule',
    'multiplayer.host',
  ]) {
    const message = assessBridgeCall('ios', method);
    assert.strictEqual(message, IOS_CAPABILITY_ERROR, method);
    assert.ok(message.includes('nicht verfügbar'));
    assert.strictEqual(assessBridgeCall('android', method), null, method);
  }
  assert.strictEqual(iosBlockedCapability('ios', 'events'), null);
  assert.strictEqual(iosBlockedCapability('ios', 'background'), IOS_CAPABILITY_ERROR);
  const offered = permissionsOfferedOnPlatform('ios', ['storage', 'net', 'background', 'ble', 'popup', 'vibration']);
  assert.deepStrictEqual(offered, ['storage', 'ble', 'vibration']);
  assert.deepStrictEqual(permissionsOfferedOnPlatform('android', ['storage', 'net']), ['storage', 'net']);
});

test('source view keeps entry HTML and JS and the code pane stays at most 80 percent', () => {
  assert.deepStrictEqual(
    selectSourceFiles(['logo.png', 'app.js', 'index.html', '../secret.js', 'src/game.mjs', 'openscr.json'], 'index.html'),
    ['index.html', 'app.js', 'src/game.mjs'],
  );
  const panes = learningPaneHeights(1000);
  assert.strictEqual(panes.code, 800);
  assert.strictEqual(panes.bar, 200);
  assert.ok(panes.code <= 1000 * 0.8);
  const odd = learningPaneHeights(801);
  assert.ok(odd.code <= 801 * 0.8);
  assert.strictEqual(odd.bar + odd.code, 801);
  const modal = fs.readFileSync(path.join(root, 'src/components/SourceCodeModal.tsx'), 'utf8');
  assert.match(modal, /Nur lesen/);
  assert.match(modal, /selectable/);
  assert.doesNotMatch(modal, /TextInput/);
  const runner = fs.readFileSync(path.join(root, 'src/components/MiniAppRunner.tsx'), 'utf8');
  assert.match(runner, /Entwicklungsumgebung · eigener Code/);
  assert.match(runner, /learningPaneHeights/);
  assert.match(runner, /maxHeight: '80%'/);
  const home = fs.readFileSync(path.join(root, 'src/screens/HomeScreen.tsx'), 'utf8');
  assert.match(home, /showCatalog \?/);
  assert.match(home, /Dein erstes OpenScrapp/);
  const handler = fs.readFileSync(path.join(root, 'src/bridge/BridgeMessageHandler.ts'), 'utf8');
  assert.match(handler, /iosBlockedCapability\(Platform\.OS/);
  const tasks = fs.readFileSync(path.join(root, 'src/services/BackgroundTasks.ts'), 'utf8');
  assert.match(tasks, /isIosLearningPlatform\(Platform\.OS\)/);
});
