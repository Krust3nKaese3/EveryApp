import * as FileSystem from 'expo-file-system/legacy';
import { MiniAppManifest, MiniApp } from '../types';
import {
  githubRawUrl,
  listMiniAppFiles,
  MINIAPP_LIMITS,
  normalizeEntrypoint,
  parseGitHubRepo,
} from './miniAppFiles';

const APPS_DIR = `${FileSystem.documentDirectory}miniapps/`;

type GitTreeResponse = {
  truncated?: boolean;
  message?: string;
  tree?: { path: string; mode: string; type: string; size?: number }[];
};

export class GitRepoService {
  static async fetchRepo(repoUrl: string): Promise<MiniApp> {
    const { owner, repo } = parseGitHubRepo(repoUrl);
    const appId = this.generateAppId(repoUrl);
    const tree = await this.fetchTree(owner, repo);
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
      const cacheBust = Date.now();
      await mapPool(files, 4, async (file) => {
        const dest = `${staging}${file.rel}`;
        const parent = dest.slice(0, dest.lastIndexOf('/'));
        await FileSystem.makeDirectoryAsync(parent, { intermediates: true });
        const result = await FileSystem.downloadAsync(githubRawUrl(owner, repo, file.path, cacheBust), dest);
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
      };
    } catch (error) {
      await FileSystem.deleteAsync(staging, { idempotent: true });
      throw error;
    }
  }

  private static async fetchTree(owner: string, repo: string): Promise<GitTreeResponse> {
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/main?recursive=1`;
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'EveryApp',
      },
    });
    if (response.status === 403 || response.status === 429) {
      throw new Error('GitHub API rate limit reached. Try again later.');
    }
    if (response.status === 404) {
      throw new Error('Repository or main branch not found. Public GitHub repositories on branch main only.');
    }
    if (!response.ok) {
      throw new Error(`Failed to read repository tree (${response.status})`);
    }
    return response.json();
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
    await FileSystem.deleteAsync(app.localPath, { idempotent: true });
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
