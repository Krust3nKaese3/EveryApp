/**
 * Eine Sitzung pro Gerät. Der Host verteilt JSON-Nachrichten nur innerhalb derselben Mini-App.
 */
import { MP_LIMITS, PlayerView, assertPayload, decodeFrames, encodeFrame, playerName, type WireFrame } from './protocol';
import { decodeJoinUrl, encodeJoinUrl, isPrivateIPv4, type JoinTarget } from './qr';
import { GameRoom, type RelayResult } from './room';
import { tcpTransport, type MpLink, type MpServer, type MpTransport } from './transport';
import { HelloGuard, sameSecret } from './guard';
import { AskGuard, resumeDelay } from './approval';
import { encodeServiceTxt, matchRoom, visibleRooms, type DiscoveryPort, type LanService } from './discovery';
import { createMemoryRoomStore, loadUsable, publicResume, type PublicResume, type RoomStore, type StoredRoom } from './persist';
import { setHostKeepAlive } from './hostKeepAlive';

export interface MpUiState {
  mode: 'host' | 'scan' | 'ask';
  qrPayload?: string;
  roomCode?: string;
  requestId?: string;
  askName?: string;
}

export interface HostResult {
  roomCode: string;
  qrPayload: string;
  playerId: string;
  players: PlayerView[];
}

type Emit = (event: string, data: unknown) => void;
type UiListener = (state: MpUiState | null) => void;

interface PendingAsk {
  id: string;
  link: MpLink;
  name: string;
  address: string;
  timer: ReturnType<typeof setTimeout>;
  accept: (playerId: string) => void;
}

interface LiveSession {
  appId: string;
  role: 'host' | 'guest';
  room: GameRoom | null;
  selfId: string;
  name: string;
  roomCode: string;
  roomId: string;
  token: string;
  hostName: string;
  discoverable: boolean;
  joinApproval: boolean;
  qrPayload: string;
  target: JoinTarget | null;
  emit: Emit;
  links: Map<string, MpLink>;
  guestLink: MpLink | null;
  server: MpServer | null;
  timer: ReturnType<typeof setInterval> | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  leaving: boolean;
  lastHeard: number;
  dropStarted: number;
  welcomed: boolean;
  giveUp: boolean;
  secret: string;
  sockets: Set<MpLink>;
  handshakeTimers: Set<ReturnType<typeof setTimeout>>;
  pending: Map<string, PendingAsk>;
  resumeAttempt: number;
  hostAway: boolean;
  roster: PlayerView[];
}

let live: LiveSession | null = null;
let ui: MpUiState | null = null;
const uiListeners = new Set<UiListener>();
let scanDeferred: { resolve: (text: string) => void; reject: (error: Error) => void } | null = null;
const helloGuard = new HelloGuard();
const askGuard = new AskGuard();
const memoryStore = createMemoryRoomStore();
let storeOverride: RoomStore | null = null;
let discoveryOverride: DiscoveryPort | null = null;
let keepAliveOverride: ((on: boolean) => Promise<void>) | null = null;
let joinOwnedByApp = false;
let seenServices: LanService[] = [];
let userBrowsing = false;

const silentDiscovery: DiscoveryPort = {
  async publish() {},
  async unpublish() {},
  async browse() {},
  async stopBrowse() {},
};

function activeStore(): RoomStore {
  return storeOverride || memoryStore;
}

function activeDiscovery(): DiscoveryPort {
  return discoveryOverride || silentDiscovery;
}

async function keepAlive(on: boolean): Promise<void> {
  const fn = keepAliveOverride || setHostKeepAlive;
  try {
    await fn(on);
  } catch {
    /* Der Raum bleibt auch ohne Vordergrunddienst gespeichert. */
  }
}

export function configureMultiplayer(partial: { store?: RoomStore; discovery?: DiscoveryPort; keepAlive?: (on: boolean) => Promise<void> }): void {
  if (partial.store) storeOverride = partial.store;
  if (partial.discovery) discoveryOverride = partial.discovery;
  if (partial.keepAlive) keepAliveOverride = partial.keepAlive;
}

export function setJoinRequestOwnedByApp(owned: boolean): void {
  joinOwnedByApp = owned;
  if (owned && ui?.mode === 'ask') setUi(null);
}

export async function resetMultiplayerForTests(): Promise<void> {
  helloGuard.reset();
  askGuard.reset();
  await shutdown(live, true);
  memoryStore.clear();
  storeOverride = null;
  discoveryOverride = null;
  keepAliveOverride = null;
  joinOwnedByApp = false;
  seenServices = [];
  userBrowsing = false;
  live = null;
  setUi(null);
}

function setUi(next: MpUiState | null): void {
  ui = next;
  uiListeners.forEach((listener) => listener(ui));
}

