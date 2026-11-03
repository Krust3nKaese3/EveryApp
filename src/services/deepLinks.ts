/**
 * Generic deep links: everyapp://<miniapp>/<path>?query (also exp+everyapp://… on dev-client builds).
 * Pure parsing + a tiny pending-link queue consumed by MiniAppRunner (delivered as a WebView event).
 */
export interface DeepLink { miniapp: string; path: string; params: Record<string, string>; url: string }

const SCHEMES = ['everyapp:', 'exp+everyapp:'];

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

/** Matches by manifest name (case/space-insensitive), app id, or repo name. */
export function matchesMiniApp(link: DeepLink, app: { id: string; repoUrl?: string; manifest: { name: string } }): boolean {
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
