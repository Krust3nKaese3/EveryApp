/**
 * GitHub session for developer mode. The token stays in SecretStore on this device.
 * EveryApp has no server that receives it. Sign-out deletes it.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SecretStore } from './SecretStore';
import { GITHUB_API_HEADERS } from './githubPin';
import { parseGitHubRepo } from './miniAppFiles';
import {
  DevicePoll,
  DeviceStart,
  normalizeAccessToken,
  ownsRepo,
  parseAuthenticatedUser,
  parseDevicePoll,
  parseDeviceStart,
  parseRepoOwner,
  urlOwnedBy,
  OWN_REPO_MESSAGE,
} from './developerMode';

const HOST_ID = 'everyapp_host';
const TOKEN_KEY = 'github_token';
const LOGIN_KEY = '@everyapp_github_login';
const MODE_KEY = '@everyapp_developer_mode';
const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const DEVICE_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const USER_URL = 'https://api.github.com/user';

export interface DeveloperSession {
  developerMode: boolean;
  login: string | null;
}

async function githubApi(url: string, token?: string, init?: RequestInit): Promise<Response> {
  const headers: Record<string, string> = { ...GITHUB_API_HEADERS };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (init?.headers) Object.assign(headers, init.headers);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    return await fetch(url, { ...init, headers, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export class GithubSession {
  static async load(): Promise<DeveloperSession> {
    const [modeRow, loginRow] = await AsyncStorage.multiGet([MODE_KEY, LOGIN_KEY]);
    const developerMode = modeRow?.[1] === '1';
    const storedLogin = (loginRow?.[1] || '').trim();
    const token = await SecretStore.get(HOST_ID, TOKEN_KEY);
    return { developerMode, login: token && storedLogin ? storedLogin : null };
  }

  static async setDeveloperMode(on: boolean): Promise<void> {
    await AsyncStorage.setItem(MODE_KEY, on ? '1' : '0');
  }

  static async getToken(): Promise<string | null> {
    return SecretStore.get(HOST_ID, TOKEN_KEY);
  }

  static async signOut(): Promise<void> {
    try { await SecretStore.delete(HOST_ID, TOKEN_KEY); } catch { /* already gone */ }
    await AsyncStorage.removeItem(LOGIN_KEY);
  }

  /** Checks the token with GET /user and stores login + token only after GitHub accepts it. */
  static async saveToken(rawToken: string): Promise<string> {
    const token = normalizeAccessToken(rawToken);
    const response = await githubApi(USER_URL, token);
    if (response.status === 401) throw new Error('GitHub hat das Token abgelehnt. Es wurde nicht gespeichert.');
    if (!response.ok) throw new Error(`GitHub-Anmeldung fehlgeschlagen (${response.status}).`);
    const login = parseAuthenticatedUser(await response.json());
    await SecretStore.set(HOST_ID, TOKEN_KEY, token);
    await AsyncStorage.setItem(LOGIN_KEY, login);
    return login;
  }

  static async beginDeviceFlow(clientId: string): Promise<DeviceStart> {
    const response = await fetch(DEVICE_CODE_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, scope: 'repo' }).toString(),
    });
    if (!response.ok) throw new Error(`GitHub-Gerätecode fehlgeschlagen (${response.status}).`);
    return parseDeviceStart(await response.json());
  }

  static async pollDeviceFlow(clientId: string, deviceCode: string): Promise<DevicePoll> {
    const response = await fetch(DEVICE_TOKEN_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }).toString(),
    });
    let body: unknown = null;
    try { body = await response.json(); } catch { body = null; }
    if (!response.ok && !(body && typeof body === 'object' && 'error' in body)) {
      return { status: 'error', message: `GitHub-Anmeldung fehlgeschlagen (${response.status}).` };
    }
    return parseDevicePoll(body);
  }

  /**
   * Add, update, and open of a developer-mode app. The URL owner and the owner
   * GitHub returns must both be the signed-in user. A rejected token signs out.
   */
  static async confirmOwnership(repoUrl: string): Promise<{ token: string; login: string; ownerLogin: string }> {
    const token = await this.getToken();
    const session = await this.load();
    if (!token || !session.login) throw new Error('Melde dich im Entwicklermodus mit deinem GitHub-Konto an.');
    if (!urlOwnedBy(session.login, repoUrl)) throw new Error(OWN_REPO_MESSAGE);
    const { owner, repo } = parseGitHubRepo(repoUrl);
    const response = await githubApi(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      token,
    );
    if (response.status === 401) {
      await this.signOut();
      throw new Error('GitHub hat die Anmeldung abgelehnt. Die Sitzung wurde beendet.');
    }
    if (response.status === 404) throw new Error('Repository nicht gefunden oder für dieses Konto nicht sichtbar.');
    if (!response.ok) throw new Error(`GitHub-Anfrage fehlgeschlagen (${response.status}).`);
    const ownerLogin = parseRepoOwner(await response.json());
    if (!ownsRepo(session.login, ownerLogin)) {
      throw new Error('GitHub bestätigt, dass dieses Repository nicht dem angemeldeten Konto gehört.');
    }
    return { token, login: session.login, ownerLogin };
  }
}
