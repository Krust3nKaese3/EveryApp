const test = require('node:test');
const assert = require('node:assert');
const {
  parseGitHubRepo,
  githubRawUrl,
  virtualHost,
  resolveAssetPath,
  isStoredRelPath,
  assetUri,
  selectMiniAppPrefix,
  listMiniAppFiles,
  normalizeEntrypoint,
  rewriteHtmlAssets,
  utf8ToBase64,
  MINIAPP_LIMITS,
} = require('../src/services/miniAppFiles.ts');

const HOST = 'abcdef01.app.abcdef02.everyapp.invalid';

function filesFrom(map) {
  return async (rel) => {
    assert.ok(isStoredRelPath(rel), `reader saw unsafe path ${rel}`);
    assert.ok(!rel.split('/').includes('..'));
    if (!Object.prototype.hasOwnProperty.call(map, rel)) return null;
    const value = map[rel];
    if (typeof value === 'string') {
      return { mime: rel.endsWith('.css') ? 'text/css' : 'text/javascript', base64: utf8ToBase64(value), text: value };
    }
    return value;
  };
}

test('parseGitHubRepo accepts public repo URLs', () => {
  assert.deepStrictEqual(parseGitHubRepo('https://github.com/Krust3nKaese3/EveryApp'), { owner: 'Krust3nKaese3', repo: 'EveryApp' });
  assert.deepStrictEqual(parseGitHubRepo('https://github.com/a/b.git'), { owner: 'a', repo: 'b' });
  assert.throws(() => parseGitHubRepo('https://gitlab.com/a/b'), /Invalid GitHub/);
});

test('raw url encodes path segments', () => {
  assert.strictEqual(
    githubRawUrl('o', 'r', 'assets/my song.mp3', 5),
    'https://raw.githubusercontent.com/o/r/main/assets/my%20song.mp3?t=5',
  );
});

test('virtual host is stable and isolated per app', () => {
  assert.strictEqual(virtualHost('github_com_a'), virtualHost('github_com_a'));
  assert.notStrictEqual(virtualHost('github_com_a'), virtualHost('github_com_b'));
  assert.match(virtualHost('github_com_a'), /^[a-z0-9]+\.[a-z0-9]+\.[a-z0-9]+\.everyapp\.invalid$/);
});

test('resolveAssetPath stays inside the mini-app', () => {
  assert.strictEqual(resolveAssetPath('app.js', '', HOST), 'app.js');
  assert.strictEqual(resolveAssetPath('./assets/buzz.mp3', 'src', HOST), 'src/assets/buzz.mp3');
  assert.strictEqual(resolveAssetPath('../assets/a.png', 'css', HOST), 'assets/a.png');
  assert.strictEqual(resolveAssetPath('/assets/a.png', 'src', HOST), 'assets/a.png');
  assert.strictEqual(resolveAssetPath(`http://${HOST}/assets/buzz.mp3?x=1`, 'src', HOST), 'assets/buzz.mp3');
  assert.strictEqual(resolveAssetPath('../secret', '', HOST), null);
  assert.strictEqual(resolveAssetPath('foo/../../secret', '', HOST), null);
  assert.strictEqual(resolveAssetPath('%2e%2e/secret', '', HOST), null);
  assert.strictEqual(resolveAssetPath('assets/%2e%2e/%2e%2e/secret', '', HOST), null);
  assert.strictEqual(resolveAssetPath('file:///data/data/com.everyapp/secret', '', HOST), null);
  assert.strictEqual(resolveAssetPath('content://settings/secure', '', HOST), null);
  assert.strictEqual(resolveAssetPath('https://cdn.example/app.js', '', HOST), null);
  assert.strictEqual(resolveAssetPath('//cdn.example/app.js', '', HOST), null);
  assert.strictEqual(resolveAssetPath(`http://other.everyapp.invalid/app.js`, '', HOST), null);
  assert.strictEqual(resolveAssetPath('assets\\buzz.mp3', '', HOST), null);
  assert.strictEqual(assetUri('file:///mini/', 'assets/buzz.mp3'), 'file:///mini/assets/buzz.mp3');
  assert.strictEqual(assetUri('file:///mini/', '../secret'), null);
});

test('subtree is the folder that contains everyapp.json', () => {
  assert.deepStrictEqual(selectMiniAppPrefix(['everyapp.json', 'examples/dice/everyapp.json']), { prefix: '' });
  assert.deepStrictEqual(selectMiniAppPrefix(['games/song/everyapp.json', 'games/song/index.html']), { prefix: 'games/song/' });
  assert.strictEqual(selectMiniAppPrefix(['README.md']).error, 'everyapp.json not found in repository');
  assert.ok(selectMiniAppPrefix(['a/everyapp.json', 'b/everyapp.json']).error);

  const listed = listMiniAppFiles([
    { path: 'games/song/everyapp.json', type: 'blob', mode: '100644', size: 10 },
    { path: 'games/song/index.html', type: 'blob', mode: '100644', size: 20 },
    { path: 'games/song/assets/buzz.mp3', type: 'blob', mode: '100644', size: 30 },
    { path: 'games/song/link', type: 'blob', mode: '120000', size: 4 },
    { path: 'README.md', type: 'blob', mode: '100644', size: 100 },
    { path: 'games/song/node_modules/left-pad/index.js', type: 'blob', mode: '100644', size: 50 },
    { path: 'games/song/src', type: 'tree', mode: '040000' },
  ]);
  assert.strictEqual(listed.prefix, 'games/song/');
  assert.deepStrictEqual(listed.files.map((file) => file.rel), ['everyapp.json', 'index.html', 'assets/buzz.mp3']);
});

