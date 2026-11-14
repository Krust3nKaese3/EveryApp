/**
 * NDJSON-Rahmen für den lokalen Mehrspieler-Raum.
 * Eine Zeile ist eine JSON-Nachricht. Der Host ist die einzige Stelle, die Spielnachrichten weiterleitet.
 */
import { utf8Bytes } from '../../bridge/allowlist';

export const MP_LIMITS = {
  version: 1,
  maxPayloadBytes: 32 * 1024,
  maxFrameBytes: 40 * 1024,
  maxPlayers: 16,
  minPlayers: 2,
  defaultPlayers: 8,
  maxNameChars: 24,
  maxDepth: 8,
  maxArray: 2000,
  heartbeatMs: 3_000,
  timeoutMs: 10_000,
  handshakeMs: 5_000,
  maxPending: 8,
  maxMessagesPer10s: 80,
  maxInboundPer10s: 100,
  messageWindowMs: 10_000,
  maxFramesPerChunk: 32,
  maxFailedHellos: 30,
  failureWindowMs: 60_000,
  lockoutMs: 30_000,
  maxQrChars: 2048,
  askWindowMs: 60_000,
  maxAsksPerAddress: 5,
  askLockoutMs: 60_000,
  askTimeoutMs: 30_000,
  maxPendingAsks: 4,
  roomTtlMs: 24 * 60 * 60 * 1000,
  resumeBackoffMs: 15_000,
};

export interface PlayerView {
  id: string;
  name: string;
  host: boolean;
  connected: boolean;
}

export interface HelloFrame {
  t: 'hello';
  v: 1;
  appId: string;
  room: string;
  token: string;
  name: string;
  playerId?: string;
  /** Nur beim Wiederverbinden. Steht nicht in der Spielerliste. */
  secret?: string;
}

export interface MsgFrame {
  t: 'msg';
  from?: string;
  to?: string;
  /** true: an alle anderen. Sonst nur an `to`, oder ohne `to` nur an den Host. */
  all?: boolean;
  data: unknown;
  seq?: number;
}

export interface AskFrame {
  t: 'ask';
  v: 1;
  appId: string;
  room: string;
  id: string;
  name: string;
}

export type WireFrame =
  | HelloFrame
  | AskFrame
  | { t: 'welcome'; playerId: string; secret: string; token?: string; roomId?: string; players: PlayerView[] }
  | { t: 'players'; players: PlayerView[] }
  | MsgFrame
  | { t: 'ping'; ts: number }
  | { t: 'pong'; ts: number }
  | { t: 'leave' }
  | { t: 'error'; code: string; message: string };

const TYPES = new Set(['hello', 'ask', 'welcome', 'players', 'msg', 'ping', 'pong', 'leave', 'error']);

export function encodeFrame(frame: WireFrame): string {
  return `${JSON.stringify(frame)}\n`;
}

export function decodeFrames(buffer: string): { frames: WireFrame[]; rest: string; error?: string } {
  if (buffer.length > MP_LIMITS.maxFrameBytes * 4) return { frames: [], rest: '', error: 'Rahmen zu groß.' };
  const lines = buffer.split('\n');
  const rest = lines.pop() ?? '';
  if (utf8Bytes(rest) > MP_LIMITS.maxFrameBytes) return { frames: [], rest: '', error: 'Rahmen zu groß.' };
  const frames: WireFrame[] = [];
  for (const line of lines) {
    if (!line) continue;
    if (utf8Bytes(line) > MP_LIMITS.maxFrameBytes) return { frames, rest: '', error: 'Rahmen zu groß.' };
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return { frames, rest: '', error: 'Kein JSON.' };
    }
    const frame = asFrame(parsed);
    if (!frame) return { frames, rest: '', error: 'Unbekannter Rahmen.' };
    frames.push(frame);
  }
  return { frames, rest };
}