export function subscribeMpUi(listener: UiListener): () => void {
  uiListeners.add(listener);
  listener(ui);
  return () => uiListeners.delete(listener);
}

export function dismissMpUi(): void {
  if (ui?.mode === 'host') setUi(null);
}

export function submitMpScan(text: string): void {
  const pending = scanDeferred;
  scanDeferred = null;
  pending?.resolve(text);
}

export function cancelMpScan(): void {
  const pending = scanDeferred;
  scanDeferred = null;
  if (live?.role === 'host') setUi({ mode: 'host', qrPayload: live.qrPayload, roomCode: live.roomCode });
  else setUi(null);
  pending?.reject(new Error('Scan abgebrochen.'));
}

function snapshot(session: LiveSession): HostResult {
  return {
    roomCode: session.roomCode,
    qrPayload: session.qrPayload,
    playerId: session.selfId,
    players: session.room ? session.room.players() : [],
  };
}

function publishPlayers(session: LiveSession): void {
  if (!session.room) return;
  const players = session.room.players();
  session.roster = players;
  const frame = encodeFrame({ t: 'players', players });
  session.links.forEach((link) => link.send(frame));
  session.emit('multiplayer.players', { players, selfId: session.selfId, roomCode: session.roomCode });
}

function deliver(session: LiveSession, result: RelayResult): void {
  const frame = encodeFrame({ t: 'msg', from: result.from, data: result.data, seq: result.seq });
  for (const id of result.targets) {
    if (id === session.selfId) session.emit('multiplayer.message', { from: result.from, data: result.data });
    else session.links.get(id)?.send(frame);
  }
}

function stopTimers(session: LiveSession): void {
  if (session.timer) clearInterval(session.timer);
  if (session.reconnectTimer) clearTimeout(session.reconnectTimer);
  session.timer = null;
  session.reconnectTimer = null;
}

function failScan(error: Error): void {
  const pending = scanDeferred;
  scanDeferred = null;
  pending?.reject(error);
}

async function shutdown(session: LiveSession | null, forget: boolean): Promise<void> {
  if (!session) return;
  session.leaving = true;
  stopTimers(session);
  failScan(new Error('Der Raum wurde beendet.'));
  session.pending.forEach((ask) => clearTimeout(ask.timer));
  session.pending.clear();
  session.links.forEach((link) => link.close());
  session.sockets.forEach((link) => link.close());
  session.handshakeTimers.forEach((timer) => clearTimeout(timer));
  session.handshakeTimers.clear();
  session.guestLink?.close();
  session.server?.close();
  try {
    await activeDiscovery().unpublish();
    await activeDiscovery().stopBrowse();
  } catch {
    /* Ankündigung ist schon weg. */
  }
  userBrowsing = false;
  if (forget) await activeStore().delete(session.appId);
  if (session.role === 'host') await keepAlive(false);
  if (live === session) live = null;
  setUi(null);
}

export async function detachMultiplayer(appId?: string): Promise<void> {
  if (!live) return;
  if (appId && live.appId !== appId) return;
  live.emit = () => {};
  if (ui?.mode !== 'ask') setUi(null);
  await remember(live);
}

export async function leaveMultiplayer(appId?: string): Promise<{ left: boolean }> {
  if (!live) return { left: true };
  if (appId && live.appId !== appId) return { left: false };
  const session = live;
  if (session.role === 'host') {
    setUi(null);
    return { left: false };
  }
  if (session.guestLink) {
    try {
      session.guestLink.send(encodeFrame({ t: 'leave' }));
    } catch {
      /* Die Verbindung ist schon weg. */
    }
  }
  await shutdown(session, true);
  return { left: true };
}

export async function endRoom(appId: string): Promise<{ ended: boolean }> {
  if (!live || live.appId !== appId || live.role !== 'host') {
    const saved = await activeStore().read(appId);
    if (saved?.role === 'host') await activeStore().delete(appId);
    return { ended: true };
  }
  const frame = encodeFrame({ t: 'error', code: 'ended', message: 'Der Host hat den Raum beendet.' });
  live.links.forEach((link) => link.send(frame));
  await shutdown(live, true);
  return { ended: true };
}

function requireSession(appId: string): LiveSession {
  if (!live || live.appId !== appId) throw new Error('Es gibt keinen Raum für diese Mini-App.');
  return live;
}

