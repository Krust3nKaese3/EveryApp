/**
 * Catalog, blocklist, foreign-repo warning, and the report mailbox.
 * Fetching lives in remoteLists.ts. These functions stay free of React Native.
 */
import { MiniApp } from '../types';
import { githubRepoKey } from './deepLinks';

export const REPORT_EMAIL = 'manueldiliberto1@gmail.com';

export const POLICY_REPO = { owner: 'Krust3nKaese3', repo: 'EveryApp' };
export const CATALOG_PATH = 'catalog/catalog.json';
export const BLOCKLIST_PATH = 'catalog/blocklist.json';

/** Shown before a repository that is not in the curated catalog is installed. */
export const FOREIGN_WARNING_MESSAGE =
  'Nur vertrauenswürdige Quellen hinzufügen…\n\n' +
  'Diese Mini-App steht nicht im Katalog. Sie wird als Webseite aus einem öffentlichen GitHub-Repository geladen. ' +
  'Erst nach deiner Zustimmung kann sie Gerätefunktionen nutzen, zum Beispiel Speicher, Internet, Bluetooth, Benachrichtigungen, Kamera, Sensoren oder Spotify. ' +
  'Sie erhält keinen Zugriff auf das Dateisystem, auf Kontakte oder auf den Standort.\n\n' +
  'Füge sie nur hinzu, wenn du dem Repository vertraust.';

export const CATALOG_ONLY_MESSAGE =
  'In dieser Version kannst du nur Mini-Apps aus dem Katalog installieren. Freie GitHub-Links und QR-Codes sind deaktiviert.';

export interface CatalogApp {
  name: string;
  repoUrl: string;
  description: string;
  ageRating: string;
}

export interface BlockEntry {
  appId?: string;
  repo?: string;
  reason: string;
}

export interface CatalogFile {
  apps: CatalogApp[];
}

export interface BlocklistFile {
  entries: BlockEntry[];
}

export function isEnabledFlag(value: string | undefined | null): boolean {
  const v = String(value || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/**
 * Metro inlines only a direct `process.env.EXPO_PUBLIC_…` read.
 * Set EXPO_PUBLIC_CATALOG_ONLY=1 before bundling (app.config.js also mirrors CATALOG_ONLY).
 */
export function isCatalogOnlyBuild(): boolean {
  return isEnabledFlag(process.env.EXPO_PUBLIC_CATALOG_ONLY);
}

export function parseCatalog(data: unknown): CatalogFile | null {
  if (!data || typeof data !== 'object') return null;
  const apps = (data as { apps?: unknown }).apps;
  if (!Array.isArray(apps)) return null;
  const parsed: CatalogApp[] = [];
  for (const item of apps) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    if (typeof row.name !== 'string' || typeof row.repoUrl !== 'string') continue;
    if (typeof row.description !== 'string' || typeof row.ageRating !== 'string') continue;
    if (!githubRepoKey(row.repoUrl)) continue;
    parsed.push({
      name: row.name.trim(),
      repoUrl: row.repoUrl.trim(),
      description: row.description.trim(),
      ageRating: row.ageRating.trim(),
    });
  }
  return { apps: parsed };
}

export function parseBlocklist(data: unknown): BlocklistFile | null {
  if (!data || typeof data !== 'object') return null;
  const entries = (data as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) return null;
  const parsed: BlockEntry[] = [];
  for (const item of entries) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const reason = typeof row.reason === 'string' ? row.reason.trim() : '';
    if (!reason) continue;
    const appId = typeof row.appId === 'string' && row.appId.trim() ? row.appId.trim() : undefined;
    const repo = typeof row.repo === 'string' && row.repo.trim() ? row.repo.trim() : undefined;
    if (!appId && !repo) continue;
    parsed.push({ appId, repo, reason });
  }
  return { entries: parsed };
}

export function catalogEntryFor(repoUrl: string, catalog: CatalogFile): CatalogApp | null {
  const key = githubRepoKey(repoUrl);
  if (!key) return null;
  return catalog.apps.find((app) => githubRepoKey(app.repoUrl) === key) || null;
}

export function reposMatch(a: string, b: string): boolean {
  const left = githubRepoKey(a.includes('github.com') ? a : `https://github.com/${a.replace(/^\/+/, '')}`);
  const right = githubRepoKey(b.includes('github.com') ? b : `https://github.com/${b.replace(/^\/+/, '')}`);
  return !!left && left === right;
}

export function blockReasonFor(appId: string, repoUrl: string, list: BlocklistFile): string | null {
  for (const entry of list.entries) {
    if (entry.appId && entry.appId === appId) return entry.reason;
    if (entry.repo && repoUrl && reposMatch(entry.repo, repoUrl)) return entry.reason;
  }
  return null;
}

export type AddDecision =
  | { type: 'install' }
  | { type: 'confirm-foreign'; message: string }
  | { type: 'reject'; title: string; message: string }
  | { type: 'blocked'; title: string; message: string };

export function decideAdd(
  repoUrl: string,
  opts: { catalog: CatalogFile; blocklist: BlocklistFile; catalogOnly: boolean; appId?: string },
): AddDecision {
  const trimmed = (repoUrl || '').trim();
  if (!githubRepoKey(trimmed)) {
    return { type: 'reject', title: 'Ungültige Adresse', message: 'Bitte eine öffentliche GitHub-URL eingeben (https://github.com/besitzer/repo).' };
  }
  const blocked = blockReasonFor(opts.appId || '', trimmed, opts.blocklist);
  if (blocked) {
    return { type: 'blocked', title: 'Mini-App gesperrt', message: blocked };
  }
  if (catalogEntryFor(trimmed, opts.catalog)) return { type: 'install' };
  if (opts.catalogOnly) {
    return { type: 'reject', title: 'Nur Katalog', message: CATALOG_ONLY_MESSAGE };
  }
  return { type: 'confirm-foreign', message: `${FOREIGN_WARNING_MESSAGE}\n\n${trimmed}` };
}

/** New files replace the installed copy. Storage keys stay tied to the existing app id. */
export function mergeUpdatedApp(previous: MiniApp, fresh: MiniApp): MiniApp {
  return {
    ...fresh,
    id: previous.id,
    addedAt: previous.addedAt,
    folderId: previous.folderId,
    repoUrl: previous.repoUrl,
  };
}

export function reportMailto(app: { name: string; repoUrl: string; id: string; version?: string; commitSha?: string }): string {
  const subject = `EveryApp Meldung: ${app.name}`;
  const body = [
    'Ich möchte eine Mini-App melden.',
    '',
    `Name: ${app.name}`,
    `Repository: ${app.repoUrl}`,
    `App-ID: ${app.id}`,
    `Version: ${app.version || ''}`,
    `Commit: ${app.commitSha || ''}`,
    '',
    'Grund:',
    '',
  ].join('\n');
  return `mailto:${REPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
