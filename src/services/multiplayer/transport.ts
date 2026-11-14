/**
 * TCP-Adapter für react-native-tcp-socket.
 * Das Modul fehlt in alten Builds. Dann bleibt die reine Raumlogik unberührt und der Aufruf erklärt den nötigen Build.
 */
import { chooseLanIPv4, isPrivateIPv4, type LanCandidate } from './qr';

export interface MpLink {
  remoteAddress?: string;
  send(frame: string): void;
  close(): void;
  onData(cb: (chunk: string) => void): void;
  onClose(cb: () => void): void;
}

export interface MpServer {
  port: number;
  close(): void;
}

export interface MpTransport {
  listen(onConnection: (link: MpLink) => void): Promise<MpServer>;
  connect(host: string, port: number): Promise<MpLink>;
  localIpv4(): Promise<string>;
}

const MISSING = 'Lokaler Mehrspieler braucht einen neuen Entwicklungs-Build mit react-native-tcp-socket.';

interface TcpSocket {
  write: (frame: string) => void;
  destroy: () => void;
  on: (event: string, cb: (data?: unknown) => void) => void;
}

interface TcpServer {
  listen: (opts: { port: number; host: string }, cb: () => void) => void;
  address: () => { port?: number } | null;
  close: () => void;
  on: (event: string, cb: (err?: Error) => void) => void;
}

interface TcpApi {
  createServer: (listener: (socket: TcpSocket) => void) => TcpServer;
  createConnection: (opts: { port: number; host: string; connectTimeout: number }, cb: () => void) => TcpSocket;
}

function tcpModule(): TcpApi {
  let loaded: { default?: TcpApi; createServer?: TcpApi['createServer']; createConnection?: TcpApi['createConnection'] };
  try {
    loaded = require('react-native-tcp-socket');
  } catch {
    throw new Error(MISSING);
  }
  const api = loaded.default || loaded;
  if (typeof api.createServer !== 'function' || typeof api.createConnection !== 'function') throw new Error(MISSING);
  return api as TcpApi;
}

function chunkText(data: unknown): string {
  if (typeof data === 'string') return data;
  if (data && typeof (data as { toString?: () => string }).toString === 'function') return (data as { toString: () => string }).toString();
  return '';
}

function bindSocket(socket: TcpSocket): MpLink {
  const dataListeners: ((chunk: string) => void)[] = [];
  const closeListeners: (() => void)[] = [];
  let closed = false;
  const fireClose = () => {
    if (closed) return;
    closed = true;
    closeListeners.forEach((cb) => cb());
  };
  socket.on('data', (data) => {
    const text = chunkText(data);
    dataListeners.forEach((cb) => cb(text));
  });
  socket.on('error', () => fireClose());
  socket.on('close', () => fireClose());
  return {
    send(frame) {
      if (!closed) socket.write(frame);
    },
    close() {
      try {
        socket.destroy();
      } catch {
        /* Socket ist schon zu. */
      }
      fireClose();
    },
    onData(cb) {
      dataListeners.push(cb);
    },
    onClose(cb) {
      closeListeners.push(cb);
    },
    remoteAddress: typeof (socket as unknown as { remoteAddress?: unknown }).remoteAddress === 'string'
      ? (socket as unknown as { remoteAddress: string }).remoteAddress
      : '',
  };
}

async function readCandidates(): Promise<LanCandidate[]> {
  try {
    const mod = require('../../../modules/expo-network-info') as { getLanCandidatesAsync?: () => Promise<unknown> };
    if (typeof mod.getLanCandidatesAsync !== 'function') return [];
    const rows = await mod.getLanCandidatesAsync();
    if (!Array.isArray(rows)) return [];
    return rows
      .map((row) => {
        const item = row as { name?: unknown; ip?: unknown };
        return { name: typeof item.name === 'string' ? item.name : '', ip: typeof item.ip === 'string' ? item.ip : '' };
      })
      .filter((row) => row.ip);
  } catch {
    return [];
  }
}

async function readFallbackIp(): Promise<string> {
  try {
    const mod = require('../../../modules/expo-network-info') as {
      getInfoAsync?: () => Promise<{ ip?: string }>;
      getWifiAsync?: () => Promise<{ ip?: string }>;
    };
    for (const read of [mod.getInfoAsync, mod.getWifiAsync]) {
      if (typeof read !== 'function') continue;
      try {
        const info = await read();
        if (info?.ip && isPrivateIPv4(info.ip)) return info.ip;
      } catch {
        /* Nächster Leser. */
      }
    }
  } catch {
    /* Modul fehlt. */
  }
  return '';
}

export const tcpTransport: MpTransport = {
  listen(onConnection) {
    const Tcp = tcpModule();
    const server = Tcp.createServer((socket) => {
      onConnection(bindSocket(socket));
    });
    return new Promise((resolve, reject) => {
      server.on('error', (err) => reject(err instanceof Error ? err : new Error('Der lokale Server ist nicht gestartet.')));
      server.listen({ port: 0, host: '0.0.0.0' }, () => {
        const address = server.address();
        const port = address && typeof address.port === 'number' ? address.port : 0;
        if (port < 1024) {
          try {
            server.close();
          } catch {
            /* */
          }
          reject(new Error('Der lokale Server hat keinen nutzbaren Port bekommen.'));
          return;
        }
        resolve({
          port,
          close() {
            try {
              server.close();
            } catch {
              /* schon zu */
            }
          },
        });
      });
    });
  },

  connect(host, port) {
    if (!isPrivateIPv4(host)) return Promise.reject(new Error('Nur Adressen im lokalen Netz sind erlaubt.'));
    const Tcp = tcpModule();
    return new Promise((resolve, reject) => {
      let settled = false;
      const socket = Tcp.createConnection({ port, host, connectTimeout: 8000 }, () => {
        if (settled) return;
        settled = true;
        resolve(bindSocket(socket));
      });
      socket.on('error', (err) => {
        if (settled) return;
        settled = true;
        reject(err instanceof Error ? err : new Error('Verbindung zum Host fehlgeschlagen.'));
      });
    });
  },

  async localIpv4() {
    const chosen = chooseLanIPv4(await readCandidates());
    if (chosen) return chosen;
    const fallback = await readFallbackIp();
    if (fallback) return fallback;
    throw new Error('Keine private Adresse im WLAN oder Hotspot. Beide Geräte müssen im selben Netz sein. Dafür ist ein neuer Build nötig.');
  },
};