function blankSession(partial: Partial<LiveSession> & Pick<LiveSession, 'appId' | 'role' | 'emit'>): LiveSession {
  return {
    appId: partial.appId,
    role: partial.role,
    room: partial.room ?? null,
    selfId: partial.selfId ?? '',
    name: partial.name ?? '',
    roomCode: partial.roomCode ?? '',
    roomId: partial.roomId ?? '',
    token: partial.token ?? '',
    hostName: partial.hostName ?? '',
    discoverable: partial.discoverable ?? true,
    joinApproval: partial.joinApproval ?? true,
    qrPayload: partial.qrPayload ?? '',
    target: partial.target ?? null,
    emit: partial.emit,
    links: partial.links ?? new Map(),
    guestLink: partial.guestLink ?? null,
    server: partial.server ?? null,
    timer: null,
    reconnectTimer: null,
    leaving: false,
    lastHeard: Date.now(),
    dropStarted: 0,
    welcomed: partial.welcomed ?? false,
    giveUp: false,
    secret: partial.secret ?? '',
    sockets: partial.sockets ?? new Set(),
    handshakeTimers: partial.handshakeTimers ?? new Set(),
    pending: new Map(),
    resumeAttempt: 0,
    hostAway: false,
    roster: partial.roster ?? [],
  };
}

async function remember(session: LiveSession): Promise<void> {
  if (!session.roomId || !session.token || !session.secret) return;
  const members = session.room ? session.room.exportMembers() : [];
  const row: StoredRoom = {
    role: session.role,
    appId: session.appId,
    roomId: session.roomId,
    roomCode: session.roomCode,
    token: session.token,
    hostName: session.hostName,
    maxPlayers: session.room?.maxPlayers ?? MP_LIMITS.defaultPlayers,
    discoverable: session.discoverable,
    joinApproval: session.joinApproval,
    selfId: session.selfId,
    secret: session.secret,
    host: session.target?.host || '',
    port: session.target?.port || session.server?.port || 0,
    members,
    roster: session.roster,
    updatedAt: Date.now(),
  };
  await activeStore().write(row);
}

async function announce(session: LiveSession): Promise<void> {
  if (session.role !== 'host' || !session.server || !session.room) return;
  if (!session.discoverable) {
    await activeDiscovery().unpublish();
    return;
  }
  const players = session.room.players();
  const txt = encodeServiceTxt({
    appId: session.appId,
    roomCode: session.roomCode,
    roomId: session.roomId,
    hostName: session.hostName,
    players: players.length,
    maxPlayers: session.room.maxPlayers,
  });
  try {
    await activeDiscovery().publish(`EA-${session.roomCode}-${session.roomId.slice(0, 4)}`, session.server.port, { ...txt });
  } catch {
    /* Ohne mDNS bleibt der QR-Code. */
  }
}

function showAsk(session: LiveSession, ask: PendingAsk): void {
  session.emit('multiplayer.joinRequest', { id: ask.id, name: ask.name, roomCode: session.roomCode, hostName: session.hostName });
  if (!joinOwnedByApp) {
    setUi({ mode: 'ask', requestId: ask.id, askName: ask.name, roomCode: session.roomCode });
  }
}

function finishAsk(session: LiveSession, id: string): PendingAsk | null {
  const ask = session.pending.get(id);
  if (!ask) return null;
  clearTimeout(ask.timer);
  session.pending.delete(id);
  session.handshakeTimers.delete(ask.timer);
  if (ui?.mode === 'ask' && ui.requestId === id) setUi(null);
  const next = session.pending.values().next().value as PendingAsk | undefined;
  if (next) showAsk(session, next);
  return ask;
}

function admitLink(session: LiveSession, link: MpLink, playerId: string, secret: string): string {
  if (!session.room) return '';
  const previous = session.links.get(playerId);
  if (previous && previous !== link) previous.close();
  session.links.set(playerId, link);
  link.send(encodeFrame({
    t: 'welcome',
    playerId,
    secret,
    token: session.token,
    roomId: session.roomId,
    players: session.room.players(),
  }));
  publishPlayers(session);
  void remember(session);
  void announce(session);
  return playerId;
}

function takeAsk(
  session: LiveSession,
  link: MpLink,
  frame: Extract<WireFrame, { t: 'ask' }>,
  at: number,
  assign: (playerId: string) => void,
): string {
  if (!session.room) return '';
  const address = link.remoteAddress || 'unbekannt';
  const decision = askGuard.allow(address, at);
  if (!decision.ok || session.pending.size >= MP_LIMITS.maxPendingAsks) {
    link.send(encodeFrame({ t: 'error', code: 'rate', message: 'Zu viele Anfragen. Kurz warten.' }));
    link.close();
    return '';
  }
  const roomOk = sameSecret(frame.room, session.room.roomCode);
  const idOk = sameSecret(frame.id, session.room.roomId);
  const appOk = sameSecret(frame.appId, session.appId);
  if (Number(roomOk) * Number(idOk) * Number(appOk) !== 1) {
    helloGuard.recordFailure(at);
    link.send(encodeFrame({ t: 'error', code: 'auth', message: 'Raumcode oder Token passt nicht.' }));
    link.close();
    return '';
  }
  if (!session.joinApproval) {
    const admitted = session.room.admitApproved(frame.name, at);
    if (!admitted.ok) {
      link.send(encodeFrame({ t: 'error', code: admitted.code, message: admitted.message }));
      link.close();
      return '';
    }
    assign(admitted.player.id);
    return admitLink(session, link, admitted.player.id, admitted.secret);
  }
  const id = Math.random().toString(16).slice(2, 10);
  const timer = setTimeout(() => {
    const ask = finishAsk(session, id);
    if (!ask) return;
    ask.link.send(encodeFrame({ t: 'error', code: 'timeout', message: 'Die Anfrage ist abgelaufen.' }));
    ask.link.close();
  }, MP_LIMITS.askTimeoutMs);
  session.handshakeTimers.add(timer);
  const ask: PendingAsk = { id, link, name: playerName(frame.name), address, timer, accept: assign };
  session.pending.set(id, ask);
  showAsk(session, ask);
  return 'pending';
}

