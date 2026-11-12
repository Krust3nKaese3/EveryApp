/**
 * Pure helpers for multi-file mini-apps.
 *
 * The WebView never receives a file:// URL. Assets are inlined or returned
 * through a path check that cannot leave the mini-app directory, so the page
 * cannot read the rest of the device.
 */

export const MINIAPP_LIMITS = {
  maxFiles: 500,
  maxTotalBytes: 40 * 1024 * 1024,
  maxFileBytes: 15 * 1024 * 1024,
};

const SKIP_DIRS = new Set(['node_modules', '.git']);

const MIME: Record<string, string> = {
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  mjs: 'text/javascript',
  cjs: 'text/javascript',
  json: 'application/json',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  ico: 'image/x-icon',
  bmp: 'image/bmp',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  mp4: 'video/mp4',
  webm: 'video/webm',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  txt: 'text/plain',
  xml: 'application/xml',
  pdf: 'application/pdf',
  wasm: 'application/wasm',
  map: 'application/json',
  webmanifest: 'application/manifest+json',
};

export type AssetBytes = { mime: string; base64: string; text: string | null };

export type AssetReader = (rootRelativePath: string) => Promise<AssetBytes | null>;

export type GitBlob = { path: string; type: string; mode?: string; size?: number };

export function parseGitHubRepo(repoUrl: string): { owner: string; repo: string } {
  const match = repoUrl.match(/github\.com\/([^/?#]+)\/([^/?#\s]+)/i);
  if (!match) throw new Error('Invalid GitHub repository URL');
  const owner = match[1];
  const repo = match[2].replace(/\.git$/i, '');
  if (!owner || !repo || owner === '.' || owner === '..' || repo === '.' || repo === '..') {
    throw new Error('Invalid GitHub repository URL');
  }
  return { owner, repo };
}

export function githubRawUrl(owner: string, repo: string, path: string, cacheBust: number): string {
  const encoded = path.split('/').map((part) => encodeURIComponent(part)).join('/');
  return `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/main/${encoded}?t=${cacheBust}`;
}

/** Stable per-app host used only to recognize absolute virtual URLs. Not a network origin. */
export function virtualHost(appId: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < appId.length; i++) {
    const c = appId.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x85ebca6b);
  }
  const a = (h1 >>> 0).toString(16).padStart(8, '0');
  const b = (h2 >>> 0).toString(16).padStart(8, '0');
  const label = appId.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 32) || 'app';
  return `${a}.${label}.${b}.everyapp.invalid`;
}

export function mimeForPath(path: string): string {
  const base = path.split('/').pop() || '';
  const dot = base.lastIndexOf('.');
  const ext = dot >= 0 ? base.slice(dot + 1).toLowerCase() : '';
  return MIME[ext] || 'application/octet-stream';
}

export function isTextMime(mime: string): boolean {
  return mime.startsWith('text/')
    || mime === 'application/javascript'
    || mime === 'text/javascript'
    || mime === 'application/json'
    || mime === 'application/xml'
    || mime === 'image/svg+xml'
    || mime === 'application/manifest+json';
}

export function parentDir(rel: string): string {
  const i = rel.lastIndexOf('/');
  return i === -1 ? '' : rel.slice(0, i);
}

/**
 * Map a URL or relative path onto a root-relative file inside the mini-app.
 * Returns null for external URLs and for any path that would escape the root.
 */
export function resolveAssetPath(raw: string, baseDir: string, host?: string): string | null {
  if (typeof raw !== 'string') return null;
  let pathname = raw.trim();
  if (!pathname || pathname.startsWith('#')) return null;
  if (pathname.startsWith('//')) return null;

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(pathname)) {
    let url: URL;
    try {
      url = new URL(pathname);
    } catch {
      return null;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!host || url.hostname.toLowerCase() !== host.toLowerCase()) return null;
    if (url.username || url.password || url.port) return null;
    pathname = url.pathname;
  } else {
    pathname = pathname.split('#')[0].split('?')[0];
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes('\0') || decoded.includes('\\')) return null;

  const absolute = decoded.startsWith('/');
  const parts = absolute ? [] : baseDir.split('/').filter(Boolean);
  for (const seg of decoded.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (parts.length === 0) return null;
      parts.pop();
      continue;
    }
    if (seg.includes(':') || seg.includes('\0')) return null;
    parts.push(seg);
  }
  if (parts.length === 0) return null;
  return parts.join('/');
}

