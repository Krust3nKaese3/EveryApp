/**
 * Was ein Gerät im WLAN über den Raum erfährt.
 * Der TXT-Record enthält kein Token, kein Spielergeheimnis und keine IP.
 * Die IP liefert mDNS selbst und bleibt im Container.
 */
import { playerName } from './protocol';

export const MDNS_TYPE = '_everyapp._tcp';

export interface ServiceTxt {
  v: '1';
  app: string;
  room: string;
  id: string;
  name: string;
  n: string;
  max: string;
}

export interface TxtInput {
  appId: string;
  roomCode: string;
  roomId: string;
  hostName: string;
  players: number;
  maxPlayers: number;
}

const FORBIDDEN = ['token', 'secret', 'ip', 'host', 'port', 'password'];

export function encodeServiceTxt(input: TxtInput): ServiceTxt {
  const app = String(input.appId || '').slice(0, 120);
  const room = String(input.roomCode || '').slice(0, 8);
  const id = String(input.roomId || '').slice(0, 64);
  if (!app || !room || !id) throw new Error('Ankündigung ist unvollständig.');
  const txt: ServiceTxt = {
    v: '1',
    app,
    room,
    id,
    name: playerName(input.hostName),
    n: String(Math.max(0, Math.floor(input.players))),
    max: String(Math.max(1, Math.floor(input.maxPlayers))),
  };
  for (const key of Object.keys(txt)) {
    if (FORBIDDEN.includes(key)) throw new Error('Ankündigung enthält ein verbotenes Feld.');
  }
  return txt;
}

export function txtHasSecret(value: Record<string, unknown>): boolean {
  const blob = JSON.stringify(value).toLowerCase();
  return FORBIDDEN.some((key) => Object.prototype.hasOwnProperty.call(value, key) || blob.includes(`"${key}"`));
}

export function readServiceTxt(raw: Record<string, unknown> | null | undefined): ServiceTxt | null {
  if (!raw || raw.v !== '1') return null;
  if (typeof raw.app !== 'string' || typeof raw.room !== 'string' || typeof raw.id !== 'string') return null;
  if (!raw.app || !raw.room || !raw.id) return null;
  return {
    v: '1',
    app: raw.app,
    room: raw.room,
    id: raw.id,
    name: playerName(raw.name),
    n: typeof raw.n === 'string' ? raw.n : '0',
    max: typeof raw.max === 'string' ? raw.max : '8',
  };
}

export interface VisibleRoom {
  id: string;
  roomId: string;
  roomCode: string;
  hostName: string;
  players: number;
  maxPlayers: number;
}

export interface DiscoveryPort {
  publish(name: string, port: number, txt: Record<string, string>): Promise<void>;
  unpublish(): Promise<void>;
  browse(onChange: (services: LanService[]) => void): Promise<void>;
  stopBrowse(): Promise<void>;
}

export interface LanService {
  key: string;
  host: string;
  port: number;
  txt: Record<string, unknown>;
}

/** Nur Räume derselben Mini-App. Die IP steht nicht in der Liste für die Mini-App. */
export function visibleRooms(services: LanService[], appId: string): VisibleRoom[] {
  const out: VisibleRoom[] = [];
  const seen = new Set<string>();
  for (const service of services) {
    const txt = readServiceTxt(service.txt);
    if (!txt || txt.app !== appId) continue;
    const id = `${txt.id}@${service.key}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      roomId: txt.id,
      roomCode: txt.room,
      hostName: txt.name,
      players: Number(txt.n) || 0,
      maxPlayers: Number(txt.max) || 0,
    });
  }
  return out;
}

export function matchRoom(services: LanService[], appId: string, roomId: string): LanService | null {
  for (const service of services) {
    const txt = readServiceTxt(service.txt);
    if (txt && txt.app === appId && txt.id === roomId) return service;
  }
  return null;
}
