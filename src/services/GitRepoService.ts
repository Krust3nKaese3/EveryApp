import * as FileSystem from 'expo-file-system/legacy';
import { MiniAppManifest, MiniApp } from '../types';
import {
  listMiniAppFiles,
  MINIAPP_LIMITS,
  normalizeEntrypoint,
  parseGitHubRepo,
} from './miniAppFiles';
import { GITHUB_API_HEADERS, commitApiUrl, githubRawUrlAtRef, parseCommitSha, treeApiUrl } from './githubPin';

const APPS_DIR = `${FileSystem.documentDirectory}miniapps/`;

type GitTreeResponse = {
  truncated?: boolean;
  message?: string;
  tree?: { path: string; mode: string; type: string; size?: number }[];
};

export class GitRepoService {
  static async fetchRepo(repoUrl: string, options?: { token?: string }): Promise<MiniApp> {
    const { owner, repo } = parseGitHubRepo(repoUrl);
    const appId = this.generateAppId(repoUrl);
    const token = options?.token;
    const commitSha = await this.fetchCommitSha(owner, repo, token);
    const tree = await this.fetchTree(owner, repo, commitSha, token);
    if (tree.truncated) {
      throw new Error('Repository tree is too large to install. Keep the mini-app in a smaller repository.');
    }
    const { files } = listMiniAppFiles(tree.tree || []);

    const staging = `${APPS_DIR}${appId}.staging/`;
    const backup = `${APPS_DIR}${appId}.backup/`;
    const finalPath = `${APPS_DIR}${appId}/`;
    await FileSystem.deleteAsync(staging, { idempotent: true });
    await FileSystem.makeDirectoryAsync(staging, { intermediates: true });

    try {
      await mapPool(files, 4, async (file) => {
        const dest = `${staging}${file.rel}`;
        const parent = dest.slice(0, dest.lastIndexOf('/'));
        await FileSystem.makeDirectoryAsync(parent, { intermediates: true });
        await FileSystem.deleteAsync(dest, { idempotent: true });
        // SHA URL: raw.githubusercontent.com caches /main/ and ignores ?t= cache busters.
        const result = await FileSystem.downloadAsync(
          githubRawUrlAtRef(owner, repo, commitSha, file.path),
          dest,
          { headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache', ...GitRepoService.authHeaders(token) } },
        );
        if (result.status < 200 || result.status >= 300) {
          throw new Error(`Failed to download ${file.rel} (${result.status})`);
        }
      });

      let total = 0;
      for (const file of files) {
        const info = await FileSystem.getInfoAsync(`${staging}${file.rel}`);
        const size = info.exists && !info.isDirectory && typeof info.size === 'number' ? info.size : 0;
        if (size > MINIAPP_LIMITS.maxFileBytes) {
          throw new Error(`A file exceeds the ${MINIAPP_LIMITS.maxFileBytes} byte limit.`);
        }
        total += size;
      }
      if (total > MINIAPP_LIMITS.maxTotalBytes) {
        throw new Error(`Mini-app exceeds the ${MINIAPP_LIMITS.maxTotalBytes} byte download limit.`);
      }

      const manifestRaw = await FileSystem.readAsStringAsync(`${staging}everyapp.json`);
      let manifest: MiniAppManifest;
      try {
        manifest = JSON.parse(manifestRaw);
      } catch {
        throw new Error('everyapp.json is not valid JSON');
      }
      if (!manifest || typeof manifest !== 'object' || typeof manifest.entrypoint !== 'string') {
        throw new Error('Entrypoint missing in everyapp.json');
      }
      const entryRel = normalizeEntrypoint(manifest.entrypoint);
      const entryInfo = await FileSystem.getInfoAsync(`${staging}${entryRel}`);
      if (!entryInfo.exists || entryInfo.isDirectory) {
        throw new Error(`Entrypoint ${manifest.entrypoint} not found in repository`);
      }

      await FileSystem.deleteAsync(backup, { idempotent: true });
      const existing = await FileSystem.getInfoAsync(finalPath);
      if (existing.exists) await FileSystem.moveAsync({ from: finalPath, to: backup });
      try {
        await FileSystem.moveAsync({ from: staging, to: finalPath });
      } catch (moveError) {
        const rolled = await FileSystem.getInfoAsync(finalPath);
        if (!rolled.exists) {
          const backupInfo = await FileSystem.getInfoAsync(backup);
          if (backupInfo.exists) await FileSystem.moveAsync({ from: backup, to: finalPath });
        }
        throw moveError;
      }
      await FileSystem.deleteAsync(backup, { idempotent: true });

      return {
        id: appId,
        repoUrl,
        manifest,
        localPath: finalPath,
        addedAt: Date.now(),
        folderId: null,
        commitSha,
      };
    } catch (error) {
      await FileSystem.deleteAsync(staging, { idempotent: true });
      throw error;
    }
  }

  /** Latest commit on `main`. Used by install, update, and the update check. */
  static async latestCommit(repoUrl: string, options?: { token?: string }): Promise<string> {
    const { owner, repo } = parseGitHubRepo(repoUrl);
    return this.fetchCommitSha(owner, repo, options?.token);
  }

  private static authHeaders(token?: string): Record<string, string> {
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  }

  private static async fetchCommitSha(owner: string, repo: string, token?: string): Promise<string> {
    const response = await this.githubGet(commitApiUrl(owner, repo), token);
    if (response.status === 404) {
      throw new Error('Repository oder Branch main nicht gefunden. Nur öffentliche GitHub-Repositories mit Branch main.');
    }
    return parseCommitSha(await response.json());
  }

  private static async fetchTree(owner: string, repo: string, sha: string, token?: string): Promise<GitTreeResponse> {
    const response = await this.githubGet(treeApiUrl(owner, repo, sha), token);
    if (response.status === 404) {
      throw new Error('Repository oder Branch main nicht gefunden. Nur öffentliche GitHub-Repositories mit Branch main.');
    }
    return response.json();
  }

  private static async githubGet(url: string, token?: string): Promise<Response> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20_000);
    try {
      const response = await fetch(url, {
        headers: { ...GITHUB_API_HEADERS, ...this.authHeaders(token) },
        signal: ctrl.signal,
      });
      if (response.status === 401) {
        throw new Error('GitHub hat die Anmeldung abgelehnt. Bitte im Entwicklermodus erneut anmelden.');
      }
      if (response.status === 403 || response.status === 429) {
        throw new Error('GitHub-API-Limit erreicht. Bitte später erneut versuchen.');
      }
      if (!response.ok && response.status !== 404) {
        throw new Error(`GitHub-Anfrage fehlgeschlagen (${response.status}).`);
      }
      return response;
    } finally {
      clearTimeout(timer);
    }
  }

  private static generateAppId(repoUrl: string): string {
    return repoUrl
      .replace(/https?:\/\//, '')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .toLowerCase();
  }

  static async getLocalEntrypointPath(app: MiniApp): Promise<string> {
    return `${app.localPath}${app.manifest.entrypoint}`;
  }

  static async deleteApp(app: MiniApp): Promise<void> {
    await this.deleteStoredApp(app.id);
    if (app.localPath) await FileSystem.deleteAsync(app.localPath, { idempotent: true });
  }

  /** Installed copy plus the staging and backup directories used during download. */
  static async deleteStoredApp(appId: string): Promise<void> {
    await FileSystem.deleteAsync(`${APPS_DIR}${appId}/`, { idempotent: true });
    await FileSystem.deleteAsync(`${APPS_DIR}${appId}.staging/`, { idempotent: true });
    await FileSystem.deleteAsync(`${APPS_DIR}${appId}.backup/`, { idempotent: true });
  }
}

async function mapPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  if (items.length === 0) return;
  let next = 0;
  let failure: unknown = null;
  const worker = async () => {
    while (failure == null && next < items.length) {
      const index = next++;
      try {
        await fn(items[index]);
      } catch (error) {
        failure = error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  if (failure) throw failure;
}