/** True for a normalized relative path that contains no traversal. */
export function isStoredRelPath(rel: string): boolean {
  if (!rel || rel.startsWith('/') || rel.includes('\\') || rel.includes('\0')) return false;
  const parts = rel.split('/');
  if (parts.some((part) => part === '' || part === '.' || part === '..' || part.includes(':'))) return false;
  return true;
}

export function assetUri(root: string, rel: string): string | null {
  if (!isStoredRelPath(rel)) return null;
  const base = root.endsWith('/') ? root : `${root}/`;
  const uri = base + rel;
  if (!uri.startsWith(base)) return null;
  return uri;
}

export function selectMiniAppPrefix(paths: string[]): { prefix: string } | { error: string } {
  const manifests = paths.filter((path) => path === 'everyapp.json' || path.endsWith('/everyapp.json'));
  if (manifests.includes('everyapp.json')) return { prefix: '' };
  if (manifests.length === 1) {
    const path = manifests[0];
    return { prefix: path.slice(0, path.length - 'everyapp.json'.length) };
  }
  if (manifests.length === 0) return { error: 'everyapp.json not found in repository' };
  return { error: 'Multiple everyapp.json files found. Keep one at the repository root, or only one in the repository.' };
}

export function listMiniAppFiles(items: GitBlob[]): { prefix: string; files: { path: string; rel: string; size: number }[] } {
  const selected = selectMiniAppPrefix(items.map((item) => item.path));
  if ('error' in selected) throw new Error(selected.error);
  const prefix = selected.prefix;
  const files: { path: string; rel: string; size: number }[] = [];
  for (const item of items) {
    if (item.type !== 'blob') continue;
    if (item.mode === '120000') continue;
    if (prefix && !item.path.startsWith(prefix)) continue;
    const rel = prefix ? item.path.slice(prefix.length) : item.path;
    if (!rel || isSkippedRel(rel)) continue;
    if (!isStoredRelPath(rel)) throw new Error(`Unsafe path in repository: ${item.path}`);
    if (typeof item.size !== 'number' || item.size < 0) throw new Error(`Missing size for ${rel}`);
    files.push({ path: item.path, rel, size: item.size });
  }
  assertWithinLimits(files);
  if (!files.some((file) => file.rel === 'everyapp.json')) {
    throw new Error('everyapp.json not found in repository');
  }
  return { prefix, files };
}

export function assertWithinLimits(files: { size: number }[]): void {
  if (files.length > MINIAPP_LIMITS.maxFiles) {
    throw new Error(`Mini-app has too many files (${files.length}). Limit is ${MINIAPP_LIMITS.maxFiles}.`);
  }
  let total = 0;
  for (const file of files) {
    if (file.size > MINIAPP_LIMITS.maxFileBytes) {
      throw new Error(`A file exceeds the ${MINIAPP_LIMITS.maxFileBytes} byte limit.`);
    }
    total += file.size;
  }
  if (total > MINIAPP_LIMITS.maxTotalBytes) {
    throw new Error(`Mini-app exceeds the ${MINIAPP_LIMITS.maxTotalBytes} byte download limit.`);
  }
}

function isSkippedRel(rel: string): boolean {
  return rel.split('/').some((part) => SKIP_DIRS.has(part));
}

export function normalizeEntrypoint(entrypoint: string): string {
  if (typeof entrypoint !== 'string' || !entrypoint.trim()) {
    throw new Error('Entrypoint missing in everyapp.json');
  }
  const rel = resolveAssetPath(entrypoint.trim(), '');
  if (!rel || !isStoredRelPath(rel)) throw new Error(`Entrypoint ${entrypoint} is not a file inside the mini-app`);
  return rel;
}

type RewriteCtx = { host: string; read: AssetReader; seen: Set<string> };

