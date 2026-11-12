/** Spotify Client-ID helpers. Precedence and wording are mirrored in the Kotlin module. */

export const SPOTIFY_REDIRECT_URI = 'everyapp://spotify-callback';

export const SPOTIFY_DASHBOARD_URL = 'https://developer.spotify.com/dashboard';

/** Production package from app.json. app.config.js keeps this when APP_VARIANT is not "development". */
export const PRODUCTION_ANDROID_PACKAGE = 'com.everyapp.container';

/** SrvEveryApp. app.config.js appends ".dev" when APP_VARIANT=development. */
export const DEVELOPMENT_ANDROID_PACKAGE = 'com.everyapp.container.dev';

/**
 * Public SHA-1 of the debug keystore used to sign the current SrvEveryApp APK.
 * Colon form, as the Dashboard field "Package SHA1 fingerprint" shows it.
 * The same fingerprint without colons is also accepted. Not a secret.
 * The production signing SHA-1 is not in this repo.
 */
export const DEVELOPMENT_DEBUG_SHA1 = '5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25';

export type SpotifyAndroidVariant = 'development' | 'production' | 'unknown';

export interface SpotifyAndroidDashboardTarget {
  variant: SpotifyAndroidVariant;
  appName: string;
  /** null when the running package could not be read. */
  packageName: string | null;
  /**
   * Colon-form SHA-1 to paste, or null when this build's signing fingerprint
   * is not stored in the repo (production, or an unrecognized package).
   */
  sha1: string | null;
}

/**
 * Package name + SHA-1 for the Spotify Dashboard "Android packages" row.
 * Matches the running variant: development gets the known debug fingerprint,
 * production never receives that debug value.
 */
export function spotifyAndroidDashboardTarget(packageName: unknown): SpotifyAndroidDashboardTarget {
  const pkg = String(packageName ?? '').trim();
  if (pkg === DEVELOPMENT_ANDROID_PACKAGE) {
    return { variant: 'development', appName: 'SrvEveryApp', packageName: pkg, sha1: DEVELOPMENT_DEBUG_SHA1 };
  }
  if (pkg === PRODUCTION_ANDROID_PACKAGE) {
    return { variant: 'production', appName: 'EveryApp', packageName: pkg, sha1: null };
  }
  return { variant: 'unknown', appName: 'EveryApp', packageName: pkg || null, sha1: null };
}

type ExpoPackageConstants = {
  expoConfig?: { android?: { package?: string | null } | null } | null;
  manifest?: { android?: { package?: string | null } | null } | null;
  manifest2?: { extra?: { expoClient?: { android?: { package?: string | null } | null } | null } | null } | null;
};

/** android.package written by app.config.js (APP_VARIANT → com.everyapp.container or .dev). */
export function androidPackageFromExpoConstants(constants: ExpoPackageConstants | null | undefined): string | null {
  const candidates = [
    constants?.expoConfig?.android?.package,
    constants?.manifest2?.extra?.expoClient?.android?.package,
    constants?.manifest?.android?.package,
  ];
  for (const value of candidates) {
    const pkg = String(value ?? '').trim();
    if (pkg) return pkg;
  }
  return null;
}

function readNativeApplicationId(): string | null {
  try {
    // Already part of the Expo SDK. The id is the package of the APK that is running.
    const mod = require('expo-application');
    const id = mod?.applicationId ?? mod?.default?.applicationId;
    const pkg = String(id ?? '').trim();
    return pkg || null;
  } catch {
    return null;
  }
}

/**
 * Package of the app that is open now.
 * Prefer the native applicationId (the variant app.config.js baked into this APK).
 * Fall back to the same android.package field in the Expo config.
 */
export function readRunningAndroidPackage(): string | null {
  const nativeId = readNativeApplicationId();
  if (nativeId) return nativeId;
  try {
    const Constants = require('expo-constants').default;
    return androidPackageFromExpoConstants(Constants);
  } catch {
    return null;
  }
}

export const MISSING_SPOTIFY_CLIENT_ID =
  'Keine Spotify Client ID hinterlegt. Bitte in den EveryApp-Einstellungen eintragen.';

export const BAD_SPOTIFY_CLIENT_ID =
  'Die Spotify Client ID muss 32 Hex-Zeichen aus dem Developer Dashboard sein.';

