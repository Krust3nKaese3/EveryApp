/**
 * Eine Sitzung pro Gerät. Der Host verteilt JSON-Nachrichten nur innerhalb derselben Mini-App.
 */
import { MP_LIMITS, PlayerView, assertPayload, decodeFrames, encodeFrame, playerName, type WireFrame } from './protocol';
import { decodeJoinUrl, encodeJoinUrl, type JoinTarget } from './qr';
import { GameRoom, type RelayResult } from './room';
import { tcpTransport, type MpLink, type MpServer, type MpTransport } from './transport';
import { HelloGuard } from './guard';

export interface MpUiState {
  mode: 'host' | 'scan';
  qrPayload?: string;
  roomCode?: string;
}

export interface HostResult {
  roomCode: string;
  qrPayload: string;
  playerId: string;
  players: PlayerView[];
}

type Emit = (event: string, data: unknown) => void;
type UiListener = (state: MpUiState | null) => void;

interface LiveSession {
  appId: string;
  role: 'host' | 'guest';
  room: GameRoom | null;
  selfId: string;
  name: string;
  roomCode: string;
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
}

let live: LiveSession | null = null;
let ui: MpUiState | null = null;
const uiListeners = new Set<UiListener>();
let scanDeferred: { resolve: (text: string) => void; reject: (error: Error) => void } | null = null;
const helloGuard = new HelloGuard();

export async function resetMultiplayerForTests(): Promise<void> {
  helloGuard.reset();
  await leaveMultiplayer();
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

export async function leaveMultiplayer(appId?: string): Promise<{ left: boolean }> {
  if (!live) return { left: true };
  if (appId && live.appId !== appId) return { left: false };
  const session = live;
  session.leaving = true;
  stopTimers(session);
  failScan(new Error('Der Raum wurde beendet.'));
  if (session.role === 'guest' && session.guestLink) {
    try {
      session.guestLink.send(encodeFrame({ t: 'leave' }));
    } catch {
      /* Die Verbindung ist schon weg. */
    }
  }
  session.links.forEach((link) => link.close());
  session.sockets.forEach((link) => link.close());
  session.handshakeTimers.forEach((timer) => clearTimeout(timer));
  session.handshakeTimers.clear();
  session.guestLink?.close();
  session.server?.close();
  live = null;
  setUi(null);
  return { left: true };
}

function requireSession(appId: string): LiveSession {
  if (!live || live.appId !== appId) throw new Error('Es gibt keinen Raum für diese Mini-App.');
  return live;
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
      playerId = admitted.player.id;
      clearTimeout(handshake);
      session.handshakeTimers.delete(handshake);
      const previous = session.links.get(playerId);
      if (previous && previous !== link) previous.close();
      session.links.set(playerId, link);
      link.send(encodeFrame({ t: 'welcome', playerId, secret: admitted.secret, players: session.room.players() }));
      publishPlayers(session);
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
  opts?: { maxPlayers?: number; name?: string },
  transport: MpTransport = tcpTransport,
): Promise<HostResult> {
  if (live?.appId === appId && live.role === 'host') {
    setUi({ mode: 'host', qrPayload: live.qrPayload, roomCode: live.roomCode });
    return snapshot(live);
  }
  if (live) throw new Error('Auf diesem Gerät läuft schon ein anderer Raum.');
  const room = new GameRoom({
    appId,
    maxPlayers: opts?.maxPlayers ?? MP_LIMITS.defaultPlayers,
    hostName: playerName(opts?.name),
    now: Date.now(),
  });
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
    live = {
      appId,
      role: 'host',
      room,
      selfId: room.hostId,
      name: playerName(opts?.name),
      roomCode: room.roomCode,
      qrPayload,
      target: null,
      emit,
      links: new Map(),
      guestLink: null,
      server,
      timer: null,
      reconnectTimer: null,
      leaving: false,
      lastHeard: Date.now(),
      dropStarted: 0,
      welcomed: true,
      giveUp: false,
      secret: '',
      sockets: new Set(),
      handshakeTimers: new Set(),
    };
  } catch (error) {
    server?.close();
    throw error;
  }
  if (!live) throw new Error('Der Raum ist nicht gestartet.');
  startHeartbeat(live);
  setUi({ mode: 'host', qrPayload: live.qrPayload, roomCode: live.roomCode });
  emit('multiplayer.players', { players: room.players(), selfId: room.hostId, roomCode: room.roomCode });
  return snapshot(live);
}

function scheduleReconnect(session: LiveSession, transport: MpTransport): void {
  if (session.leaving || session.role !== 'guest' || !session.target || !session.welcomed || session.giveUp) return;
  if (!session.dropStarted) session.dropStarted = Date.now();
  if (Date.now() - session.dropStarted > MP_LIMITS.reconnectGraceMs) return;
  if (session.reconnectTimer) return;
  session.reconnectTimer = setTimeout(() => {
    session.reconnectTimer = null;
    if (!live || live !== session || session.leaving) return;
    openGuest(session, transport).catch(() => scheduleReconnect(session, transport));
  }, 1000);
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
    clock.timer = setTimeout(() => fail(new Error('Der Host antwortet nicht.')), 8000);
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
          session.welcomed = true;
          session.dropStarted = 0;
          session.emit('multiplayer.players', { players: frame.players, selfId: frame.playerId, roomCode: session.roomCode });
          resolve();
          return;
        }
        if (frame.t === 'error' && !opened) {
          clearTimeout(clock.timer);
          session.giveUp = frame.code === 'auth' || frame.code === 'app' || frame.code === 'full' || frame.code === 'player';
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
    const hello: WireFrame = {
      t: 'hello',
      v: 1,
      appId: session.appId,
      room: target.room,
      token: target.token,
      name: session.name,
      playerId: session.selfId && session.secret ? session.selfId : undefined,
      secret: session.selfId && session.secret ? session.secret : undefined,
    };
    link.send(encodeFrame(hello));
  });
}

export async function joinMultiplayer(
  appId: string,
  emit: Emit,
  input: string | { scan?: boolean; payload?: string; qrPayload?: string; name?: string },
  transport: MpTransport = tcpTransport,
): Promise<HostResult> {
  if (live?.appId === appId) {
    if (live.role === 'host') setUi({ mode: 'host', qrPayload: live.qrPayload, roomCode: live.roomCode });
    return snapshot(live);
  }
  if (live) throw new Error('Auf diesem Gerät läuft schon ein anderer Raum.');
  let payload = '';
  let name = '';
  if (typeof input === 'string') payload = input;
  else {
    name = input.name || '';
    if (input.scan) {
      setUi({ mode: 'scan' });
      payload = await new Promise<string>((resolve, reject) => {
        scanDeferred = { resolve, reject };
      });
      setUi(null);
    } else payload = input.payload || input.qrPayload || '';
  }
  const target = decodeJoinUrl(payload);
  if (target.appId !== appId) throw new Error('Dieser QR-Code gehört zu einer anderen Mini-App.');
  const session: LiveSession = {
    appId,
    role: 'guest',
    room: null,
    selfId: '',
    name: playerName(name),
    roomCode: target.room,
    qrPayload: payload,
    target,
    emit,
    links: new Map(),
    guestLink: null,
    server: null,
    timer: null,
    reconnectTimer: null,
    leaving: false,
    lastHeard: Date.now(),
    dropStarted: 0,
    welcomed: false,
    giveUp: false,
    secret: '',
    sockets: new Set(),
    handshakeTimers: new Set(),
  };
  live = session;
  startHeartbeat(session);
  try {
    await openGuest(session, transport);
  } catch (error) {
    await leaveMultiplayer(appId);
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
