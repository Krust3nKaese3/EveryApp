const test = require('node:test'); const assert = require('node:assert');
const P = require('../src/services/popupTiles.ts');
test('classifyIcon', () => {
  assert.deepStrictEqual(P.classifyIcon('power_settings_new'), { kind: 'builtin', value: 'power' });
  assert.strictEqual(P.classifyIcon('icons/lamp.png', 'https://raw.githubusercontent.com/K/R/main').value, 'https://raw.githubusercontent.com/K/R/main/icons/lamp.png');
  assert.strictEqual(P.classifyIcon('icons/lamp.svg', 'https://r/x').kind, 'svg');
  assert.strictEqual(P.classifyIcon('<svg viewBox="0 0 1 1"></svg>').kind, 'svg');
  assert.throws(() => P.classifyIcon('http://a/b.png'), /https/);
  assert.strictEqual(P.classifyIcon('💡').kind, 'letter');
});
test('normalizeTilePatch', () => {
  assert.deepStrictEqual(P.normalizeTilePatch({ state: 'active', label: 'Licht' }), { state: 'on', label: 'Licht' });
  assert.strictEqual(P.normalizeTilePatch({ state: 'unavailable' }).state, 'unavailable');
  assert.throws(() => P.normalizeTilePatch({ state: 'x' }), /ungültig/);
  assert.throws(() => P.normalizeTilePatch({ foo: 1 }), /unbekanntes Feld/);
});
test('tile ownership', () => {
  assert.doesNotThrow(() => P.checkTileOwner(1, undefined, 'a'));
  assert.doesNotThrow(() => P.checkTileOwner(1, { appId: 'a' }, 'a'));
  assert.throws(() => P.checkTileOwner(1, { appId: 'b' }, 'a'), /gehört/);
  assert.throws(() => P.checkTileOwner(6, undefined, 'a'), /1–5/);
});
test('normalizePopupSpec', () => {
  const s = P.normalizePopupSpec({ id: 'licht', html: '<b>x</b>', style: { width: '90%', height: 'auto', position: 'bottom', animation: 'slide', scrimAlpha: 0.5 } }, 'app1');
  assert.strictEqual(s.appId, 'app1'); assert.strictEqual(s.style.height, 'auto');
  assert.throws(() => P.normalizePopupSpec({ id: 'x', url: 'http://a' }, 'a'), /https/);
  assert.throws(() => P.normalizePopupSpec({ id: 'x', html: 'a', url: 'https://a' }, 'a'), /genau eins/);
  assert.throws(() => P.normalizePopupSpec({ id: 'x', html: 'a', style: { width: '10px' } }, 'a'), /width/);
  assert.throws(() => P.normalizePopupSpec({ id: 'x', html: 'a', style: { position: 'left' } }, 'a'), /position/);
});