function pump(session: LiveSession, link: MpLink, onFrame: (frame: WireFrame) => void): void {
  let buffer = '';
  link.onData((chunk) => {
    buffer += chunk;
    if (buffer.length > MP_LIMITS.maxFrameBytes * 4) {
      buffer = '';
      link.close();
      return;
    }
    const decoded = decodeFrames(buffer);
    buffer = decoded.rest;
    if (decoded.error || decoded.frames.length > MP_LIMITS.maxFramesPerChunk) {
      link.close();
      return;
    }
    decoded.frames.forEach(onFrame);
  });
}

function bindHostLink(session: LiveSession, link: MpLink): void {
  const now = Date.now();
  const cap = MP_LIMITS.maxPending + (session.room?.maxPlayers ?? MP_LIMITS.defaultPlayers);
  if (helloGuard.isLocked(now) || session.sockets.size >= cap) {
    link.close();
    return;
  }
  session.sockets.add(link);
  let playerId = '';
  let inbound: number[] = [];
  const handshake = setTimeout(() => {
    session.handshakeTimers.delete(handshake);
    if (!playerId) link.close();
  }, MP_LIMITS.handshakeMs);
  session.handshakeTimers.add(handshake);
  const allowInbound = (at: number) => {
    inbound = inbound.filter((stamp) => at - stamp < MP_LIMITS.messageWindowMs);
    if (inbound.length >= MP_LIMITS.maxInboundPer10s) return false;
    inbound.push(at);
    return true;
  };
  pump(session, link, (frame) => {
    if (!session.room || session.leaving) return;
    const at = Date.now();
    if (!allowInbound(at)) {
      link.close();
      return;
    }
    if (frame.t === 'ask') {
      if (playerId) return;
      const accepted = takeAsk(session, link, frame, at, (id) => { playerId = id; });
      if (accepted === 'pending') {
        clearTimeout(handshake);
        session.handshakeTimers.delete(handshake);
        return;
      }
      if (!accepted) return;
      playerId = accepted;
      clearTimeout(handshake);
      session.handshakeTimers.delete(handshake);
      return;
    }
    if (frame.t === 'hello') {
      if (playerId) return;
      const admitted = session.room.admit(
        {
          appId: frame.appId,
          room: frame.room,
          token: frame.token,
          name: frame.name,
          playerId: frame.playerId,
          secret: frame.secret,
        },
        at,
      );
      if (!admitted.ok) {
        helloGuard.recordFailure(at);
        link.send(encodeFrame({ t: 'error', code: admitted.code, message: admitted.message }));
        link.close();
        return;
      }
      playerId = admitLink(session, link, admitted.player.id, admitted.secret);
      clearTimeout(handshake);
      session.handshakeTimers.delete(handshake);
      return;
    }
    if (!playerId) {
      link.close();
      return;
    }
    if (frame.t === 'ping') {
      session.room.seen(playerId, at);
      link.send(encodeFrame({ t: 'pong', ts: frame.ts }));
      return;
    }
    if (frame.t === 'pong') {
      session.room.seen(playerId, at);
      return;
    }
    if (frame.t === 'leave') {
      session.room.leave(playerId);
      session.links.delete(playerId);
      link.close();
      publishPlayers(session);
      void remember(session);
      void announce(session);
      return;
    }
    if (frame.t !== 'msg') return;
    try {
      const result = frame.all
        ? session.room.broadcast(playerId, frame.data, at)
        : session.room.relay(playerId, frame.data, frame.to, at);
      deliver(session, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nachricht abgelehnt.';
      const rate = /zu viele/i.test(message);
      link.send(encodeFrame({ t: 'error', code: rate ? 'rate' : 'msg', message }));
      if (rate) link.close();
    }
  });
  link.onClose(() => {
    clearTimeout(handshake);
    session.handshakeTimers.delete(handshake);
    session.sockets.delete(link);
    for (const ask of [...session.pending.values()]) {
      if (ask.link === link) finishAsk(session, ask.id);
    }
    if (!session.room || !playerId) return;
    if (session.links.get(playerId) !== link) return;
    session.links.delete(playerId);
    if (session.room.disconnect(playerId, Date.now())) publishPlayers(session);
  });
}

function startHeartbeat(session: LiveSession): void {
  session.timer = setInterval(() => {
    if (!live || live !== session || session.leaving) return;
    const now = Date.now();
    if (session.role === 'host' && session.room) {
      const tick = session.room.tick(now);
      tick.drop.forEach((id) => {
        session.links.get(id)?.close();
        session.links.delete(id);
      });
      if (tick.changed) publishPlayers(session);
      const ping = encodeFrame({ t: 'ping', ts: now });
      session.links.forEach((link) => link.send(ping));
      return;
    }
    if (session.guestLink) session.guestLink.send(encodeFrame({ t: 'ping', ts: now }));
    if (session.welcomed && session.lastHeard && now - session.lastHeard > MP_LIMITS.timeoutMs) session.guestLink?.close();
  }, MP_LIMITS.heartbeatMs);
}

export async function hostMultiplayer(
  appId: string,
  emit: Emit,
  opts?: { maxPlayers?: number; name?: string; discoverable?: boolean; joinApproval?: boolean },
  transport: MpTransport = tcpTransport,
): Promise<HostResult> {
  if (live?.appId === appId && live.role === 'host') {
    live.emit = emit;
    setUi({ mode: 'host', qrPayload: live.qrPayload, roomCode: live.roomCode });
    return snapshot(live);
  }
  if (live) throw new Error('Auf diesem Gerät läuft schon ein anderer Raum.');
  const saved = loadUsable(await activeStore().read(appId), Date.now());
  if (saved?.role === 'guest') throw new Error('Du bist noch in einem Raum. Verlasse ihn zuerst.');
  const restored = saved?.role === 'host';
  const discoverable = opts?.discoverable !== false && (saved ? saved.discoverable : true);
  const joinApproval = opts?.joinApproval !== false && saved?.joinApproval !== false;
  const hostName = playerName(opts?.name || saved?.hostName);
  const room = restored
    ? new GameRoom({
      appId,
      maxPlayers: saved.maxPlayers,
      hostName,
      now: Date.now(),
      restore: {
        appId,
        roomCode: saved.roomCode,
        roomId: saved.roomId,
        token: saved.token,
        maxPlayers: saved.maxPlayers,
        members: saved.members,
      },
    })
    : new GameRoom({
      appId,
      maxPlayers: opts?.maxPlayers ?? MP_LIMITS.defaultPlayers,
      hostName,
      now: Date.now(),
    });
  const hostMember = room.exportMembers().find((member) => member.host);
  const ip = await transport.localIpv4();
  let server: MpServer | null = null;
  try {
    server = await transport.listen((link) => {
      if (!live || live.leaving) {
        link.close();
        return;
      }
      bindHostLink(live, link);
    });
    const qrPayload = encodeJoinUrl({ v: 1, host: ip, port: server.port, room: room.roomCode, token: room.token, appId });
    live = blankSession({
      appId,
      role: 'host',
      room,
      selfId: room.hostId,
      name: hostName,
      roomCode: room.roomCode,
      roomId: room.roomId,
      token: room.token,
      hostName,
      discoverable,
      joinApproval,
      qrPayload,
      emit,
      server,
      welcomed: true,
      secret: hostMember?.secret || '',
    });
  } catch (error) {
    server?.close();
    throw error;
  }
  if (!live) throw new Error('Der Raum ist nicht gestartet.');
  startHeartbeat(live);
  await remember(live);
  await announce(live);
  await keepAlive(true);
  setUi({ mode: 'host', qrPayload: live.qrPayload, roomCode: live.roomCode });
  emit('multiplayer.players', { players: room.players(), selfId: room.hostId, roomCode: room.roomCode });
  if (restored) {
    const row = await activeStore().read(appId);
    if (row) emit('multiplayer.resumed', publicResume(row, 'ready'));
  }
  return snapshot(live);
}

function scheduleReconnect(session: LiveSession, transport: MpTransport): void {
  if (session.leaving || session.role !== 'guest' || !session.target || session.giveUp) return;
  if (!session.hostAway) {
    session.hostAway = true;
    session.emit('multiplayer.hostAway', { roomCode: session.roomCode, message: 'Host ist kurz weg' });
  }
  if (session.reconnectTimer) return;
  const wait = resumeDelay(session.resumeAttempt);
  session.resumeAttempt += 1;
  session.reconnectTimer = setTimeout(() => {
    session.reconnectTimer = null;
    if (!live || live !== session || session.leaving || session.giveUp) return;
    reconnectGuest(session, transport).catch(() => scheduleReconnect(session, transport));
  }, wait);
}

async function openGuest(session: LiveSession, transport: MpTransport): Promise<void> {
  const target = session.target;
  if (!target) throw new Error('Einladung fehlt.');
  const link = await transport.connect(target.host, target.port);
  session.guestLink = link;
  let buffer = '';
  let opened = false;
  await new Promise<void>((resolve, reject) => {
    const clock: { timer?: ReturnType<typeof setTimeout> } = {};
    const fail = (error: Error) => {
      if (opened) return;
      opened = true;
      if (clock.timer) clearTimeout(clock.timer);
      link.close();
      reject(error);
    };
    clock.timer = setTimeout(() => fail(new Error('Der Host antwortet nicht.')), session.token ? 8000 : MP_LIMITS.askTimeoutMs);
    link.onData((chunk) => {
      buffer += chunk;
      if (buffer.length > MP_LIMITS.maxFrameBytes * 4) {
        fail(new Error('Der Host hat zu viele Daten geschickt.'));
        return;
      }
      const decoded = decodeFrames(buffer);
      buffer = decoded.rest;
      if (decoded.error || decoded.frames.length > MP_LIMITS.maxFramesPerChunk) {
        fail(new Error('Der Host hat ungültige Daten geschickt.'));
        return;
      }
      decoded.frames.forEach((frame) => {
        session.lastHeard = Date.now();
        if (frame.t === 'welcome' && !opened) {
          opened = true;
          clearTimeout(clock.timer);
          session.selfId = frame.playerId;
          session.secret = frame.secret;
          if (frame.token) session.token = frame.token;
          if (frame.roomId) session.roomId = frame.roomId;
          if (session.target && session.token) session.target = { ...session.target, token: session.token };
          session.welcomed = true;
          session.hostAway = false;
          session.resumeAttempt = 0;
          session.dropStarted = 0;
          session.roster = frame.players;
          session.emit('multiplayer.players', { players: frame.players, selfId: frame.playerId, roomCode: session.roomCode });
          void remember(session);
          resolve();
          return;
        }
        if (frame.t === 'error' && !opened) {
          clearTimeout(clock.timer);
          session.giveUp = frame.code === 'auth' || frame.code === 'app' || frame.code === 'full' || frame.code === 'player' || frame.code === 'ended' || frame.code === 'denied';
          if (frame.code === 'ended') void activeStore().delete(session.appId);
          fail(new Error(frame.message));
          return;
        }
        if (frame.t === 'players') {
          session.emit('multiplayer.players', { players: frame.players, selfId: session.selfId, roomCode: session.roomCode });
        } else if (frame.t === 'msg' && frame.from) {
          session.emit('multiplayer.message', { from: frame.from, data: frame.data });
        } else if (frame.t === 'ping') {
          link.send(encodeFrame({ t: 'pong', ts: frame.ts }));
        }
      });
    });
    link.onClose(() => {
      if (session.guestLink !== link) return;
      session.guestLink = null;
      if (!opened) fail(new Error('Verbindung zum Host verloren.'));
      else scheduleReconnect(session, transport);
    });
    const opening: WireFrame = session.token
      ? {
        t: 'hello',
        v: 1,
        appId: session.appId,
        room: target.room,
        token: session.token,
        name: session.name,
        playerId: session.selfId && session.secret ? session.selfId : undefined,
        secret: session.selfId && session.secret ? session.secret : undefined,
      }
      : { t: 'ask', v: 1, appId: session.appId, room: target.room, id: session.roomId, name: session.name };
    link.send(encodeFrame(opening));
  });
}

export async function joinMultiplayer(
  appId: string,
  emit: Emit,
  input: string | { scan?: boolean; payload?: string; qrPayload?: string; name?: string; room?: string },
  transport: MpTransport = tcpTransport,
): Promise<HostResult> {
  if (live?.appId === appId) {
    if (live.role === 'host') setUi({ mode: 'host', qrPayload: live.qrPayload, roomCode: live.roomCode });
    return snapshot(live);
  }
  if (live) throw new Error('Auf diesem Gerät läuft schon ein anderer Raum.');
  let payload = '';
  let name = '';
  let discovered = '';
  if (typeof input === 'string') payload = input;
  else {
    name = input.name || '';
    discovered = input.room || '';
    if (!discovered && input.scan) {
      setUi({ mode: 'scan' });
      payload = await new Promise<string>((resolve, reject) => {
        scanDeferred = { resolve, reject };
      });
      setUi(null);
    } else if (!discovered) payload = input.payload || input.qrPayload || '';
  }
  const target = discovered ? targetFromRoom(appId, discovered) : decodeJoinUrl(payload);
  if (target.appId !== appId) throw new Error('Dieser QR-Code gehört zu einer anderen Mini-App.');
  const session = blankSession({
    appId,
    role: 'guest',
    name: playerName(name),
    roomCode: target.room,
    roomId: discovered ? roomIdFromHandle(discovered) : '',
    token: target.token,
    hostName: '',
    qrPayload: payload,
    target,
    emit,
  });
  live = session;
  startHeartbeat(session);
  try {
    await openGuest(session, transport);
  } catch (error) {
    await shutdown(session, true);
    throw error;
  }
  return snapshot(session);
}

export async function sendMultiplayer(appId: string, data: unknown, opts?: { to?: string }): Promise<{ seq: number }> {
  const clean = assertPayload(data);
  const session = requireSession(appId);
  if (session.role === 'host' && session.room) {
    if (!opts?.to) throw new Error('Der Host braucht einen Empfänger oder broadcast.');
    const result = session.room.relay(session.selfId, clean, opts.to);
    deliver(session, result);
    return { seq: result.seq };
  }
  if (!session.guestLink || !session.welcomed) throw new Error('Keine Verbindung zum Raum.');
  const frame: WireFrame = opts?.to ? { t: 'msg', to: opts.to, data: clean } : { t: 'msg', data: clean };
  session.guestLink.send(encodeFrame(frame));
  return { seq: 0 };
}

export async function broadcastMultiplayer(appId: string, data: unknown): Promise<{ seq: number }> {
  const clean = assertPayload(data);
  const session = requireSession(appId);
  if (session.role === 'host' && session.room) {
    const result = session.room.broadcast(session.selfId, clean);
    deliver(session, result);
    return { seq: result.seq };
  }
  if (!session.guestLink || !session.welcomed) throw new Error('Keine Verbindung zum Raum.');
  session.guestLink.send(encodeFrame({ t: 'msg', all: true, data: clean }));
  return { seq: 0 };
}

export function showMultiplayerQr(appId: string): { roomCode: string; qrPayload: string } {
  const session = requireSession(appId);
  if (session.role !== 'host') throw new Error('Nur der Host zeigt den QR-Code.');
  setUi({ mode: 'host', qrPayload: session.qrPayload, roomCode: session.roomCode });
  return { roomCode: session.roomCode, qrPayload: session.qrPayload };
}

function roomIdFromHandle(handle: string): string {
  return handle.split('@')[0] || '';
}

function targetFromRoom(appId: string, handle: string): JoinTarget {
  const rooms = visibleRooms(seenServices, appId);
  const room = rooms.find((item) => item.id === handle);
  const key = handle.includes('@') ? handle.slice(handle.indexOf('@') + 1) : '';
  const service = seenServices.find((item) => item.key === key);
  if (!room || !service || !isPrivateIPv4(service.host)) throw new Error('Dieser Raum ist nicht mehr in der Nähe.');
  return { v: 1, host: service.host, port: service.port, room: room.roomCode, token: '', appId };
}

async function findService(appId: string, roomId: string): Promise<LanService | null> {
  const known = matchRoom(seenServices, appId, roomId);
  if (known) return known;
  if (userBrowsing) {
    return new Promise((resolve) => {
      let wait: ReturnType<typeof setInterval> | null = null;
      const timer = setTimeout(() => {
        if (wait) clearInterval(wait);
        resolve(matchRoom(seenServices, appId, roomId));
      }, 1200);
      wait = setInterval(() => {
        const hit = matchRoom(seenServices, appId, roomId);
        if (!hit) return;
        clearInterval(wait as ReturnType<typeof setInterval>);
        clearTimeout(timer);
        resolve(hit);
      }, 50);
    });
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (hit: LanService | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void activeDiscovery().stopBrowse();
      resolve(hit);
    };
    const timer = setTimeout(() => finish(matchRoom(seenServices, appId, roomId)), 1200);
    void activeDiscovery().browse((rows) => {
      seenServices = rows.filter((row) => isPrivateIPv4(row.host));
      const hit = matchRoom(seenServices, appId, roomId);
      if (hit) finish(hit);
    }).catch(() => finish(null));
  });
}

