import * as FileSystem from 'expo-file-system';
import { MiniAppManifest, MiniApp } from '../types';

const APPS_DIR = `${FileSystem.documentDirectory}miniapps/`;

export class GitRepoService {
  static async fetchRepo(repoUrl: string): Promise<MiniApp> {
    const appId = this.generateAppId(repoUrl);
    const localPath = `${APPS_DIR}${appId}/`;

    await FileSystem.makeDirectoryAsync(localPath, { intermediates: true });

    const manifestUrl = this.getGitHubRawUrl(repoUrl, 'everyapp.json');
    const manifestResponse = await fetch(manifestUrl);
    
    if (!manifestResponse.ok) {
      throw new Error('everyapp.json not found in repository');
    }

    const manifest: MiniAppManifest = await manifestResponse.json();

    const entrypointUrl = this.getGitHubRawUrl(repoUrl, manifest.entrypoint);
    const entrypointResponse = await fetch(entrypointUrl);
    
    if (!entrypointResponse.ok) {
      throw new Error(`Entrypoint ${manifest.entrypoint} not found in repository`);
    }

    const entrypointContent = await entrypointResponse.text();
    await FileSystem.writeAsStringAsync(
      `${localPath}${manifest.entrypoint}`,
      entrypointContent
    );

    if (manifest.icon) {
      try {
        const iconUrl = this.getGitHubRawUrl(repoUrl, manifest.icon);
        await FileSystem.downloadAsync(iconUrl, `${localPath}${manifest.icon}`);
      } catch (error) {
        console.warn('Failed to download icon:', error);
      }
    }

    return {
      id: appId,
      repoUrl,
      manifest,
      localPath,
      addedAt: Date.now(),
      folderId: null,
    };
  }

  private static getGitHubRawUrl(repoUrl: string, filePath: string): string {
    const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!match) {
      throw new Error('Invalid GitHub repository URL');
    }
    const [, owner, repo] = match;
    const cleanRepo = repo.replace(/\.git$/, '');
    return `https://raw.githubusercontent.com/${owner}/${cleanRepo}/main/${filePath}`;
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
