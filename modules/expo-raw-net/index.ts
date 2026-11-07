import { requireOptionalNativeModule } from 'expo-modules-core';
const Native: any = requireOptionalNativeModule('ExpoRawNet');
export const NEXT_BUILD = 'Raw-Netzwerk/Krypto (ctx.net / ctx.crypto / tuyaLocal) braucht nächsten Build';
export const isAvailable = () => !!Native;
const need = () => { if (!Native) throw new Error(NEXT_BUILD); return Native; };

/** Async crypto primitives on hex strings (same interface is implemented with node:crypto in tests). */
export interface CryptoHex {
  aesEcb(encrypt: boolean, keyHex: string, dataHex: string): Promise<string>;
  aesGcm(encrypt: boolean, keyHex: string, ivHex: string, aadHex: string, dataHex: string): Promise<string>;
  hmacSha256(keyHex: string, dataHex: string): Promise<string>;
  md5(dataHex: string): Promise<string>;
  crc32(dataHex: string): Promise<number>;
  randomHex(n: number): Promise<string>;
}
export const nativeCrypto: CryptoHex = {
  aesEcb: (e, k, d) => need().aesEcb(e, k, d),
  aesGcm: (e, k, iv, aad, d) => need().aesGcm(e, k, iv, aad, d),
  hmacSha256: (k, d) => need().hmacSha256(k, d),
  md5: (d) => need().md5(d),
  crc32: (d) => need().crc32(d),
  randomHex: (n) => need().randomHex(n),
};

export interface TcpConn { send(hex: string): Promise<void>; receive(o?: { minBytes?: number; timeoutMs?: number }): Promise<string>; close(): Promise<void> }
export interface NetHex {
  tcp(host: string, port: number, o?: { timeoutMs?: number }): Promise<TcpConn>;
  udpSend(host: string, port: number, hex: string, o?: { broadcast?: boolean }): Promise<void>;
  udpListen(ports: number[], durationMs: number): Promise<Array<{ from: string; port: number; localPort: number; hex: string }>>;
}
export const nativeNet: NetHex = {
  async tcp(host, port, o = {}) {
    const id: number = await need().tcpOpen(host, port, o.timeoutMs ?? 5000);
    return {
      send: async (hex) => { await need().tcpSend(id, hex); },
      receive: async (r = {}) => need().tcpReceive(id, r.minBytes ?? 1, r.timeoutMs ?? 5000),
      close: async () => { await need().tcpClose(id); },
    };
  },
  udpSend: async (host, port, hex, o = {}) => { await need().udpSend(host, port, hex, !!o.broadcast); },
  udpListen: (ports, durationMs) => need().udpListen(ports, durationMs),
};

export { utf8ToHex, hexToUtf8, toHex, hexToBytes } from './hex';
