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
test('queue', () => { D.queueDeepLink('a', { miniapp: 'x', path: '', params: {}, url: '' }); assert.ok(D.takeDeepLink('a')); assert.strictEqual(D.takeDeepLink('a'), null); });