export async function rewriteHtmlAssets(html: string, entryDir: string, host: string, read: AssetReader): Promise<string> {
  const ctx: RewriteCtx = { host, read, seen: new Set() };
  let i = 0;
  let out = '';
  while (i < html.length) {
    const next = html.indexOf('<', i);
    if (next === -1) {
      out += html.slice(i);
      break;
    }
    out += html.slice(i, next);
    if (html.startsWith('<!--', next)) {
      const end = html.indexOf('-->', next);
      const to = end === -1 ? html.length : end + 3;
      out += html.slice(next, to);
      i = to;
      continue;
    }
    const tagEnd = findTagEnd(html, next);
    const rawTag = html.slice(next, tagEnd);
    const name = tagName(rawTag);
    if (!name) {
      out += rawTag;
      i = tagEnd;
      continue;
    }
    const lower = name.toLowerCase();
    if ((lower === 'script' || lower === 'style') && !rawTag.endsWith('/>')) {
      const close = findClose(html, tagEnd, lower);
      if (!close) {
        out += html.slice(next);
        break;
      }
      if (lower === 'script') out += await rewriteScript(rawTag, html.slice(tagEnd, close.start), entryDir, ctx);
      else out += rawTag + await rewriteCss(html.slice(tagEnd, close.start), entryDir, ctx, 0) + html.slice(close.start, close.end);
      i = close.end;
      continue;
    }
    out += await rewriteTag(rawTag, entryDir, ctx);
    i = tagEnd;
  }
  return out;
}

async function rewriteScript(rawTag: string, body: string, entryDir: string, ctx: RewriteCtx): Promise<string> {
  const src = getAttr(rawTag, 'src');
  const close = '</script>';
  if (!src) return rawTag + body + close;
  const rel = resolveAssetPath(src.value, entryDir, ctx.host);
  if (!rel) return rawTag + body + close;
  const file = await ctx.read(rel);
  if (file?.text == null) return rawTag + body + close;
  let code = file.text ?? '';
  const type = getAttr(rawTag, 'type');
  if (type && /module/i.test(type.value)) code = await rewriteModule(code, parentDir(rel), ctx, 0);
  code = code.replace(/<\/script/gi, '<\\/script');
  return `${stripAttrs(rawTag, ['src', 'integrity', 'crossorigin', 'async', 'defer'])}${code}${close}`;
}

