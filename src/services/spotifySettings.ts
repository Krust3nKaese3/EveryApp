import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  parseSpotifyPayload,
  requireSpotifyNative,
  spotifyNativeAvailable,
} from '../../modules/expo-spotify';
import {
  MISSING_SPOTIFY_CLIENT_ID,
  SpotifyClientIdInfo,
  SpotifySearchOptions,
  normalizeSpotifyClientId,
  normalizeSpotifySearch,
  shapeSpotifyClientId,
} from './spotifyClientId';

const MIRROR_KEY = '@everyapp_spotify_settings_client_id';
let mirrorMigrated = false;

/** Optional build-time prefill. Empty is the normal case. null means "could not read config; do not overwrite". */
export function readSpotifyPrefill(): string | null {
  try {
    const Constants = require('expo-constants').default;
    if (!Constants) return null;
    const extra = Constants?.expoConfig?.extra ?? Constants?.manifest?.extra ?? {};
    const raw = String(extra?.spotifyClientId ?? '').trim();
    if (!raw) return '';
    return normalizeSpotifyClientId(raw);
  } catch (e: any) {
    console.warn('[EveryApp] spotify prefill ignoriert:', e?.message || e);
    return null;
  }
}

async function pushPrefill(native: any): Promise<void> {
  const prefill = readSpotifyPrefill();
  if (prefill === null) return;
  try {
    await native.setPrefillClientId(prefill);
  } catch (e: any) {
    console.warn('[EveryApp] spotify prefill:', e?.message || e);
  }
}

async function migrateMirror(native: any): Promise<void> {
  if (mirrorMigrated) return;
  mirrorMigrated = true;
  const snap = await native.getClientId();
  if (String(snap?.settingsClientId ?? '').trim()) return;
  const mirror = await AsyncStorage.getItem(MIRROR_KEY);
  if (!mirror) return;
  console.log('[EveryApp] spotify Client-ID aus dem Container-Speicher ins native Modul übernommen');
  await native.setSettingsClientId(mirror);
}

async function prepared(): Promise<any> {
  const native = requireSpotifyNative();
  await pushPrefill(native);
  await migrateMirror(native);
  return native;
}

export async function getSpotifyClientId(): Promise<SpotifyClientIdInfo> {
  const prefill = readSpotifyPrefill() ?? '';
  if (!spotifyNativeAvailable()) {
    const settings = await AsyncStorage.getItem(MIRROR_KEY);
    return shapeSpotifyClientId({ settingsClientId: settings, bridgeClientId: '', prefillClientId: prefill });
  }
  const native = await prepared();
  return shapeSpotifyClientId(await native.getClientId());
}

async function requireSavedClientId(): Promise<SpotifyClientIdInfo> {
  const info = await getSpotifyClientId();
  if (!info.clientId) {
    console.log('[EveryApp] spotify abgebrochen: keine Client-ID');
    throw new Error(MISSING_SPOTIFY_CLIENT_ID);
  }
  return info;
}

export async function setSpotifySettingsClientId(raw: string): Promise<SpotifyClientIdInfo & { needsBuild: boolean }> {
  const clean = normalizeSpotifyClientId(raw, true);
  console.log('[EveryApp] spotify Einstellungen Client-ID', clean ? 'gespeichert' : 'gelöscht');
  if (!spotifyNativeAvailable()) {
    await AsyncStorage.setItem(MIRROR_KEY, clean);
    return { ...(await getSpotifyClientId()), needsBuild: true };
  }
  const snap = shapeSpotifyClientId(await requireSpotifyNative().setSettingsClientId(clean));
  await AsyncStorage.setItem(MIRROR_KEY, clean);
  return { ...snap, needsBuild: false };
}

export async function setSpotifyBridgeClientId(raw: string): Promise<SpotifyClientIdInfo> {
  console.log('[EveryApp] spotify setClientId');
  const clean = normalizeSpotifyClientId(raw, true);
  const native = await prepared();
  return shapeSpotifyClientId(await native.setBridgeClientId(clean));
}

export async function spotifyIsAvailable() {
  console.log('[EveryApp] spotify isAvailable');
  if (!spotifyNativeAvailable()) return { installed: false, connected: false, authorized: false, premium: null as boolean | null };
  const native = await prepared();
  const raw = await native.isAvailable();
  return {
    installed: !!raw?.installed,
    connected: !!raw?.connected,
    authorized: !!raw?.authorized,
    premium: raw?.premiumKnown ? !!raw.premium : null,
  };
}

export async function spotifyLogin() {
  console.log('[EveryApp] spotify login');
  await requireSavedClientId();
  const native = await prepared();
  return native.login();
}

export async function spotifyLogout() {
  console.log('[EveryApp] spotify logout');
  if (!spotifyNativeAvailable()) return true;
  return prepared().then((native) => native.logout());
}

export async function spotifyConnect() {
  console.log('[EveryApp] spotify connect');
  await requireSavedClientId();
  const native = await prepared();
  return native.connect();
}

export async function spotifyDisconnect() {
  console.log('[EveryApp] spotify disconnect');
  if (!spotifyNativeAvailable()) return true;
  return prepared().then((native) => native.disconnect());
}

export async function spotifyPlay(uri: string, positionMs?: number) {
  console.log('[EveryApp] spotify play', uri, positionMs ?? 0);
  await requireSavedClientId();
  const native = await prepared();
  return parseSpotifyPayload(await native.play(String(uri ?? ''), Number(positionMs) || 0));
}

async function transport(action: 'pause' | 'resume' | 'stop' | 'skipNext' | 'skipPrevious') {
  console.log('[EveryApp] spotify', action);
  const native = await prepared();
  return parseSpotifyPayload(await native[action]());
}

export const spotifyPause = () => transport('pause');
export const spotifyResume = () => transport('resume');
export const spotifyStop = () => transport('stop');
export const spotifySkipNext = () => transport('skipNext');
export const spotifySkipPrevious = () => transport('skipPrevious');

export async function spotifySeek(positionMs: number) {
  console.log('[EveryApp] spotify seek', positionMs);
  const native = await prepared();
  return parseSpotifyPayload(await native.seek(Number(positionMs) || 0));
}

export async function spotifyGetPlayerState() {
  console.log('[EveryApp] spotify getPlayerState');
  const native = await prepared();
  return parseSpotifyPayload(await native.getPlayerState());
}

export async function spotifySearch(query: string, options?: SpotifySearchOptions) {
  const spec = normalizeSpotifySearch(query, options);
  console.log('[EveryApp] spotify search', spec.types.join(','), 'limit', spec.limit);
  await requireSavedClientId();
  const native = await prepared();
  return parseSpotifyPayload(await native.search(spec.query, JSON.stringify({
    types: spec.types,
    limit: spec.limit,
    offset: spec.offset,
  })));
}

export async function spotifyGetMe() {
  console.log('[EveryApp] spotify getMe');
  await requireSavedClientId();
  const native = await prepared();
  return parseSpotifyPayload(await native.getMe());
}

export async function spotifyGetMyPlaylists(limit = 20) {
  console.log('[EveryApp] spotify getMyPlaylists', limit);
  await requireSavedClientId();
  const native = await prepared();
  const n = Number.isFinite(limit) ? limit : 20;
  return parseSpotifyPayload(await native.getMyPlaylists(n));
}

export async function spotifyGetSavedTracks(limit = 20) {
  console.log('[EveryApp] spotify getSavedTracks', limit);
  await requireSavedClientId();
  const native = await prepared();
  const n = Number.isFinite(limit) ? limit : 20;
  return parseSpotifyPayload(await native.getSavedTracks(n));
}