test('download limits reject huge trees before any file is fetched', () => {
  assert.throws(() => listMiniAppFiles([
    { path: 'everyapp.json', type: 'blob', size: 10 },
    { path: 'big.bin', type: 'blob', size: MINIAPP_LIMITS.maxFileBytes + 1 },
  ]), /byte limit/);
  assert.throws(() => normalizeEntrypoint('../index.html'), /not a file inside the mini-app/);
  assert.strictEqual(normalizeEntrypoint('./index.html'), 'index.html');
});

test('single-file html is unchanged', async () => {
  const html = '<!DOCTYPE html><html><head><style>body{margin:0}</style></head><body><h1>Hi</h1><script>console.log("<img src=\\"app.js\\">")</script><img src="https://example.com/a.png"><a href="https://example.com">x</a></body></html>';
  const read = async () => { throw new Error('single-file rewrite must not read assets'); };
  assert.strictEqual(await rewriteHtmlAssets(html, '', HOST, read), html);
});

test('relative scripts, css, and media are inlined from the mini-app only', async () => {
  const html = [
    '<link rel="stylesheet" href="styles.css">',
    '<script src="app.js"></script>',
    '<script src="https://cdn.example/lib.js"></script>',
    '<img src="assets/a.png">',
    '<img src="../secret.png">',
    '<img src="file:///etc/passwd">',
    '<audio src="assets/buzz.mp3"></audio>',
    '<a href="page.html">next</a>',
    '<script>var marker = "<img src=\\"assets/a.png\\">";</script>',
  ].join('');
  const seen = [];
  const read = async (rel) => {
    seen.push(rel);
    return filesFrom({
      'app.js': 'console.log(1)',
      'styles.css': 'body{background:url("assets/a.png")}',
      'assets/a.png': { mime: 'image/png', base64: 'QQ==', text: null },
      'assets/buzz.mp3': { mime: 'audio/mpeg', base64: 'QQ==', text: null },
    })(rel);
  };
  const out = await rewriteHtmlAssets(html, '', HOST, read);
  assert.ok(out.includes('<script>console.log(1)</script>'));
  assert.ok(out.includes('<script src="https://cdn.example/lib.js"></script>'));
  assert.ok(out.includes('url("data:image/png;base64,QQ==")'));
  assert.ok(out.includes('<img src="data:image/png;base64,QQ==">'));
  assert.ok(out.includes('<img src="data:,">'));
  assert.ok(out.includes('<img src="file:///etc/passwd">'));
  assert.ok(out.includes('<audio src="data:audio/mpeg;base64,QQ=="></audio>'));
  assert.ok(out.includes('<a href="page.html">next</a>'));
  assert.ok(out.includes('var marker = "<img src=\\"assets/a.png\\">"'));
  assert.ok(!seen.some((rel) => rel.includes('..') || rel.includes('passwd') || rel.startsWith('file')));
});

test('css and modules resolve relative to their own file', async () => {
  const html = '<link rel="stylesheet" href="css/styles.css"><script type="module" src="src/app.js"></script>';
  const read = filesFrom({
    'css/styles.css': '@import "./extra.css";\nbody{background:url("../assets/a.png")}',
    'css/extra.css': '.x{background:url("dot.png")}',
    'css/dot.png': { mime: 'image/png', base64: 'Qg==', text: null },
    'assets/a.png': { mime: 'image/png', base64: 'QQ==', text: null },
    'src/app.js': "import { x } from './util.js';\nconsole.log(x)",
    'src/util.js': 'export const x = 1;\n',
  });
  const out = await rewriteHtmlAssets(html, '', HOST, read);
  assert.ok(out.includes('data:image/png;base64,Qg=='));
  assert.ok(out.includes('data:image/png;base64,QQ=='));
  assert.ok(out.includes('data:text/javascript;base64,'));
  assert.ok(!out.includes("from './util.js'"));
});

test('utf8 base64 roundtrip', () => {
  assert.strictEqual(utf8ToBase64('hi'), Buffer.from('hi').toString('base64'));
  assert.strictEqual(utf8ToBase64('größe'), Buffer.from('größe').toString('base64'));
  assert.strictEqual(utf8ToBase64('a🎵b'), Buffer.from('a🎵b').toString('base64'));
});
