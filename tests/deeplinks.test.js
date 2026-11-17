const test = require('node:test'); const assert = require('node:assert');
const D = require('../src/services/deepLinks.ts');
test('parse openscr link', () => {
  const l = D.parseDeepLink('openscr://EveryMacro/import?url=' + encodeURIComponent('https://x.y/a.macro.js?b=1'));
  assert.strictEqual(l.miniapp, 'everymacro'); assert.strictEqual(l.path, 'import'); assert.strictEqual(l.params.url, 'https://x.y/a.macro.js?b=1');
  assert.strictEqual(D.parseDeepLink('exp+openscr://everymacro/import?gist=abc').params.gist, 'abc');
  assert.strictEqual(D.parseDeepLink('https://x/y'), null);
  assert.strictEqual(D.parseDeepLink('exp+openscr://expo-development-client/?url=x'), null);
});
test('match mini-app', () => {
  const l = D.parseDeepLink('openscr://everymacro/import');
  assert.ok(D.matchesMiniApp(l, { id: 'z', repoUrl: 'https://github.com/K/EveryMacro.git', manifest: { name: 'Other' } }));
  assert.ok(D.matchesMiniApp(l, { id: 'z', manifest: { name: 'Every Macro' } }));
  assert.ok(!D.matchesMiniApp(l, { id: 'z', manifest: { name: 'Foo' } }));
});
test('add links on both schemes are reserved', () => {
  const repo = 'https://github.com/Krust3nKaese3/evryGuessTheSong';
  const q = encodeURIComponent(repo);
  for (const url of ['openscr://add?url=' + q, 'exp+openscr://add?url=' + q, 'EXP+OpenScr://ADD?url=' + q]) {
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
  assert.strictEqual(D.parseDeepLink('exp+openscr://expo-development-client/?url=' + q), null);
  assert.strictEqual(D.classifyDeepLink('exp+openscr://expo-development-client/?url=' + q).type, 'ignore');
  const spotify = D.parseDeepLink('openscr://spotify-callback?code=abc');
  assert.strictEqual(spotify.miniapp, 'spotify-callback');
  assert.strictEqual(spotify.params.code, 'abc');
  assert.strictEqual(D.classifyDeepLink('openscr://spotify-callback?code=abc').type, 'miniapp');
  assert.ok(D.matchesMiniApp(spotify, { id: 'z', manifest: { name: 'Spotify Callback' } }));
  const plain = D.repoUrlFromQr(repo + '.git');
  assert.strictEqual(plain.ok, true);
  assert.strictEqual(plain.repoUrl, repo + '.git');
  assert.strictEqual(D.githubRepoKey(repo + '.git'), D.githubRepoKey(repo + '/'));
  assert.strictEqual(D.repoUrlFromQr('https://example.com/not-a-repo').ok, false);
  assert.strictEqual(D.repoUrlFromQr('openscr://EveryMacro/import').ok, false);
  assert.strictEqual(D.repoUrlFromQr('openscr://add?url=' + encodeURIComponent('https://example.com/x')).ok, false);
  assert.strictEqual(D.classifyDeepLink('openscr://add').repoUrl, '');
  assert.strictEqual(D.parseDeepLink('everyapp://add?url=' + q), null);
});
test('queue', () => { D.queueDeepLink('a', { miniapp: 'x', path: '', params: {}, url: '' }); assert.ok(D.takeDeepLink('a')); assert.strictEqual(D.takeDeepLink('a'), null); });
test('deeplink injection keeps the old event as an alias', () => {
  const js = D.deepLinkInjection({ miniapp: 'wolf', path: 'join', params: { room: 'K7QP' }, url: 'openscr://wolf/join' });
  assert.match(js, /window\.OpenScrLaunch=/);
  assert.match(js, /window\.EveryAppLaunch=/);
  assert.match(js, /openscr:deeplink/);
  assert.match(js, /everyapp:deeplink/);
});