function asFrame(value: unknown): WireFrame | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.t !== 'string' || !TYPES.has(row.t)) return null;
  if (row.t === 'hello') {
    if (row.v !== 1) return null;
    if (!short(row.appId, 200) || !short(row.room, 8) || !short(row.token, 64) || !short(row.name, 64)) return null;
    if (row.playerId != null && !short(row.playerId, 64)) return null;
    if (row.secret != null && !short(row.secret, 64)) return null;
    return {
      t: 'hello',
      v: 1,
      appId: row.appId,
      room: row.room,
      token: row.token,
      name: row.name,
      playerId: typeof row.playerId === 'string' ? row.playerId : undefined,
      secret: typeof row.secret === 'string' ? row.secret : undefined,
    };
  }
  if (row.t === 'ask') {
    if (row.v !== 1) return null;
    if (!short(row.appId, 200) || !short(row.room, 8) || !short(row.id, 64) || !short(row.name, 64)) return null;
    return { t: 'ask', v: 1, appId: row.appId, room: row.room, id: row.id, name: row.name };
  }
  if (row.t === 'welcome') {
    if (!short(row.playerId, 64) || !short(row.secret, 64) || !Array.isArray(row.players)) return null;
    if (row.token != null && !short(row.token, 64)) return null;
    if (row.roomId != null && !short(row.roomId, 64)) return null;
    const players = asPlayers(row.players);
    if (!players) return null;
    return {
      t: 'welcome',
      playerId: row.playerId,
      secret: row.secret,
      token: typeof row.token === 'string' ? row.token : undefined,
      roomId: typeof row.roomId === 'string' ? row.roomId : undefined,
      players,
    };
  }
  if (row.t === 'players') {
    if (!Array.isArray(row.players)) return null;
    const players = asPlayers(row.players);
    if (!players) return null;
    return { t: 'players', players };
  }
  if (row.t === 'msg') {
    if (row.from != null && !short(row.from, 64)) return null;
    if (row.to != null && !short(row.to, 64)) return null;
    if (row.all != null && typeof row.all !== 'boolean') return null;
    if (row.seq != null && (typeof row.seq !== 'number' || !Number.isFinite(row.seq))) return null;
    let data: unknown;
    try {
      data = assertPayload(row.data);
    } catch {
      return null;
    }
    return {
      t: 'msg',
      from: typeof row.from === 'string' ? row.from : undefined,
      to: typeof row.to === 'string' ? row.to : undefined,
      all: row.all === true ? true : undefined,
      data,
      seq: typeof row.seq === 'number' ? row.seq : undefined,
    };
  }
  if (row.t === 'ping' || row.t === 'pong') {
    if (typeof row.ts !== 'number' || !Number.isFinite(row.ts)) return null;
    return { t: row.t, ts: row.ts };
  }
  if (row.t === 'leave') return { t: 'leave' };
  if (row.t === 'error') {
    if (!short(row.code, 32) || !short(row.message, 300)) return null;
    return { t: 'error', code: row.code, message: row.message };
  }
  return null;
}

function asPlayers(value: unknown[]): PlayerView[] | null {
  if (value.length > MP_LIMITS.maxPlayers) return null;
  const players: PlayerView[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const row = item as Record<string, unknown>;
    if (!short(row.id, 64) || !short(row.name, 64) || typeof row.host !== 'boolean' || typeof row.connected !== 'boolean') return null;
    players.push({ id: row.id, name: row.name, host: row.host, connected: row.connected });
  }
  return players;
}

function short(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);

/** Prüft die Spielnachricht: JSON, begrenzte Tiefe, höchstens 32 KiB. */
export function assertPayload(value: unknown): unknown {
  const clean = sanitize(value, 0);
  const json = JSON.stringify(clean);
  if (utf8Bytes(json) > MP_LIMITS.maxPayloadBytes) throw new Error('Nachricht ist zu groß (höchstens 32 KiB).');
  return clean;
}

function sanitize(value: unknown, depth: number): unknown {
  if (depth > MP_LIMITS.maxDepth) throw new Error('Nachricht ist zu verschachtelt.');
  if (value == null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Nachricht enthält eine ungültige Zahl.');
    return value;
  }
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    if (value.length > MP_LIMITS.maxArray) throw new Error('Nachricht ist zu groß.');
    return value.map((item) => sanitize(item, depth + 1));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as object)) {
      if (FORBIDDEN.has(key)) throw new Error('Nachricht enthält ein unerlaubtes Feld.');
      out[key] = sanitize((value as Record<string, unknown>)[key], depth + 1);
    }
    return out;
  }
  throw new Error('Nachricht enthält einen nicht unterstützten Wert.');
}

export function playerName(value: unknown): string {
  const raw = typeof value === 'string' ? value : '';
  const cleaned = raw.replace(/[\u0000-\u001f<>&"'`]/g, '').trim().slice(0, MP_LIMITS.maxNameChars);
  return cleaned || 'Spieler';
}
