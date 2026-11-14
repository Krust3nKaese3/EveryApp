/**
 * Autoritative Raumlogik. Spieler sprechen nicht direkt miteinander.
 * Nachrichten bleiben in dieser Mini-App und in diesem Token.
 */
import { MP_LIMITS, PlayerView, assertPayload, playerName } from './protocol';
import { sameSecret } from './guard';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface AdmitInput {
  appId: string;
  room: string;
  token: string;
  name: string;
  playerId?: string;
  secret?: string;
}

export type AdmitResult =
  | { ok: true; player: PlayerView; secret: string; resumed: boolean }
  | { ok: false; code: string; message: string };

interface Member extends PlayerView {
  secret: string;
  lastSeen: number;
  disconnectedAt: number | null;
  stamps: number[];
}

export interface RelayResult {
  seq: number;
  from: string;
  data: unknown;
  targets: string[];
}

function hex(random: () => number, bytes: number): string {
  let out = '';
  for (let i = 0; i < bytes * 2; i++) out += Math.floor(random() * 16).toString(16);
  return out;
}

function roomCode(random: () => number): string {
  let out = '';
  for (let i = 0; i < 4; i++) out += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return out;
}

export interface RoomMemberSeed {
  id: string;
  secret: string;
  name: string;
  host: boolean;
}

export interface RoomSnapshot {
  appId: string;
  roomCode: string;
  roomId: string;
  token: string;
  maxPlayers: number;
  members: RoomMemberSeed[];
}

export class GameRoom {
  readonly appId: string;
  readonly roomCode: string;
  readonly roomId: string;
  readonly token: string;
  readonly maxPlayers: number;
  private members: Member[] = [];
  private seq = 0;
  private random: () => number;

  constructor(opts: {
    appId: string;
    maxPlayers: number;
    hostName: string;
    now: number;
    random?: () => number;
    restore?: RoomSnapshot;
  }) {
    this.random = opts.random || Math.random;
    this.appId = opts.appId;
    const cap = Math.floor(opts.maxPlayers);
    this.maxPlayers = Math.min(MP_LIMITS.maxPlayers, Math.max(MP_LIMITS.minPlayers, Number.isFinite(cap) ? cap : MP_LIMITS.defaultPlayers));
    if (opts.restore) {
      this.roomCode = opts.restore.roomCode;
      this.roomId = opts.restore.roomId;
      this.token = opts.restore.token;
      this.members = opts.restore.members.map((member) => ({
        id: member.id,
        secret: member.secret,
        name: playerName(member.name),
        host: member.host,
        connected: member.host,
        lastSeen: opts.now,
        disconnectedAt: member.host ? null : opts.now,
        stamps: [],
      }));
      return;
    }
    this.roomCode = roomCode(this.random);
    this.token = hex(this.random, 8);
    this.roomId = hex(this.random, 8);
    this.members.push({
      id: this.freshId(),
      secret: hex(this.random, 8),
      name: playerName(opts.hostName),
      host: true,
      connected: true,
      lastSeen: opts.now,
      disconnectedAt: null,
      stamps: [],
    });
  }

  get hostId(): string {
    return this.members.find((member) => member.host)?.id || '';
  }

  players(): PlayerView[] {
    return this.members.map(viewOf);
  }

  /** Für den App-Speicher. Die Mini-App bekommt diese Secrets nicht. */
  exportMembers(): RoomMemberSeed[] {
    return this.members.map((member) => ({ id: member.id, secret: member.secret, name: member.name, host: member.host }));
  }

  /** Nach Zustimmung, ohne Token vom Gast. Der Aufrufer hat Raum-Id und App schon geprüft. */
  admitApproved(name: string, now: number): AdmitResult {
    if (this.members.length >= this.maxPlayers) return { ok: false, code: 'full', message: 'Der Raum ist voll.' };
    const member: Member = {
      id: this.freshId(),
      secret: hex(this.random, 8),
      name: playerName(name),
      host: false,
      connected: true,
      lastSeen: now,
      disconnectedAt: null,
      stamps: [],
    };
    this.members.push(member);
    return { ok: true, player: viewOf(member), secret: member.secret, resumed: false };
  }

