/** Pure Spotify helpers (no native). Precedence and wording are mirrored in the Kotlin module. */

export const SPOTIFY_REDIRECT_URI = 'everyapp://spotify-callback';

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
