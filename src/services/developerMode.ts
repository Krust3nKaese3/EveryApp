/**
 * Own-repo developer mode for catalog-only builds (the iOS / production-catalog flag).
 * Pure checks: no network, no token values kept here. Callers pass the login GitHub returned.
 */
import { githubRepoKey } from './deepLinks';

export type MiniAppOrigin = 'catalog' | 'developer' | 'free';

export const SIGN_IN_MESSAGE =
  'Im Entwicklermodus kannst du nur Repositories laden, die deinem GitHub-Konto gehören. Melde dich dafür an.';

export const OWN_REPO_MESSAGE =
  'Dieses Repository gehört nicht zum angemeldeten GitHub-Konto. Fremde Links, QR-Codes und Add-Links werden nicht installiert. Jede Person kann nur die eigenen Repositories auf dem eigenen Gerät ausführen.';

export const DEV_MODE_OFF_MESSAGE =
  'Der Entwicklermodus ist aus. Schalte ihn ein und melde dich mit dem GitHub-Konto an, dem dieses Repository gehört.';

export const SIGNED_OUT_MESSAGE =
  'Abmelden deaktiviert Mini-Apps aus dem Entwicklermodus. Melde dich wieder mit dem GitHub-Konto an, dem das Repository gehört.';

/** GitHub logins are case-insensitive. Empty is never a match. */
export function normalizeLogin(login: string | null | undefined): string {
  return String(login || '').trim().toLowerCase();
}

export function ownsRepo(authenticatedLogin: string | null | undefined, repoOwnerLogin: string | null | undefined): boolean {
  const user = normalizeLogin(authenticatedLogin);
  const owner = normalizeLogin(repoOwnerLogin);
  return user.length > 0 && user === owner;
}

/** Owner segment of a GitHub repo URL, lowercased, or null. */
export function urlOwnerLogin(repoUrl: string): string | null {
  const key = githubRepoKey(repoUrl);
  if (!key) return null;
  const owner = key.split('/')[0];
  return owner || null;
}

export function urlOwnedBy(authenticatedLogin: string | null | undefined, repoUrl: string): boolean {
  return ownsRepo(authenticatedLogin, urlOwnerLogin(repoUrl));
}

export function parseAuthenticatedUser(body: unknown): string {
  const login = body && typeof body === 'object' ? (body as { login?: unknown }).login : undefined;
  if (typeof login !== 'string' || !/^[A-Za-z0-9-]{1,39}$/.test(login) || login.startsWith('-') || login.endsWith('-')) {
    throw new Error('GitHub-Antwort enthält keinen Benutzernamen.');
  }
  return login;
}

/** `owner.login` from GET /repos/{owner}/{repo}. Organizations do not match a user login. */
export function parseRepoOwner(body: unknown): string {
  const owner = body && typeof body === 'object' ? (body as { owner?: unknown }).owner : undefined;
  const login = owner && typeof owner === 'object' ? (owner as { login?: unknown }).login : undefined;
  if (typeof login !== 'string' || !login.trim()) {
    throw new Error('GitHub-Antwort enthält keinen Repository-Besitzer.');
  }
  return login.trim();
}

export function normalizeAccessToken(raw: string): string {
  const token = String(raw || '').trim();
  if (token.length < 20 || token.length > 512 || /\s/.test(token) || /^https?:/i.test(token)) {
    throw new Error('Das Token hat nicht das erwartete Format. Es wird nicht gespeichert.');
  }
  return token;
}

/** Public OAuth App client id. Device Flow is enabled. Not a client secret. */
export const DEFAULT_GITHUB_CLIENT_ID = 'Ov23liZBUKxpmryUJW1a';

/** Empty, or a placeholder the builder has not replaced, means "use the default". */
export function configuredGithubClientId(value: string | undefined | null): string {
  const id = String(value || '').trim();
  if (!id || /bitte/i.test(id) || id.toLowerCase() === 'unset') return '';
  return id;
}

/** Env wins when it is a real client id. Otherwise the public default above. */
export function resolveGithubClientId(value: string | undefined | null): string {
  return configuredGithubClientId(value) || DEFAULT_GITHUB_CLIENT_ID;
}