export const SPOTIFY_SEARCH_TYPES = ['track', 'artist', 'album', 'playlist', 'show', 'episode'] as const;

export type SpotifyClientIdSource = 'settings' | 'bridge' | 'prefill' | 'none';

export interface SpotifyClientIdInfo {
  clientId: string | null;
  source: SpotifyClientIdSource;
  settingsClientId: string | null;
  bridgeClientId: string | null;
  prefillClientId: string | null;
}

export interface SpotifySearchOptions {
  types?: string[];
  limit?: number;
  offset?: number;
}

export interface SpotifySearchRequest {
  query: string;
  types: string[];
  limit: number;
  offset: number;
}

const CLIENT_ID_RE = /^[0-9a-fA-F]{32}$/;

/** Empty is allowed when clearing a field. Otherwise the value must be the public dashboard Client ID. */
export function normalizeSpotifyClientId(raw: unknown, allowEmpty = false): string {
  const value = String(raw ?? '').trim();
  if (!value) {
    if (allowEmpty) return '';
    throw new Error(MISSING_SPOTIFY_CLIENT_ID);
  }
  if (!CLIENT_ID_RE.test(value)) throw new Error(BAD_SPOTIFY_CLIENT_ID);
  return value;
}

/**
 * Which Client ID login/connect/play will use.
 * 1. Value saved in the EveryApp settings screen (container).
 * 2. Value saved by a mini-app via spotify.setClientId.
 * 3. Optional build prefill (expo.extra.spotifyClientId / SPOTIFY_CLIENT_ID).
 */
export function resolveSpotifyClientId(input: {
  settings?: string | null;
  bridge?: string | null;
  prefill?: string | null;
}): { clientId: string | null; source: SpotifyClientIdSource } {
  const settings = String(input.settings ?? '').trim();
  const bridge = String(input.bridge ?? '').trim();
  const prefill = String(input.prefill ?? '').trim();
  if (settings) return { clientId: settings, source: 'settings' };
  if (bridge) return { clientId: bridge, source: 'bridge' };
  if (prefill) return { clientId: prefill, source: 'prefill' };
  return { clientId: null, source: 'none' };
}

export function shapeSpotifyClientId(raw: any): SpotifyClientIdInfo {
  const blank = (value: unknown) => {
    const text = String(value ?? '').trim();
    return text || null;
  };
  const settingsClientId = blank(raw?.settingsClientId ?? raw?.settings);
  const bridgeClientId = blank(raw?.bridgeClientId ?? raw?.bridge);
  const prefillClientId = blank(raw?.prefillClientId ?? raw?.prefill);
  const resolved = resolveSpotifyClientId({
    settings: settingsClientId,
    bridge: bridgeClientId,
    prefill: prefillClientId,
  });
  return { clientId: resolved.clientId, source: resolved.source, settingsClientId, bridgeClientId, prefillClientId };
}

export function normalizeSpotifySearch(query: unknown, options?: SpotifySearchOptions): SpotifySearchRequest {
  const q = String(query ?? '').trim();
  if (!q) throw new Error('Suchbegriff fehlt.');
  if (q.length > 200) throw new Error('Suchbegriff ist zu lang.');
  const types = (options?.types && options.types.length ? options.types : ['track']).map((type) => String(type).trim().toLowerCase());
  for (const type of types) {
    if (!(SPOTIFY_SEARCH_TYPES as readonly string[]).includes(type)) throw new Error(`Unbekannter Spotify-Suchtyp: ${type}`);
  }
  let limit = options?.limit ?? 10;
  if (!Number.isFinite(limit)) limit = 10;
  limit = Math.max(1, Math.min(50, Math.floor(limit)));
  let offset = options?.offset ?? 0;
  if (!Number.isFinite(offset)) offset = 0;
  offset = Math.max(0, Math.min(1000, Math.floor(offset)));
  return { query: q, types, limit, offset };
}

export function spotifyClientIdSourceLabel(source: SpotifyClientIdSource): string {
  switch (source) {
    case 'settings': return 'EveryApp-Einstellungen';
    case 'bridge': return 'Mini-App';
    case 'prefill': return 'Build-Prefill';
    default: return 'keine';
  }
}
