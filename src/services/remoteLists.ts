import { GITHUB_API_HEADERS, commitApiUrl, githubRawUrlAtRef, parseCommitSha } from './githubPin';
import {
  BLOCKLIST_PATH,
  CATALOG_PATH,
  POLICY_REPO,
  BlocklistFile,
  CatalogFile,
  parseBlocklist,
  parseCatalog,
} from './storePolicy';

const bundledCatalog = require('../../catalog/catalog.json');
const bundledBlocklist = require('../../catalog/blocklist.json');

export function bundledCatalogFile(): CatalogFile {
  const parsed = parseCatalog(bundledCatalog);
  if (!parsed || parsed.apps.length === 0) throw new Error('Die mitgelieferte Katalogdatei ist ungültig.');
  return parsed;
}

export function bundledBlocklistFile(): BlocklistFile {
  return parseBlocklist(bundledBlocklist) || { entries: [] };
}

async function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { ...GITHUB_API_HEADERS, Accept: 'application/json' },
      signal: ctrl.signal,
    });
    if (!response.ok) throw new Error(String(response.status));
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Catalog and blocklist come from this repository's latest `main` commit.
 * A network or parse failure keeps the copy bundled in the app.
 */
export async function loadPolicyLists(): Promise<{ catalog: CatalogFile; blocklist: BlocklistFile; remote: boolean }> {
  const fallback = { catalog: bundledCatalogFile(), blocklist: bundledBlocklistFile(), remote: false };
  try {
    const commit = await fetchJson(commitApiUrl(POLICY_REPO.owner, POLICY_REPO.repo), 8000);
    const sha = parseCommitSha(commit);
    const [catalogRaw, blockRaw] = await Promise.all([
      fetchJson(githubRawUrlAtRef(POLICY_REPO.owner, POLICY_REPO.repo, sha, CATALOG_PATH), 8000),
      fetchJson(githubRawUrlAtRef(POLICY_REPO.owner, POLICY_REPO.repo, sha, BLOCKLIST_PATH), 8000),
    ]);
    const catalog = parseCatalog(catalogRaw);
    const blocklist = parseBlocklist(blockRaw);
    if (!catalog || !blocklist) return fallback;
    return { catalog, blocklist, remote: true };
  } catch {
    return fallback;
  }
}