async function reconnectGuest(session: LiveSession, transport: MpTransport): Promise<void> {
  if (session.target?.host && session.target.port) {
    try {
      await openGuest(session, transport);
      const row = await activeStore().read(session.appId);
      if (row) session.emit('multiplayer.resumed', publicResume(row, 'ready'));
      return;
    } catch {
      /* Die alte Adresse antwortet nicht. */
    }
  }
  const found = await findService(session.appId, session.roomId);
  if (!found || !isPrivateIPv4(found.host)) throw new Error('Der Raum ist gerade nicht zu sehen.');
  session.target = { v: 1, host: found.host, port: found.port, room: session.roomCode, token: session.token, appId: session.appId };
  await openGuest(session, transport);
  const row = await activeStore().read(session.appId);
  if (row) session.emit('multiplayer.resumed', publicResume(row, 'ready'));
}

export async function discoverMultiplayer(appId: string, emit: Emit): Promise<{ started: boolean }> {
  userBrowsing = true;
  await activeDiscovery().browse((rows) => {
    seenServices = rows.filter((row) => isPrivateIPv4(row.host));
    const rooms = visibleRooms(seenServices, appId).map((room) => ({
      id: room.id,
      roomCode: room.roomCode,
      hostName: room.hostName,
      players: room.players,
      maxPlayers: room.maxPlayers,
    }));
    emit('multiplayer.rooms', { rooms });
  });
  emit('multiplayer.rooms', {
    rooms: visibleRooms(seenServices, appId).map((room) => ({
      id: room.id,
      roomCode: room.roomCode,
      hostName: room.hostName,
      players: room.players,
      maxPlayers: room.maxPlayers,
    })),
  });
  return { started: true };
}