  admit(input: AdmitInput, now: number): AdmitResult {
    const roomOk = sameSecret(input.room, this.roomCode);
    const tokenOk = sameSecret(input.token, this.token);
    const appOk = sameSecret(input.appId, this.appId);
    if (!roomOk || !tokenOk || !appOk) {
      return { ok: false, code: 'auth', message: 'Raumcode oder Token passt nicht.' };
    }
    if (input.playerId) {
      const existing = this.members.find((member) => member.id === input.playerId);
      const known = existing && !existing.host ? existing.secret : '0000000000000000';
      const secretOk = sameSecret(input.secret || '', known) && !!existing && !existing.host;
      if (!secretOk || !existing || existing.host) {
        return { ok: false, code: 'auth', message: 'Raumcode oder Token passt nicht.' };
      }
      if (existing.connected) return { ok: false, code: 'busy', message: 'Dieser Spieler ist schon verbunden.' };
      existing.connected = true;
      existing.disconnectedAt = null;
      existing.lastSeen = now;
      return { ok: true, player: viewOf(existing), secret: existing.secret, resumed: true };
    }
    if (this.members.length >= this.maxPlayers) return { ok: false, code: 'full', message: 'Der Raum ist voll.' };
    const member: Member = {
      id: this.freshId(),
      secret: hex(this.random, 8),
      name: playerName(input.name),
      host: false,
      connected: true,
      lastSeen: now,
      disconnectedAt: null,
      stamps: [],
    };
    this.members.push(member);
    return { ok: true, player: viewOf(member), secret: member.secret, resumed: false };
  }

  seen(playerId: string, now: number): void {
    const member = this.members.find((item) => item.id === playerId);
    if (!member || !member.connected) return;
    member.lastSeen = now;
  }

  /** Socket zu. Der Platz bleibt, bis der Gast geht oder der Host den Raum beendet. */
  disconnect(playerId: string, now: number): boolean {
    const member = this.members.find((item) => item.id === playerId);
    if (!member || member.host || !member.connected) return false;
    member.connected = false;
    member.disconnectedAt = now;
    return true;
  }

  leave(playerId: string): boolean {
    const member = this.members.find((item) => item.id === playerId);
    if (!member || member.host) return false;
    this.members = this.members.filter((item) => item.id !== playerId);
    return true;
  }

  /**
   * Stille Verbindungen werden getrennt. Der Spieler bleibt in der Liste.
   * `drop` sind Spieler, deren Socket jetzt zu soll.
   */
  tick(now: number): { changed: boolean; drop: string[] } {
    const drop: string[] = [];
    let changed = false;
    for (const member of [...this.members]) {
      if (member.host) continue;
      if (member.connected && now - member.lastSeen >= MP_LIMITS.timeoutMs) {
        member.connected = false;
        member.disconnectedAt = now;
        changed = true;
        drop.push(member.id);
      }
    }
    return { changed, drop };
  }

  relay(fromId: string, data: unknown, to?: string, now = Date.now()): RelayResult {
    const from = this.members.find((member) => member.id === fromId && member.connected);
    if (!from) throw new Error('Du bist nicht in diesem Raum.');
    if (!this.takeMessage(from, now)) throw new Error('Zu viele Nachrichten.');
    const clean = assertPayload(data);
    let targets: Member[];
    if (to) {
      const dest = this.members.find((member) => member.id === to && member.connected);
      if (!dest) throw new Error('Empfänger ist nicht verbunden.');
      if (dest.id === from.id) throw new Error('Eine Nachricht an sich selbst geht nicht.');
      targets = [dest];
    } else if (from.host) {
      throw new Error('Der Host braucht einen Empfänger oder broadcast.');
    } else {
      const host = this.members.find((member) => member.host && member.connected);
      targets = host ? [host] : [];
    }
    this.seq += 1;
    return { seq: this.seq, from: from.id, data: clean, targets: targets.map((member) => member.id) };
  }

  broadcast(fromId: string, data: unknown, now = Date.now()): RelayResult {
    const from = this.members.find((member) => member.id === fromId && member.connected);
    if (!from) throw new Error('Du bist nicht in diesem Raum.');
    if (!this.takeMessage(from, now)) throw new Error('Zu viele Nachrichten.');
    const clean = assertPayload(data);
    const targets = this.members.filter((member) => member.connected && member.id !== from.id);
    this.seq += 1;
    return { seq: this.seq, from: from.id, data: clean, targets: targets.map((member) => member.id) };
  }

  private freshId(): string {
    for (let i = 0; i < 8; i++) {
      const id = hex(this.random, 4);
      if (!this.members.some((member) => member.id === id)) return id;
    }
    return hex(this.random, 8);
  }

  private takeMessage(member: Member, now: number): boolean {
    member.stamps = member.stamps.filter((stamp) => now - stamp < MP_LIMITS.messageWindowMs);
    if (member.stamps.length >= MP_LIMITS.maxMessagesPer10s) return false;
    member.stamps.push(now);
    return true;
  }
}

function viewOf(member: Member): PlayerView {
  return { id: member.id, name: member.name, host: member.host, connected: member.connected };
}
