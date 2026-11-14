const test = require('node:test');
const assert = require('node:assert');
const { decideAdd } = require('../src/services/storePolicy.ts');
const { bundledCatalogFile, bundledBlocklistFile } = require('../src/services/remoteLists.ts');
const {
  ownsRepo,
  urlOwnedBy,
  parseAuthenticatedUser,
  parseRepoOwner,
  parseDeviceStart,
  parseDevicePoll,
  normalizeAccessToken,
  configuredGithubClientId,
  resolveGithubClientId,
  DEFAULT_GITHUB_CLIENT_ID,
  installedAppAccess,
  OWN_REPO_MESSAGE,
} = require('../src/services/developerMode.ts');

const catalog = bundledCatalogFile();
const blocklist = bundledBlocklistFile();
const foreign = 'https://github.com/example/not-in-catalog';
const own = 'https://github.com/Ada/my-miniapp';

test('flag off keeps free adds even if developer mode is passed in', () => {
  const decision = decideAdd(foreign, {
    catalog,
    blocklist,
    catalogOnly: false,
    developerMode: true,
    signedInLogin: 'Ada',
  });
  assert.strictEqual(decision.type, 'confirm-foreign');
  assert.ok(!('origin' in decision));
});

test('catalog entries install without a GitHub session on a catalog-only build', () => {
  const url = 'https://github.com/Krust3nKaese3/evryWerwolf';
  const decision = decideAdd(url, {
    catalog,
    blocklist,
    catalogOnly: true,
    developerMode: false,
    signedInLogin: null,
  });
  assert.strictEqual(decision.type, 'install');
  assert.strictEqual(decision.origin, 'catalog');
});

test('catalog-only developer mode accepts only the signed-in owner', () => {
  const base = { catalog, blocklist, catalogOnly: true, developerMode: true };
  assert.strictEqual(decideAdd(foreign, { ...base, signedInLogin: null }).type, 'reject');
  assert.strictEqual(decideAdd(foreign, { ...base, signedInLogin: 'Ada' }).type, 'reject');
  assert.ok(decideAdd(foreign, { ...base, signedInLogin: 'Ada' }).message.includes('nicht zum angemeldeten'));
  assert.notStrictEqual(decideAdd(own, { ...base, signedInLogin: 'Ada' }).type, 'confirm-foreign');
  assert.strictEqual(decideAdd(own, { ...base, signedInLogin: 'Ada' }).type, 'install-own');
  assert.strictEqual(decideAdd('https://github.com/ada/my-miniapp.git', { ...base, signedInLogin: 'ADA' }).type, 'install-own');
  assert.strictEqual(decideAdd('https://github.com/ada-org/my-miniapp', { ...base, signedInLogin: 'ada' }).type, 'reject');
  const off = decideAdd(own, { catalog, blocklist, catalogOnly: true, developerMode: false, signedInLogin: 'Ada' });
  assert.strictEqual(off.type, 'reject');
});

test('ownership is the authenticated login, not a collaborator or an org', () => {
  assert.strictEqual(ownsRepo('Ada', 'ada'), true);
  assert.strictEqual(ownsRepo('ada', 'ada-org'), false);
  assert.strictEqual(ownsRepo('', 'ada'), false);
  assert.strictEqual(ownsRepo('ada', ''), false);
  assert.strictEqual(urlOwnedBy('ada', 'https://github.com/Ada/My-Repo/'), true);
  assert.strictEqual(urlOwnedBy('ada', 'https://github.com/other/My-Repo'), false);
  assert.strictEqual(parseAuthenticatedUser({ login: 'Ada-1' }), 'Ada-1');
  assert.throws(() => parseAuthenticatedUser({ login: '-ada' }), /Benutzer/);
  assert.strictEqual(parseRepoOwner({ owner: { login: 'Ada' } }), 'Ada');
  assert.throws(() => parseRepoOwner({ owner: {} }), /Besitzer/);
});