export async function stopDiscoveryMultiplayer(): Promise<{ stopped: boolean }> {
  userBrowsing = false;
  await activeDiscovery().stopBrowse();
  return { stopped: true };
}

export async function setDiscoverableMultiplayer(appId: string, discoverable: boolean): Promise<{ discoverable: boolean }> {
  const session = requireSession(appId);
  if (session.role !== 'host') throw new Error('Nur der Host ändert die Sichtbarkeit.');
  session.discoverable = discoverable;
  await announce(session);
  await remember(session);
  return { discoverable };
}

export async function approveJoin(appId: string, requestId: string): Promise<{ approved: boolean }> {
  const session = requireSession(appId);
  if (!session.room || session.role !== 'host') throw new Error('Nur der Host lässt Spieler herein.');
  const ask = finishAsk(session, requestId);
  if (!ask) throw new Error('Diese Anfrage gibt es nicht mehr.');
  const admitted = session.room.admitApproved(ask.name, Date.now());
  if (!admitted.ok) {
    ask.link.send(encodeFrame({ t: 'error', code: admitted.code, message: admitted.message }));
    ask.link.close();
    return { approved: false };
  }
  ask.accept(admitted.player.id);
  admitLink(session, ask.link, admitted.player.id, admitted.secret);
  return { approved: true };
}

