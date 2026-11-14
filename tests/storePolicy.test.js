const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const {
  decideAdd,
  parseCatalog,
  parseBlocklist,
  blockReasonFor,
  reportMailto,
  REPORT_EMAIL,
  FOREIGN_WARNING_MESSAGE,
  isEnabledFlag,
  mergeUpdatedApp,
  catalogEntryFor,
} = require('../src/services/storePolicy.ts');
const { bundledCatalogFile, bundledBlocklistFile } = require('../src/services/remoteLists.ts');
const {
  commitApiUrl,
  githubRawUrlAtRef,
  parseCommitSha,
  updateStatus,
  versionLine,
} = require('../src/services/githubPin.ts');
const {
  keysOwnedByApp,
  purgeHostRecords,
  storageKeysTouchedByUpdate,
  miniAppStoragePrefix,
} = require('../src/services/appPurge.ts');
const { PRIVACY_MD, TERMS_MD } = require('../src/legal/documents.ts');

const catalog = bundledCatalogFile();
const blocklist = bundledBlocklistFile();
const sha = 'a'.repeat(40);

test('bundled catalog lists the four curated repos', () => {
  for (const url of [
    'https://github.com/Krust3nKaese3/evryWerwolf',
    'https://github.com/Krust3nKaese3/evryGuessTheSong',
    'https://github.com/Krust3nKaese3/EveryRollDice',
    'https://github.com/Krust3nKaese3/EveryMacro',
  ]) {
    const entry = catalogEntryFor(url, catalog);
    assert.ok(entry, url);
    assert.ok(entry.name && entry.description && entry.ageRating);
    assert.strictEqual(decideAdd(url, { catalog, blocklist, catalogOnly: false }).type, 'install');
    assert.strictEqual(decideAdd(url + '.git', { catalog, blocklist, catalogOnly: true }).type, 'install');
  }
});

test('foreign repos need an explicit warning unless catalog-only rejects them', () => {
  const foreign = 'https://github.com/example/not-in-catalog';
  const decision = decideAdd(foreign, { catalog, blocklist, catalogOnly: false });
  assert.strictEqual(decision.type, 'confirm-foreign');
  assert.ok(decision.message.includes('Nur vertrauenswürdige Quellen hinzufügen…'));
  assert.ok(FOREIGN_WARNING_MESSAGE.includes('Dateisystem'));
  const locked = decideAdd(foreign, { catalog, blocklist, catalogOnly: true });
  assert.strictEqual(locked.type, 'reject');
  assert.strictEqual(decideAdd('not a url', { catalog, blocklist, catalogOnly: false }).type, 'reject');
});

test('blocklist matches app id or repo and disables install', () => {
  const list = parseBlocklist({
    entries: [
      { appId: 'github_com_example_bad', reason: 'Schadcode' },
      { repo: 'https://github.com/example/other', reason: 'Rechte verletzt' },
    ],
  });
  assert.strictEqual(blockReasonFor('github_com_example_bad', 'https://github.com/safe/app', list), 'Schadcode');
  assert.strictEqual(blockReasonFor('other-id', 'https://github.com/example/other.git', list), 'Rechte verletzt');
  assert.strictEqual(blockReasonFor('nope', 'https://github.com/safe/app', list), null);
  const blocked = decideAdd('https://github.com/example/other', { catalog, blocklist: list, catalogOnly: false });
  assert.strictEqual(blocked.type, 'blocked');
  assert.strictEqual(parseBlocklist({ entries: [] }).entries.length, 0);
  assert.deepStrictEqual(parseCatalog({ apps: [{ name: 'x' }] }), { apps: [] });
});

test('report mail is prefilled to the documented address', () => {
  const url = reportMailto({ name: 'Werwolf', repoUrl: 'https://github.com/Krust3nKaese3/evryWerwolf', id: 'abc', version: '1.0.0', commitSha: sha });
  assert.ok(url.startsWith(`mailto:${REPORT_EMAIL}?`));
  assert.ok(decodeURIComponent(url).includes('Werwolf'));
  assert.ok(decodeURIComponent(url).includes(sha));
});

test('catalog-only flag values', () => {
  assert.strictEqual(isEnabledFlag('1'), true);
  assert.strictEqual(isEnabledFlag('true'), true);
  assert.strictEqual(isEnabledFlag('yes'), true);
  assert.strictEqual(isEnabledFlag('0'), false);
  assert.strictEqual(isEnabledFlag(undefined), false);
});