test('signing out or a different login disables developer-mode apps', () => {
  const app = { origin: 'developer', ownerLogin: 'Ada', repoUrl: own };
  const open = { catalogOnly: true, developerMode: true, signedInLogin: 'Ada', inCatalog: false };
  assert.deepStrictEqual(installedAppAccess(app, open), { allowed: true, verifyOwnership: true });
  const signedOut = installedAppAccess(app, { ...open, signedInLogin: null });
  assert.strictEqual(signedOut.allowed, false);
  const other = installedAppAccess(app, { ...open, signedInLogin: 'Bob' });
  assert.strictEqual(other.allowed, false);
  assert.ok(other.reason.includes(OWN_REPO_MESSAGE.slice(0, 20)));
  const modeOff = installedAppAccess(app, { ...open, developerMode: false });
  assert.strictEqual(modeOff.allowed, false);
  const catalogApp = { origin: 'catalog', repoUrl: 'https://github.com/Krust3nKaese3/evryWerwolf' };
  assert.deepStrictEqual(
    installedAppAccess(catalogApp, { catalogOnly: true, developerMode: false, signedInLogin: null, inCatalog: true }),
    { allowed: true, verifyOwnership: false },
  );
  const freeOnIos = installedAppAccess(
    { origin: 'free', repoUrl: foreign },
    { catalogOnly: true, developerMode: true, signedInLogin: 'Ada', inCatalog: false },
  );
  assert.strictEqual(freeOnIos.allowed, false);
  const android = installedAppAccess(app, { catalogOnly: false, developerMode: false, signedInLogin: null, inCatalog: false });
  assert.deepStrictEqual(android, { allowed: true, verifyOwnership: false });
});

test('device-flow responses never surface the token in an error', () => {
  const start = parseDeviceStart({
    device_code: 'device',
    user_code: 'WDJB-MJHT',
    verification_uri: 'https://github.com/login/device',
    expires_in: 900,
    interval: 5,
  });
  assert.strictEqual(start.userCode, 'WDJB-MJHT');
  assert.strictEqual(start.interval, 5);
  assert.throws(() => parseDeviceStart({ verification_uri: 'https://evil.example/device', device_code: 'd', user_code: 'C' }), /Gerätecode/);
  assert.strictEqual(parseDevicePoll({ error: 'authorization_pending' }).status, 'pending');
  const slow = parseDevicePoll({ error: 'slow_down', interval: 3 });
  assert.strictEqual(slow.status, 'slow_down');
  assert.strictEqual(slow.interval, 5);
  const ok = parseDevicePoll({ access_token: 'gho_exampletokenvalue123456' });
  assert.strictEqual(ok.status, 'success');
  assert.strictEqual(ok.accessToken, 'gho_exampletokenvalue123456');
  const denied = parseDevicePoll({ error: 'access_denied', error_description: 'gho_secret' });
  assert.strictEqual(denied.status, 'denied');
  assert.ok(!denied.message.includes('gho_'));
  assert.strictEqual(configuredGithubClientId(''), '');
  assert.strictEqual(configuredGithubClientId('BITTE AUSFÜLLEN'), '');
  assert.strictEqual(configuredGithubClientId('Iv1.abc'), 'Iv1.abc');
  assert.strictEqual(DEFAULT_GITHUB_CLIENT_ID, 'Ov23liZBUKxpmryUJW1a');
  assert.strictEqual(resolveGithubClientId(undefined), DEFAULT_GITHUB_CLIENT_ID);
  assert.strictEqual(resolveGithubClientId(''), DEFAULT_GITHUB_CLIENT_ID);
  assert.strictEqual(resolveGithubClientId('BITTE AUSFÜLLEN'), DEFAULT_GITHUB_CLIENT_ID);
  assert.strictEqual(resolveGithubClientId('Iv1.abc'), 'Iv1.abc');
  assert.throws(() => normalizeAccessToken('short'), /Format/);
  assert.throws(() => normalizeAccessToken('https://github.com/login/device-code-value'), /Format/);
  assert.strictEqual(normalizeAccessToken('  github_pat_0123456789abcdef  '), 'github_pat_0123456789abcdef');
});