export async function denyJoin(appId: string, requestId: string): Promise<{ denied: boolean }> {
  const session = requireSession(appId);
  const ask = finishAsk(session, requestId);
  if (!ask) return { denied: false };
  askGuard.deny(ask.address, Date.now());
  ask.link.send(encodeFrame({ t: 'error', code: 'denied', message: 'Der Host hat abgelehnt.' }));
  ask.link.close();
  return { denied: true };
}

export async function resumeMultiplayer(
  appId: string,
  emit: Emit,
  transport: MpTransport = tcpTransport,
): Promise<PublicResume | null> {
  if (live?.appId === appId && live.welcomed && !live.leaving) {
    live.emit = emit;
    const row = await activeStore().read(appId);
    if (!row) return null;
    const view = publicResume(row, live.hostAway ? 'hostAway' : 'ready');
    emit('multiplayer.resumed', view);
    return view;
  }
  const saved = loadUsable(await activeStore().read(appId), Date.now());
  if (!saved) {
    if (await activeStore().read(appId)) await activeStore().delete(appId);
    return null;
  }
  if (saved.role === 'host') {
    await hostMultiplayer(appId, emit, {
      name: saved.hostName,
      maxPlayers: saved.maxPlayers,
      discoverable: saved.discoverable,
      joinApproval: saved.joinApproval,
    }, transport);
    const row = await activeStore().read(appId);
    return row ? publicResume(row, 'ready') : null;
  }
  if (live && live.appId !== appId) throw new Error('Auf diesem Gerät läuft schon ein anderer Raum.');
  const session = blankSession({
    appId,
    role: 'guest',
    emit,
    selfId: saved.selfId,
    secret: saved.secret,
    name: 'Spieler',
    roomCode: saved.roomCode,
    roomId: saved.roomId,
    token: saved.token,
    hostName: saved.hostName,
    roster: saved.roster || [],
    target: saved.host && saved.port
      ? { v: 1, host: saved.host, port: saved.port, room: saved.roomCode, token: saved.token, appId }
      : null,
  });
  live = session;
  startHeartbeat(session);
  try {
    await reconnectGuest(session, transport);
    const row = await activeStore().read(appId);
    return row ? publicResume(row, 'ready') : publicResume(saved, 'ready');
  } catch {
    scheduleReconnect(session, transport);
    return publicResume(saved, 'hostAway');
  }
}
