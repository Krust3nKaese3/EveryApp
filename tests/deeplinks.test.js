const test = require('node:test'); const assert = require('node:assert');
const D = require('../src/services/deepLinks.ts');
test('parse everyapp link', () => {
  const l = D.parseDeepLink('everyapp://EveryMacro/import?url=' + encodeURIComponent('https://x.y/a.macro.js?b=1'));
  assert.strictEqual(l.miniapp, 'everymacro'); assert.strictEqual(l.path, 'import'); assert.strictEqual(l.params.url, 'https://x.y/a.macro.js?b=1');
  assert.strictEqual(D.parseDeepLink('exp+everyapp://everymacro/import?gist=abc').params.gist, 'abc');
  assert.strictEqual(D.parseDeepLink('https://x/y'), null);
  assert.strictEqual(D.parseDeepLink('exp+everyapp://expo-development-client/?url=x'), null);
});
test('match mini-app', () => {
  const l = D.parseDeepLink('everyapp://everymacro/import');
  assert.ok(D.matchesMiniApp(l, { id: 'z', repoUrl: 'https://github.com/K/EveryMacro.git', manifest: { name: 'Other' } }));
  assert.ok(D.matchesMiniApp(l, { id: 'z', manifest: { name: 'Every Macro' } }));
  assert.ok(!D.matchesMiniApp(l, { id: 'z', manifest: { name: 'Foo' } }));
});
test('add links on both schemes are reserved', () => {
  const repo = 'https://github.com/Krust3nKaese3/evryGuessTheSong';
  const q = encodeURIComponent(repo);
  for (const url of ['everyapp://add?url=' + q, 'exp+everyapp://add?url=' + q, 'EXP+EveryApp://ADD?url=' + q]) {
    const link = D.parseDeepLink(url);
    assert.strictEqual(link.miniapp, 'add');
    assert.strictEqual(link.params.url, repo);
    assert.strictEqual(D.classifyDeepLink(url).type, 'add');
    assert.strictEqual(D.classifyDeepLink(url).repoUrl, repo);
    assert.ok(!D.matchesMiniApp(link, { id: 'add', repoUrl: 'https://github.com/x/add.git', manifest: { name: 'Add' } }));
    const qr = D.repoUrlFromQr(url);
    assert.strictEqual(qr.ok, true);
    assert.strictEqual(qr.repoUrl, repo);
  }
  assert.strictEqual(D.parseDeepLink('exp+everyapp://expo-development-client/?url=' + q), null);
  assert.strictEqual(D.classifyDeepLink('exp+everyapp://expo-development-client/?url=' + q).type, 'ignore');
  const spotify = D.parseDeepLink('everyapp://spotify-callback?code=abc');
  assert.strictEqual(spotify.miniapp, 'spotify-callback');
  assert.strictEqual(spotify.params.code, 'abc');
  assert.strictEqual(D.classifyDeepLink('everyapp://spotify-callback?code=abc').type, 'miniapp');
  assert.ok(D.matchesMiniApp(spotify, { id: 'z', manifest: { name: 'Spotify Callback' } }));
  const plain = D.repoUrlFromQr(repo + '.git');
  assert.strictEqual(plain.ok, true);
  assert.strictEqual(plain.repoUrl, repo + '.git');
  assert.strictEqual(D.githubRepoKey(repo + '.git'), D.githubRepoKey(repo + '/'));
  assert.strictEqual(D.repoUrlFromQr('https://example.com/not-a-repo').ok, false);
  assert.strictEqual(D.repoUrlFromQr('everyapp://EveryMacro/import').ok, false);
  assert.strictEqual(D.repoUrlFromQr('everyapp://add?url=' + encodeURIComponent('https://example.com/x')).ok, false);
  assert.strictEqual(D.classifyDeepLink('everyapp://add').repoUrl, '');
});
test('queue', () => { D.queueDeepLink('a', { miniapp: 'x', path: '', params: {}, url: '' }); assert.ok(D.takeDeepLink('a')); assert.strictEqual(D.takeDeepLink('a'), null); });
