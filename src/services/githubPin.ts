/**
 * Mini-app downloads are pinned to a commit SHA.
 *
 * raw.githubusercontent.com caches `/main/…` for several minutes and ignores
 * cache-busting query strings. `?t=` therefore often returns the previous
 * files, which is why "Aktualisieren" could lag behind a push while a fresh
 * install sometimes saw newer bytes. Resolving `commits/main` and then
 * requesting `/<sha>/…` uses a new, immutable URL.
 */

export const GITHUB_API_HEADERS: Record<string, string> = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'EveryApp',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
};

export function commitApiUrl(owner: string, repo: string, branch = 'main'): string {
  return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(branch)}`;
}

export function treeApiUrl(owner: string, repo: string, sha: string): string {
  return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(sha)}?recursive=1`;
}

/** Immutable raw URL. No query string: the commit SHA is the cache key. */
export function githubRawUrlAtRef(owner: string, repo: string, ref: string, path: string): string {
  const encoded = path.split('/').map((part) => encodeURIComponent(part)).join('/');
  return `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(ref)}/${encoded}`;
}

const SHA_RE = /^[0-9a-f]{40}$/i;

export function parseCommitSha(body: unknown): string {
  const sha = body && typeof body === 'object' ? (body as { sha?: unknown }).sha : undefined;
  if (typeof sha !== 'string' || !SHA_RE.test(sha)) {
    throw new Error('GitHub-Antwort enthält keine gültige Commit-SHA.');
  }
  return sha.toLowerCase();
}

export function shortSha(sha: string | null | undefined): string {
  if (!sha || !SHA_RE.test(sha)) return 'unbekannt';
  return sha.slice(0, 7);
}

export type UpdateStatus = 'unknown' | 'current' | 'available';

/** Missing installed SHA counts as available so the first refresh records a commit. */
export function updateStatus(installed: string | null | undefined, latest: string | null | undefined): UpdateStatus {
  if (!latest || !SHA_RE.test(latest)) return 'unknown';
  if (!installed || !SHA_RE.test(installed)) return 'available';
  return installed.toLowerCase() === latest.toLowerCase() ? 'current' : 'available';
}

export function versionLine(version: string | null | undefined, installed: string | null | undefined, latest: string | null | undefined): string {
  const v = version ? `Version ${version}` : 'Version unbekannt';
  const inst = shortSha(installed);
  const status = updateStatus(installed, latest);
  if (status === 'unknown') return `${v} · installiert ${inst}`;
  if (status === 'current') return `${v} · ${shortSha(latest)}`;
  return `${v} · installiert ${inst} · aktuell ${shortSha(latest)}`;
}