/**
 * Metro inlines only a direct `process.env.EXPO_PUBLIC_…` read.
 * app.config.js sets the same default when the variable is unset, and eas.json sets it on every profile.
 * A personal access token still works. Never put a client secret in the app.
 */
export function githubOAuthClientId(): string {
  return resolveGithubClientId(process.env.EXPO_PUBLIC_GITHUB_CLIENT_ID);
}

export interface DeviceStart {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

export function parseDeviceStart(body: unknown): DeviceStart {
  if (!body || typeof body !== 'object') throw new Error('GitHub hat keinen Gerätecode geliefert.');
  const row = body as Record<string, unknown>;
  const deviceCode = typeof row.device_code === 'string' ? row.device_code : '';
  const userCode = typeof row.user_code === 'string' ? row.user_code : '';
  const verificationUri = typeof row.verification_uri === 'string' ? row.verification_uri : '';
  const expiresIn = typeof row.expires_in === 'number' && row.expires_in > 0 ? row.expires_in : 900;
  const interval = Math.max(5, typeof row.interval === 'number' ? row.interval : 5);
  if (!deviceCode || !userCode || !verificationUri.startsWith('https://github.com/')) {
    throw new Error('GitHub hat keinen Gerätecode geliefert.');
  }
  return { deviceCode, userCode, verificationUri, expiresIn, interval };
}

export type DevicePoll =
  | { status: 'pending' }
  | { status: 'slow_down'; interval: number }
  | { status: 'success'; accessToken: string }
  | { status: 'denied' | 'expired' | 'error'; message: string };

/** Does not copy GitHub's error_description. The access token is only returned on success. */
export function parseDevicePoll(body: unknown): DevicePoll {
  if (!body || typeof body !== 'object') return { status: 'error', message: 'GitHub-Antwort war leer.' };
  const row = body as Record<string, unknown>;
  if (typeof row.access_token === 'string' && row.access_token) {
    return { status: 'success', accessToken: row.access_token };
  }
  const error = typeof row.error === 'string' ? row.error : '';
  if (error === 'authorization_pending') return { status: 'pending' };
  if (error === 'slow_down') {
    const interval = typeof row.interval === 'number' ? row.interval : 10;
    return { status: 'slow_down', interval: Math.max(5, interval) };
  }
  if (error === 'access_denied') return { status: 'denied', message: 'Die Anmeldung wurde abgebrochen.' };
  if (error === 'expired_token' || error === 'token_expired') {
    return { status: 'expired', message: 'Der Code ist abgelaufen. Bitte erneut starten.' };
  }
  return { status: 'error', message: 'GitHub-Anmeldung fehlgeschlagen.' };
}

export type InstalledAccess =
  | { allowed: true; verifyOwnership: boolean }
  | { allowed: false; reason: string };

/**
 * Catalog-only builds open catalog apps without a GitHub session.
 * Developer-mode apps additionally need the toggle, the same login that installed them,
 * and a later API check (`verifyOwnership`). Flag off: same as before, no ownership gate.
 */
export function installedAppAccess(
  app: { origin?: MiniAppOrigin; ownerLogin?: string; repoUrl: string },
  opts: { catalogOnly: boolean; developerMode: boolean; signedInLogin: string | null | undefined; inCatalog: boolean },
): InstalledAccess {
  if (!opts.catalogOnly) return { allowed: true, verifyOwnership: false };
  const catalogApp = app.origin === 'catalog' || (app.origin !== 'developer' && app.origin !== 'free' && opts.inCatalog);
  if (catalogApp) return { allowed: true, verifyOwnership: false };
  if (app.origin !== 'developer') {
    return { allowed: false, reason: 'Diese Mini-App stammt nicht aus dem Katalog und ist in dieser Version nicht verfügbar.' };
  }
  if (!opts.developerMode) return { allowed: false, reason: DEV_MODE_OFF_MESSAGE };
  if (!normalizeLogin(opts.signedInLogin)) return { allowed: false, reason: SIGNED_OUT_MESSAGE };
  if (!ownsRepo(opts.signedInLogin, app.ownerLogin) || !urlOwnedBy(opts.signedInLogin, app.repoUrl)) {
    return { allowed: false, reason: OWN_REPO_MESSAGE };
  }
  return { allowed: true, verifyOwnership: true };
}
