/**
 * Raumdaten liegen nur im Speicher der Container-App.
 * Die Mini-App sieht weder Token noch Spielergeheimnis.
 */
import { MP_LIMITS, playerName, type PlayerView } from './protocol';
import type { RoomMemberSeed } from './room';

export interface StoredRoom {
  role: 'host' | 'guest';
  appId: string;
  roomId: string;
  roomCode: string;
  token: string;
  hostName: string;
  maxPlayers: number;
  discoverable: boolean;
  joinApproval: boolean;
  selfId: string;
  secret: string;
  host: string;
  port: number;
  members: RoomMemberSeed[];
  roster?: PlayerView[];
  updatedAt: number;
}

export interface RoomStore {
  read(appId: string): Promise<StoredRoom | null>;
  write(room: StoredRoom): Promise<void>;
  delete(appId: string): Promise<void>;
}

export interface PublicResume {
  role: 'host' | 'guest';
  roomCode: string;
  selfId: string;
  players: PlayerView[];
  status: 'ready' | 'hostAway';
}

const SECRET_KEYS = ['token', 'secret', 'members'];

export function roomExpired(room: StoredRoom, now: number): boolean {
  return now - room.updatedAt >= MP_LIMITS.roomTtlMs;
}

export function publicResume(room: StoredRoom, status: PublicResume['status']): PublicResume {
  const players = room.roster?.length
    ? room.roster
    : room.role === 'host'
      ? room.members.map((member) => ({
        id: member.id,
        name: playerName(member.name),
        host: member.host,
        connected: member.host && status === 'ready',
      }))
      : [];
  return { role: room.role, roomCode: room.roomCode, selfId: room.selfId, players, status };
}

export function resumeLeaksSecrets(value: PublicResume): boolean {
  const blob = JSON.stringify(value);
  return SECRET_KEYS.some((key) => blob.includes(`"${key}"`));
}

export function createMemoryRoomStore(): RoomStore & { clear(): void } {
  const rows = new Map<string, StoredRoom>();
  return {
    async read(appId) {
      const row = rows.get(appId);
      return row ? { ...row, members: row.members.map((member) => ({ ...member })) } : null;
    },
    async write(room) {
      rows.set(room.appId, { ...room, members: room.members.map((member) => ({ ...member })) });
    },
    async delete(appId) {
      rows.delete(appId);
    },
    clear() {
      rows.clear();
    },
  };
}

export function loadUsable(room: StoredRoom | null, now: number): StoredRoom | null {
  if (!room) return null;
  if (roomExpired(room, now)) return null;
  if (!room.roomId || !room.token || !room.secret || !room.selfId) return null;
  return room;
}