test('update keeps identity and does not select storage keys', () => {
  const previous = {
    id: 'github_com_a_b',
    repoUrl: 'https://github.com/a/b',
    manifest: { name: 'B', version: '1.0.0', description: '', entrypoint: 'index.html', permissions: ['storage'] },
    localPath: 'file:///old/',
    addedAt: 10,
    folderId: 'folder-1',
    commitSha: 'b'.repeat(40),
    origin: 'developer',
    ownerLogin: 'Ada',
  };
  const fresh = { ...previous, addedAt: 99, folderId: null, localPath: 'file:///new/', commitSha: sha, origin: 'free', ownerLogin: 'other', manifest: { ...previous.manifest, version: '1.1.0' } };
  const merged = mergeUpdatedApp(previous, fresh);
  assert.strictEqual(merged.id, previous.id);
  assert.strictEqual(merged.addedAt, 10);
  assert.strictEqual(merged.folderId, 'folder-1');
  assert.strictEqual(merged.commitSha, sha);
  assert.strictEqual(merged.manifest.version, '1.1.0');
  assert.strictEqual(merged.origin, 'developer');
  assert.strictEqual(merged.ownerLogin, 'Ada');
  assert.deepStrictEqual(storageKeysTouchedByUpdate(), []);
  assert.ok(versionLine('1.1.0', sha, sha).includes(sha.slice(0, 7)));
  assert.strictEqual(updateStatus(sha, sha), 'current');
  assert.strictEqual(updateStatus('c'.repeat(40), sha), 'available');
  assert.strictEqual(updateStatus(undefined, sha), 'available');
});

test('delete selects only this app storage prefix', () => {
  const shortId = 'github_com_a_b';
  const longId = 'github_com_a_b_extra';
  const keys = [
    miniAppStoragePrefix(shortId) + 'score',
    miniAppStoragePrefix(longId) + 'score',
    `@secret_${shortId}_token`,
    `@secret_index_${shortId}`,
    '@everyapp_apps',
    '@miniapp_other_score',
  ];
  const owned = keysOwnedByApp(keys, shortId, [shortId, longId, 'other']);
  assert.deepStrictEqual(owned.sort(), [
    `@secret_${shortId}_token`,
    `@secret_index_${shortId}`,
    miniAppStoragePrefix(shortId) + 'score',
  ].sort());
  const host = purgeHostRecords({
    permissions: { [shortId]: ['storage'], keep: ['http'] },
    denied: { [shortId]: ['spotify'] },
    backgroundApps: [shortId, 'keep'],
    tasks: { [shortId]: { t: {} }, keep: {} },
    ui: { tiles: { 1: { appId: shortId }, 2: { appId: 'keep' } }, widgets: { w: { appId: shortId } } },
    lockAsked: { [shortId]: true, keep: true },
  }, shortId);
  assert.deepStrictEqual(host.permissions, { keep: ['http'] });
  assert.deepStrictEqual(host.denied, {});
  assert.deepStrictEqual(host.backgroundApps, ['keep']);
  assert.deepStrictEqual(host.tasks, { keep: {} });
  assert.deepStrictEqual(host.ui.tiles, { 2: { appId: 'keep' } });
  assert.deepStrictEqual(host.ui.widgets, {});
  assert.deepStrictEqual(host.lockAsked, { keep: true });
});

test('commit pin bypasses the cached main branch URL', () => {
  assert.strictEqual(commitApiUrl('Krust3nKaese3', 'evryWerwolf'), 'https://api.github.com/repos/Krust3nKaese3/evryWerwolf/commits/main');
  const raw = githubRawUrlAtRef('o', 'r', sha, 'assets/my song.mp3');
  assert.strictEqual(raw, `https://raw.githubusercontent.com/o/r/${sha}/assets/my%20song.mp3`);
  assert.ok(!raw.includes('/main/'));
  assert.strictEqual(parseCommitSha({ sha }), sha);
  assert.throws(() => parseCommitSha({ sha: 'main' }), /Commit-SHA/);
});

test('legal documents in the app match the markdown files', () => {
  const root = path.join(__dirname, '..');
  assert.strictEqual(PRIVACY_MD, fs.readFileSync(path.join(root, 'PRIVACY.md'), 'utf8'));
  assert.strictEqual(TERMS_MD, fs.readFileSync(path.join(root, 'TERMS.md'), 'utf8'));
  assert.ok(PRIVACY_MD.includes('[BITTE AUSFÜLLEN: Anschrift'));
  assert.ok(PRIVACY_MD.includes('manueldiliberto1@gmail.com'));
  assert.ok(PRIVACY_MD.includes('keinen eigenen Server'));
  assert.ok(TERMS_MD.includes('[BITTE AUSFÜLLEN: Anschrift'));
  assert.ok(TERMS_MD.includes('EXPO_PUBLIC_CATALOG_ONLY'));
});
