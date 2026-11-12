/**
 * Generic deep links: everyapp://<miniapp>/<path>?query (also exp+everyapp://… on dev-client builds).
 * Host `add` is reserved for installing a mini-app (everyapp://add?url=<encoded GitHub URL>) and is
 * not a mini-app name. Pure parsing + a tiny pending-link queue consumed by MiniAppRunner.
 */
export interface DeepLink { miniapp: string; path: string; params: Record<string, string>; url: string }

const SCHEMES = ['everyapp:', 'exp+everyapp:'];
/** Reserved host: install link, never routed as a mini-app. */
export const ADD_LINK_HOST = 'add';

const GITHUB_REPO_URL = /^https:\/\/github\.com\/[^/\s]+\/[^/\s?#]+(?:\.git)?\/?$/i;

export function parseDeepLink(url: string): DeepLink | null {
  const m = /^([a-z][a-z0-9+.-]*:)\/\/([^/?#]+)(\/[^?#]*)?(\?[^#]*)?/i.exec(url || '');
  if (!m || !SCHEMES.includes(m[1].toLowerCase())) return null;
  const miniapp = decodeURIComponent(m[2]).toLowerCase();
  if (miniapp === 'expo-development-client') return null; // dev launcher's own links
  const params: Record<string, string> = {};
  for (const part of (m[4] || '').replace(/^\?/, '').split('&')) {
    if (!part) continue;
    const i = part.indexOf('=');
    const k = decodeURIComponent((i < 0 ? part : part.slice(0, i)).replace(/\+/g, ' '));
    params[k] = i < 0 ? '' : decodeURIComponent(part.slice(i + 1).replace(/\+/g, ' '));
  }
  return { miniapp, path: (m[3] || '/').replace(/^\/+/, ''), params, url };
}

export type ClassifiedLink =
  | { type: 'ignore' }
  | { type: 'add'; repoUrl: string }
  | { type: 'miniapp'; link: DeepLink };

/** Add-links are handled before the mini-app open flow. `add` is never a mini-app match. */
export function classifyDeepLink(url: string): ClassifiedLink {
  const link = parseDeepLink(url);
  if (!link) return { type: 'ignore' };
  if (link.miniapp === ADD_LINK_HOST) return { type: 'add', repoUrl: (link.params.url || '').trim() };
  return { type: 'miniapp', link };
}

/** https://github.com/owner/repo, optional .git and trailing slash. */
export function isGitHubRepoUrl(repoUrl: string): boolean {
  return GITHUB_REPO_URL.test((repoUrl || '').trim());
}

/** owner/repo key so `…/repo`, `…/repo.git` and `…/repo/` count as the same install. */
export function githubRepoKey(repoUrl: string): string | null {
  const m = (repoUrl || '').trim().match(/github\.com\/([^/\s]+)\/([^/?#\s]+)/i);
  if (!m) return null;
  const repo = m[2].replace(/\.git$/i, '');
  if (!m[1] || !repo) return null;
  return `${m[1]}/${repo}`.toLowerCase();
}

export type QrInstall =
  | { ok: true; repoUrl: string }
  | { ok: false; message: string };

const QR_UNSUPPORTED = 'Dieser QR-Code ist kein EveryApp-Add-Link und keine GitHub-Repository-URL.';
const QR_INVALID_ADD = 'Der Add-Link enthält keine gültige GitHub-URL (https://github.com/besitzer/repo).';

/**
 * In-app scanner: add-links on either scheme, or a raw https://github.com/owner/repo URL.
 * Other payloads (including mini-app deep links) are rejected.
 */
export function repoUrlFromQr(data: string): QrInstall {
  const text = (data || '').trim();
  if (!text) return { ok: false, message: QR_UNSUPPORTED };
  const classified = classifyDeepLink(text);
  if (classified.type === 'add') {
    if (!isGitHubRepoUrl(classified.repoUrl)) return { ok: false, message: QR_INVALID_ADD };
    return { ok: true, repoUrl: classified.repoUrl };
  }
  if (classified.type === 'miniapp') return { ok: false, message: QR_UNSUPPORTED };
  if (isGitHubRepoUrl(text)) return { ok: true, repoUrl: text.trim() };
  return { ok: false, message: QR_UNSUPPORTED };
}

/** Matches by manifest name (case/space-insensitive), app id, or repo name. */
export function matchesMiniApp(link: DeepLink, app: { id: string; repoUrl?: string; manifest: { name: string } }): boolean {
  if (link.miniapp === ADD_LINK_HOST) return false;
  const norm = (s: string) => (s || '').toLowerCase().replace(/[\s_-]+/g, '');
  const repo = (app.repoUrl || '').replace(/\.git$/, '').split('/').pop() || '';
  return [app.manifest.name, app.id, repo].some((n) => norm(n) === norm(link.miniapp));
}

const pending = new Map<string, DeepLink>();
const listeners = new Set<(appId: string) => void>();
export function queueDeepLink(appId: string, link: DeepLink) { pending.set(appId, link); listeners.forEach((l) => l(appId)); }
export function takeDeepLink(appId: string): DeepLink | null { const l = pending.get(appId) || null; pending.delete(appId); return l; }
export function onDeepLinkQueued(fn: (appId: string) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

/** JS injected into the mini-app WebView. Mini-apps listen with window.addEventListener('everyapp:deeplink', e => e.detail). */
export function deepLinkInjection(link: DeepLink): string {
  const d = JSON.stringify(link);
  return `(function(){window.EveryAppLaunch=${d};try{window.dispatchEvent(new CustomEvent('everyapp:deeplink',{detail:${d}}));}catch(e){}})();true;`;
}
