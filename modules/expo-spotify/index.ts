import { requireOptionalNativeModule } from 'expo-modules-core';

const Native: any = requireOptionalNativeModule('ExpoSpotify');

export const SPOTIFY_NEEDS_BUILD = 'Spotify braucht den nächsten Build (natives Modul fehlt).';

export function spotifyNativeAvailable(): boolean {
  return !!Native;
}

export function requireSpotifyNative(): any {
  if (!Native) throw new Error(SPOTIFY_NEEDS_BUILD);
  return Native;
}

const NATIVE_EVENTS = {
  'spotify.connected': 'spotifyConnected',
  'spotify.disconnected': 'spotifyDisconnected',
  'spotify.player': 'spotifyPlayer',
  'spotify.error': 'spotifyError',
} as const;

export type SpotifyBridgeEvent = keyof typeof NATIVE_EVENTS;

export function subscribeSpotify(listener: (event: SpotifyBridgeEvent, data: any) => void): () => void {
  if (!Native?.addListener) return () => {};
  const subs = (Object.keys(NATIVE_EVENTS) as SpotifyBridgeEvent[]).map((event) =>
    Native.addListener(NATIVE_EVENTS[event], (payload: any) => {
      let data = payload;
      if (payload && typeof payload.json === 'string') {
        try { data = JSON.parse(payload.json); } catch { data = payload; }
      }
      listener(event, data);
    })
  );
  return () => { subs.forEach((sub: any) => sub?.remove?.()); };
}

export function parseSpotifyPayload(value: any): any {
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
}
