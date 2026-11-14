/**
 * Typen für Mini-App-Autoren. Zur Laufzeit hängt dasselbe Objekt an window.EveryAppBridge.multiplayer.
 * Siehe docs/MULTIPLAYER.md.
 */
export interface MultiplayerPlayer {
  id: string;
  name: string;
  host: boolean;
  connected: boolean;
}

export interface MultiplayerState {
  roomCode: string;
  qrPayload: string;
  playerId: string;
  players: MultiplayerPlayer[];
}

export interface MultiplayerMessage {
  from: string;
  data: unknown;
}

export interface MultiplayerRoster {
  players: MultiplayerPlayer[];
  selfId: string;
  roomCode: string;
}

export interface MultiplayerBridge {
  host(opts?: { maxPlayers?: number; name?: string }): Promise<MultiplayerState>;
  join(input: string | { scan?: boolean; payload?: string; qrPayload?: string; name?: string }): Promise<MultiplayerState>;
  send(data: unknown, opts?: { to?: string }): Promise<{ seq: number }>;
  broadcast(data: unknown): Promise<{ seq: number }>;
  onMessage(cb: (message: MultiplayerMessage) => void): () => void;
  onPlayersChanged(cb: (roster: MultiplayerRoster) => void): () => void;
  leave(): Promise<{ left: boolean }>;
  showQr(): Promise<{ roomCode: string; qrPayload: string }>;
}

export const MULTIPLAYER_BRIDGE_METHODS = [
  'host',
  'join',
  'send',
  'broadcast',
  'onMessage',
  'onPlayersChanged',
  'leave',
  'showQr',
] as const;