async function rewriteModule(code: string, baseDir: string, ctx: RewriteCtx, depth: number): Promise<string> {
  if (depth > 8) return code;
  const re = /\b(?:import\s*\(\s*|import\s+(?:[^'";]*?\sfrom\s+)?|export\s+[^'";]*?\sfrom\s+)(['"])([^'"]+)\1/g;
  let out = '';
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(code))) {
    const spec = match[2];
    const quote = match[1];
    const rel = resolveAssetPath(spec, baseDir, ctx.host);
    out += code.slice(last, match.index);
    if (!rel || ctx.seen.has(rel)) {
      out += match[0];
    } else {
      const file = await ctx.read(rel);
      if (file?.text == null) {
        out += match[0];
      } else {
        ctx.seen.add(rel);
        const rewritten = await rewriteModule(file.text, parentDir(rel), ctx, depth + 1);
        ctx.seen.delete(rel);
        const dataUrl = `data:text/javascript;base64,${utf8ToBase64(rewritten)}`;
        const prefix = match[0].slice(0, match[0].length - spec.length - quote.length * 2);
        out += `${prefix}${quote}${dataUrl}${quote}`;
      }
    }
    last = match.index + match[0].length;
  }
  out += code.slice(last);
  return out;
}

async function rewriteTag(rawTag: string, entryDir: string, ctx: RewriteCtx): Promise<string> {
  const lower = tagName(rawTag)?.toLowerCase() || '';
  let next = rawTag;
  if (lower === 'link' && isStylesheet(rawTag)) {
    const href = getAttr(rawTag, 'href');
    const rel = href && resolveAssetPath(href.value, entryDir, ctx.host);
    if (rel) {
      const file = await ctx.read(rel);
      if (file?.text != null) {
        const css = await rewriteCss(file.text, parentDir(rel), ctx, 0);
        const media = getAttr(rawTag, 'media');
        const mediaAttr = media ? ` media="${escapeAttr(media.value, '"')}"` : '';
        return `<style${mediaAttr}>${css}</style>`;
      }
    }
  }
  const skipHref = lower === 'a' || lower === 'area' || lower === 'base';
  for (const attr of ['src', 'href', 'poster']) {
    if (attr === 'href' && skipHref) continue;
    const found = getAttr(next, attr);
    if (!found) continue;
    const resolved = resolveAssetPath(found.value, entryDir, ctx.host);
    if (!resolved) {
      if (isAppRelative(found.value)) next = replaceAttr(next, attr, 'data:,');
      continue;
    }
    const file = await ctx.read(resolved);
    if (!file) {
      next = replaceAttr(next, attr, 'data:,');
      continue;
    }
    next = replaceAttr(next, attr, `data:${file.mime};base64,${file.base64}`);
  }
  const srcset = getAttr(next, 'srcset');
  if (srcset) {
    const rewritten = await rewriteSrcset(srcset.value, entryDir, ctx);
    if (rewritten !== srcset.value) next = replaceAttr(next, 'srcset', rewritten);
  }
  const style = getAttr(next, 'style');
  if (style && /url\s*\(/i.test(style.value)) {
    const css = await rewriteCss(style.value, entryDir, ctx, 0);
    if (css !== style.value) next = replaceAttr(next, 'style', css);
  }
  return next;
}

async function rewriteSrcset(value: string, entryDir: string, ctx: RewriteCtx): Promise<string> {
  const parts = value.split(',');
  const out: string[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    const match = trimmed.match(/^(\S+)([\s\S]*)$/);
    if (!match) {
      out.push(trimmed);
      continue;
    }
    const rel = resolveAssetPath(match[1], entryDir, ctx.host);
    if (!rel) {
      out.push(trimmed);
      continue;
    }
    const file = await ctx.read(rel);
    if (!file) {
      out.push(trimmed);
      continue;
    }
    out.push(`data:${file.mime};base64,${file.base64}${match[2]}`);
  }
  return out.join(', ');
}

async function rewriteCss(css: string, baseDir: string, ctx: RewriteCtx, depth: number): Promise<string> {
  if (depth > 8) return css;
  const importRe = /@import\s+(?:url\(\s*)?(['"])([^'"]+)\1\s*\)?[^;]*;/gi;
  let inlined = '';
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = importRe.exec(css))) {
    inlined += css.slice(last, match.index);
    const rel = resolveAssetPath(match[2], baseDir, ctx.host);
    if (!rel || ctx.seen.has(rel)) {
      inlined += match[0];
    } else {
      const file = await ctx.read(rel);
      if (file?.text == null) inlined += match[0];
      else {
        ctx.seen.add(rel);
        inlined += await rewriteCss(file.text, parentDir(rel), ctx, depth + 1);
        ctx.seen.delete(rel);
      }
    }
    last = match.index + match[0].length;
  }
  inlined += css.slice(last);

  const urlRe = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
  let out = '';
  last = 0;
  while ((match = urlRe.exec(inlined))) {
    out += inlined.slice(last, match.index);
    const rawUrl = match[2].trim();
    const rel = resolveAssetPath(rawUrl, baseDir, ctx.host);
    if (!rel) out += match[0];
    else {
      const file = await ctx.read(rel);
      out += file ? `url("data:${file.mime};base64,${file.base64}")` : match[0];
    }
    last = match.index + match[0].length;
  }
  out += inlined.slice(last);
  return out;
}

function isAppRelative(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return false;
  return true;
}

function isStylesheet(rawTag: string): boolean {
  const rel = getAttr(rawTag, 'rel');
  return !!rel && /(^|\s)stylesheet(\s|$)/i.test(rel.value);
}

function tagName(rawTag: string): string | null {
  const match = /^<\s*([a-zA-Z][\w:-]*)/.exec(rawTag);
  return match ? match[1] : null;
}

function findTagEnd(html: string, start: number): number {
  let quote: string | null = null;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === '>') return i + 1;
  }
  return html.length;
}

function findClose(html: string, from: number, tag: string): { start: number; end: number } | null {
  const re = new RegExp(`</${tag}\\s*>`, 'ig');
  re.lastIndex = from;
  const match = re.exec(html);
  if (!match) return null;
  return { start: match.index, end: match.index + match[0].length };
}

function getAttr(rawTag: string, name: string): { value: string; quote: string } | null {
  const quoted = new RegExp(`\\s${name}\\s*=\\s*(['"])([\\s\\S]*?)\\1`, 'i').exec(rawTag);
  if (quoted) return { value: decodeHtmlAttr(quoted[2]), quote: quoted[1] };
  const bare = new RegExp(`\\s${name}\\s*=\\s*([^\\s>"']+)`, 'i').exec(rawTag);
  if (!bare) return null;
  return { value: decodeHtmlAttr(bare[1]), quote: '"' };
}

function replaceAttr(rawTag: string, name: string, newValue: string): string {
  const quoted = new RegExp(`(\\s${name}\\s*=\\s*)(['"])[\\s\\S]*?\\2`, 'i');
  if (quoted.test(rawTag)) {
    return rawTag.replace(quoted, (_full, prefix: string, quote: string) => `${prefix}${quote}${escapeAttr(newValue, quote)}${quote}`);
  }
  const bare = new RegExp(`(\\s${name}\\s*=\\s*)[^\\s>"']+`, 'i');
  return rawTag.replace(bare, (_full, prefix: string) => `${prefix}"${escapeAttr(newValue, '"')}"`);
}

function stripAttrs(rawTag: string, names: string[]): string {
  let out = rawTag;
  for (const name of names) {
    out = out.replace(new RegExp(`\\s${name}\\s*=\\s*(['"])[\\s\\S]*?\\1`, 'ig'), '');
    out = out.replace(new RegExp(`\\s${name}(?=\\s|/?>)`, 'ig'), '');
  }
  return out.replace(/\s*\/?>$/, '>');
}

function decodeHtmlAttr(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function escapeAttr(value: string, quote: string): string {
  const escaped = value.replace(/&/g, '&amp;');
  return quote === '"' ? escaped.replace(/"/g, '&quot;') : escaped.replace(/'/g, '&#39;');
}

export function utf8ToBase64(input: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < input.length) {
      const next = input.charCodeAt(++i);
      const point = 0x10000 + ((c & 0x3ff) << 10) + (next & 0x3ff);
      bytes.push(
        0xf0 | (point >> 18),
        0x80 | ((point >> 12) & 63),
        0x80 | ((point >> 6) & 63),
        0x80 | (point & 63),
      );
      continue;
    }
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    out += alphabet[(n >> 18) & 63] + alphabet[(n >> 12) & 63];
    out += i + 1 < bytes.length ? alphabet[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? alphabet[n & 63] : '=';
  }
  return out;
}

/** Runtime injected after the bridge. Relative URLs are loaded via __eaReadAsset, never via file://. */
export function assetRuntimeSource(host: string): string {
  const hostJson = JSON.stringify(host);
  return `(function(){
    var HOST = ${hostJson};
    function localRef(url) {
      if (url == null) return null;
      var s = String(url).trim();
      if (!s || s.charAt(0) === '#') return null;
      var head = s.slice(0, 16).toLowerCase();
      if (head.indexOf('data:') === 0 || head.indexOf('blob:') === 0 || head.indexOf('javascript:') === 0 || head.indexOf('mailto:') === 0 || head.indexOf('tel:') === 0) return null;
      if (s.slice(0, 2) === '//') return null;
      if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) {
        try {
          var u = new URL(s);
          if ((u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.toLowerCase() === HOST && !u.username && !u.password && !u.port) return u.href;
        } catch (e) {}
        return null;
      }
      return s;
    }
    function b64ToBytes(b64) {
      var bin = atob(b64);
      var out = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
    function bytesToText(bytes) {
      if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(bytes);
      var s = '';
      for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
      try { return decodeURIComponent(escape(s)); } catch (e) { return s; }
    }
    function dataUrl(file) { return 'data:' + file.mime + ';base64,' + file.base64; }
    function inlineCss(css) {
      var re = /url\\(\\s*['"]?([^'")]+)['"]?\\s*\\)/gi;
      var found = [];
      String(css).replace(re, function(full, u) {
        var ref = localRef(String(u).trim());
        if (ref) found.push({ full: full, ref: ref });
        return full;
      });
      if (!found.length || !window.__eaReadAsset) return Promise.resolve(css);
      return Promise.all(found.map(function(item) { return window.__eaReadAsset(item.ref); })).then(function(files) {
        var out = css;
        for (var i = 0; i < found.length; i++) out = out.split(found[i].full).join('url("' + dataUrl(files[i]) + '")');
        return out;
      });
    }
    function navigate(url) {
      if (!window.ReactNativeWebView) return;
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'navigate', url: String(url) }));
    }
    document.addEventListener('click', function(ev) {
      var node = ev.target;
      while (node && node.tagName !== 'A') node = node.parentElement;
      if (!node) return;
      var href = node.getAttribute('href');
      var ref = localRef(href);
      if (!ref) return;
      ev.preventDefault();
      navigate(href);
    }, true);
    var origFetch = window.fetch;
    if (origFetch) {
      window.fetch = function(input, init) {
        var raw = typeof input === 'string' ? input : (input && input.url);
        var ref = localRef(raw);
        if (!ref || !window.__eaReadAsset) return origFetch.apply(this, arguments);
        return window.__eaReadAsset(ref).then(function(file) {
          return new Response(b64ToBytes(file.base64), { status: 200, headers: { 'Content-Type': file.mime } });
        });
      };
    }
    var NativeXHR = window.XMLHttpRequest;
    window.XMLHttpRequest = function XMLHttpRequest() {
      var native = new NativeXHR();
      var local = null;
      var origOpen = native.open;
      var origSend = native.send;
      native.open = function(method, url) {
        var ref = localRef(url);
        if (!ref) { local = null; return origOpen.apply(native, arguments); }
        local = ref;
      };
      native.send = function(body) {
        if (!local) return origSend.apply(native, arguments);
        var url = local;
        window.__eaReadAsset(url).then(function(file) {
          var bytes = b64ToBytes(file.base64);
          var text = bytesToText(bytes);
          try {
            Object.defineProperty(native, 'readyState', { configurable: true, get: function() { return 4; } });
            Object.defineProperty(native, 'status', { configurable: true, get: function() { return 200; } });
            Object.defineProperty(native, 'statusText', { configurable: true, get: function() { return 'OK'; } });
            Object.defineProperty(native, 'responseText', { configurable: true, get: function() { return text; } });
            Object.defineProperty(native, 'responseURL', { configurable: true, get: function() { return url; } });
            Object.defineProperty(native, 'response', { configurable: true, get: function() {
              if (native.responseType === 'json') { try { return JSON.parse(text); } catch (e) { return null; } }
              if (native.responseType === 'blob') return new Blob([bytes], { type: file.mime });
              if (native.responseType === 'arraybuffer') return bytes.buffer;
              return text;
            } });
          } catch (e) {}
          try { native.dispatchEvent(new ProgressEvent('readystatechange')); } catch (e) {}
          try { native.dispatchEvent(new ProgressEvent('load')); } catch (e) { if (typeof native.onload === 'function') native.onload(); }
          try { native.dispatchEvent(new ProgressEvent('loadend')); } catch (e) {}
        }).catch(function() {
          try { native.dispatchEvent(new ProgressEvent('error')); } catch (e) { if (typeof native.onerror === 'function') native.onerror(); }
        });
      };
      return native;
    };
    window.XMLHttpRequest.prototype = NativeXHR.prototype;
    function patchProp(proto, prop) {
      if (!proto) return;
      var desc = Object.getOwnPropertyDescriptor(proto, prop);
      if (!desc || !desc.set || !desc.get) return;
      Object.defineProperty(proto, prop, {
        configurable: true, enumerable: desc.enumerable,
        get: function() { return desc.get.call(this); },
        set: function(value) {
          var ref = localRef(value);
          if (!ref || !window.__eaReadAsset) { desc.set.call(this, value); return; }
          var el = this;
          window.__eaReadAsset(ref).then(function(file) { desc.set.call(el, dataUrl(file)); }).catch(function() { desc.set.call(el, value); });
        }
      });
    }
    if (typeof HTMLImageElement !== 'undefined') patchProp(HTMLImageElement.prototype, 'src');
    if (typeof HTMLMediaElement !== 'undefined') patchProp(HTMLMediaElement.prototype, 'src');
    if (typeof HTMLSourceElement !== 'undefined') patchProp(HTMLSourceElement.prototype, 'src');
    var NativeAudio = window.Audio;
    if (NativeAudio) {
      var WrappedAudio = function Audio(src) {
        var audio = new NativeAudio();
        if (src) audio.src = src;
        return audio;
      };
      WrappedAudio.prototype = NativeAudio.prototype;
      window.Audio = WrappedAudio;
    }
    var origAppend = Node.prototype.appendChild;
    var origInsert = Node.prototype.insertBefore;
    function adoptScript(node) {
      if (!node || node.tagName !== 'SCRIPT') return null;
      var src = node.getAttribute && node.getAttribute('src');
      var ref = localRef(src);
      if (!ref || !window.__eaReadAsset) return null;
      var placeholder = document.createComment('ea-script');
      window.__eaReadAsset(ref).then(function(file) {
        var script = document.createElement('script');
        if (node.type) script.type = node.type;
        script.text = bytesToText(b64ToBytes(file.base64));
        if (placeholder.parentNode) placeholder.parentNode.replaceChild(script, placeholder);
      });
      return placeholder;
    }
    Node.prototype.appendChild = function(node) {
      var placeholder = adoptScript(node);
      return origAppend.call(this, placeholder || node);
    };
    Node.prototype.insertBefore = function(node, before) {
      var placeholder = adoptScript(node);
      return origInsert.call(this, placeholder || node, before);
    };
    var origSet = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function(name, value) {
      var n = String(name).toLowerCase();
      var ref = (n === 'src' || n === 'href' || n === 'poster') ? localRef(value) : null;
      if (!ref || !window.__eaReadAsset) return origSet.call(this, name, value);
      var el = this;
      if (el.tagName === 'A' || el.tagName === 'AREA' || el.tagName === 'BASE') return origSet.call(el, name, value);
      if (el.tagName === 'LINK' && n === 'href' && /stylesheet/i.test(el.getAttribute('rel') || '')) {
        window.__eaReadAsset(ref).then(function(file) {
          return inlineCss(bytesToText(b64ToBytes(file.base64)));
        }).then(function(css) {
          var style = document.createElement('style');
          style.textContent = css;
          if (el.parentNode) el.parentNode.replaceChild(style, el);
        });
        return;
      }
      window.__eaReadAsset(ref).then(function(file) { origSet.call(el, name, dataUrl(file)); });
    };
    if (typeof MutationObserver !== 'undefined' && document.documentElement) {
      var observer = new MutationObserver(function(records) {
        records.forEach(function(record) {
          for (var i = 0; i < record.addedNodes.length; i++) rewriteAdded(record.addedNodes[i]);
        });
      });
      var rewriteAdded = function(node) {
        if (!node || node.nodeType !== 1) return;
        if (node.tagName === 'STYLE' && /url\\s*\\(/i.test(node.textContent || '')) {
          var original = node.textContent;
          inlineCss(original).then(function(next) { if (node.textContent === original) node.textContent = next; });
        }
        if (node.tagName === 'IMG' || node.tagName === 'AUDIO' || node.tagName === 'VIDEO' || node.tagName === 'SOURCE') {
          var src = node.getAttribute('src');
          var ref = localRef(src);
          if (ref) window.__eaReadAsset(ref).then(function(file) { origSet.call(node, 'src', dataUrl(file)); });
        }
        var kids = node.children || [];
        for (var c = 0; c < kids.length; c++) rewriteAdded(kids[c]);
      };
      observer.observe(document.documentElement, { subtree: true, childList: true });
    }
  })();`;
}
