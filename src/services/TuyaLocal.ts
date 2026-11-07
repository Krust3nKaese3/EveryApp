/**
 * Tuya LAN protocol (port 6668) v3.3 / v3.4 / v3.5 – pure TS over injected hex primitives (native in app, node:crypto in tests).
 * Based on the public tinytuya protocol description. Error messages are German and copyable.
 */
import type { CryptoHex, NetHex, TcpConn } from '../../modules/expo-raw-net';
import { utf8ToHex, hexToUtf8 } from '../../modules/expo-raw-net/hex';

export const UDP_KEY_SEED = 'yGAdlopoPVldABfn';
const P55 = '000055aa', S55 = '0000aa55', P66 = '00006699', S66 = '00009966';
export const CMD = { SESS_NEG_START: 3, SESS_NEG_RESP: 4, SESS_NEG_FINISH: 5, CONTROL: 7, STATUS: 8, HEART_BEAT: 9, DP_QUERY: 10, CONTROL_NEW: 13, DP_QUERY_NEW: 16 };

const u32 = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
const rd32 = (h: string, off: number) => parseInt(h.substr(off * 2, 8), 16) >>> 0;
const xorHex = (a: string, b: string) => (a.match(/../g) || []).map((x, i) => (parseInt(x, 16) ^ parseInt(b.substr(i * 2, 2), 16)).toString(16).padStart(2, '0')).join('');
export const pkcs7 = (h: string) => { const n = 16 - ((h.length / 2) % 16); return h + n.toString(16).padStart(2, '0').repeat(n); };
export const unpkcs7 = (h: string) => { const n = parseInt(h.slice(-2), 16); return n >= 1 && n <= 16 ? h.slice(0, h.length - n * 2) : h; };
const versionHeader = (v: string) => utf8ToHex(v) + '00'.repeat(12);

export interface TuyaCfg { ip?: string; id: string; localKey: string; version?: '3.3' | '3.4' | '3.5' | string; port?: number; timeoutMs?: number; debug?: (m: string) => void }
export interface Frame { seq: number; cmd: number; retcode?: number; payloadHex: string }

export function keyHex(localKey: string) {
  if (!localKey || localKey.length !== 16) throw new Error(`Tuya: localKey muss genau 16 Zeichen haben (hat ${localKey ? localKey.length : 0}) – aus Smart-Life-Cloud/tinytuya wizard holen`);
  return utf8ToHex(localKey);
}

// ---------- framing ----------
/** 55AA frame for 3.3 (crc32) and 3.4 (hmac with key). payloadHex already encrypted. */
export async function pack55(c: CryptoHex, seq: number, cmd: number, payloadHex: string, hmacKeyHex: string | null): Promise<string> {
  const tailLen = hmacKeyHex ? 32 : 4;
  const head = P55 + u32(seq) + u32(cmd) + u32(payloadHex.length / 2 + tailLen + 4);
  const body = head + payloadHex;
  const tail = hmacKeyHex ? await c.hmacSha256(hmacKeyHex, body) : u32(await c.crc32(body));
  return body + tail + S55;
}
/** 6699 frame for 3.5: AES-GCM(key, iv), aad = header after prefix. plaintextHex not padded. */
export async function pack66(c: CryptoHex, seq: number, cmd: number, plaintextHex: string, keyH: string, ivHex?: string): Promise<string> {
  const iv = ivHex || (await c.randomHex(12));
  const len = 12 + plaintextHex.length / 2 + 16;
  const aad = '0000' + u32(seq) + u32(cmd) + u32(len);
  const ct = await c.aesGcm(true, keyH, iv, aad, plaintextHex);
  return P66 + aad + iv + ct + S66;
}

/** Splits a TCP/UDP buffer into frames. Returns parsed frames + leftover hex (incomplete). */
export async function unpackAll(c: CryptoHex, bufHex: string, version: string, keyH: string | null): Promise<{ frames: Frame[]; rest: string }> {
  const frames: Frame[] = [];
  let h = bufHex.toLowerCase();
  while (h.length >= 32) {
    const i55 = h.indexOf(P55), i66 = h.indexOf(P66);
    const i = [i55, i66].filter((x) => x >= 0 && x % 2 === 0).sort((a, b) => a - b)[0];
    if (i === undefined) return { frames, rest: '' };
    h = h.slice(i);
    if (h.startsWith(P66)) {
      if (h.length < 36) break;
      const seq = rd32(h, 6), cmd = rd32(h, 10), len = rd32(h, 14);
      const total = 18 + len + 4;
      if (h.length < total * 2) break;
      const aad = h.substr(8, 28), iv = h.substr(36, 24), ctTag = h.substr(60, (len - 12) * 2);
      if (!keyH) throw new Error('Tuya 3.5: Schlüssel fehlt zum Entschlüsseln');
      let pt = await c.aesGcm(false, keyH, iv, aad, ctTag);
      let retcode: number | undefined;
      if (pt.length >= 8 && (rd32(pt, 0) & 0xffffff00) === 0) { retcode = rd32(pt, 0); pt = pt.slice(8); }
      frames.push({ seq, cmd, retcode, payloadHex: pt });
      h = h.slice(total * 2);
    } else {
      const seq = rd32(h, 4), cmd = rd32(h, 8), len = rd32(h, 12);
      const total = 16 + len;
      if (h.length < total * 2) break;
      const tailLen = version === '3.4' ? 32 : 4;
      let payload = h.substr(32, (len - tailLen - 4) * 2);
      if (version === '3.4' && keyH) {
        const want = await c.hmacSha256(keyH, h.substr(0, (16 + len - tailLen - 4) * 2));
        const got = h.substr((16 + len - tailLen - 4) * 2, 64);
        if (want !== got) throw new Error('Tuya 3.4: HMAC ungültig – falscher localKey oder falsche Version?');
      }
      let retcode: number | undefined;
      if (payload.length >= 8 && (rd32(payload, 0) & 0xffffff00) === 0) { retcode = rd32(payload, 0); payload = payload.slice(8); }
      frames.push({ seq, cmd, retcode, payloadHex: payload });
      h = h.slice(total * 2);
    }
  }
  return { frames, rest: h };
}

/** Decrypts a 55AA payload (ECB) and strips "3.x"+12 version header. Returns parsed JSON or raw string. */
export async function decrypt55(c: CryptoHex, keyH: string, payloadHex: string): Promise<any> {
  if (!payloadHex) return null;
  let p = payloadHex;
  if (p.startsWith('332e') && p.length > 30) p = p.slice(30); // "3.x" + 12 bytes (some 3.3 STATUS frames)
  let txt: string;
  if (p.startsWith('7b')) txt = hexToUtf8(p); // plain JSON
  else {
    if ((p.length / 2) % 16 !== 0) throw new Error(`Tuya: Antwort nicht entschlüsselbar (Länge ${p.length / 2} kein Vielfaches von 16)`);
    let d = unpkcs7(await c.aesEcb(false, keyH, p));
    if (d.startsWith('332e') && d.length > 30) d = d.slice(30);
    txt = hexToUtf8(d);
  }
  return parseJson(txt);
}
function parseJson(txt: string) { try { return JSON.parse(txt); } catch { return txt; } }
const stripVer = (h: string) => (h.startsWith('332e') && h.length > 30 ? h.slice(30) : h);

// ---------- client ----------
export class TuyaLocalClient {
  private seq = 1; private conn: TcpConn | null = null; private sessionKey: string | null = null; private buf = '';
  readonly version: string;
  constructor(private c: CryptoHex, private net: NetHex, private cfg: TuyaCfg & { ip: string }) {
    this.version = String(cfg.version || '3.3');
    if (!['3.3', '3.4', '3.5'].includes(this.version)) throw new Error(`Tuya: Version ${this.version} nicht unterstützt (nur 3.3, 3.4, 3.5)`);
  }
  private log(m: string) { this.cfg.debug?.(`[tuya ${this.cfg.ip}] ${m}`); }
  private get key() { return keyHex(this.cfg.localKey); }

  private async packMsg(cmd: number, plainHex: string, useLocalKey = false): Promise<string> {
    const k = useLocalKey || !this.sessionKey ? this.key : this.sessionKey;
    if (this.version === '3.5') return pack66(this.c, this.seq++, cmd, plainHex, k);
    const enc = await this.c.aesEcb(true, k, pkcs7(plainHex));
    return pack55(this.c, this.seq++, cmd, enc, this.version === '3.4' ? k : null);
  }

  private async recv(wantCmd: number[], timeoutMs: number, useLocalKey = false): Promise<Frame> {
    const end = Date.now() + timeoutMs;
    const k = useLocalKey || !this.sessionKey ? this.key : this.sessionKey;
    while (Date.now() < end) {
      const { frames, rest } = await unpackAll(this.c, this.buf, this.version, this.version === '3.3' ? null : k);
      this.buf = rest;
      for (const f of frames) {
        this.log(`<- cmd ${f.cmd} ret ${f.retcode ?? '-'} ${f.payloadHex.length / 2}B`);
        if (wantCmd.includes(f.cmd)) return f;
      }
      const more = await this.conn!.receive({ minBytes: 1, timeoutMs: Math.max(100, end - Date.now()) });
      if (!more) break;
      this.buf += more;
    }
    throw new Error(`Tuya: keine Antwort (cmd ${wantCmd.join('/')}) innerhalb ${timeoutMs}ms – falsche Version (${this.version}) oder localKey? Andere App verbunden?`);
  }

  async connect() {
    if (this.conn) return;
    this.conn = await this.net.tcp(this.cfg.ip, this.cfg.port || 6668, { timeoutMs: this.cfg.timeoutMs ?? 5000 });
    this.log('TCP verbunden');
    if (this.version === '3.3') return;
    // session key negotiation (3.4/3.5)
    const local = await this.c.randomHex(16);
    await this.conn.send(await this.packMsg(CMD.SESS_NEG_START, local, true));
    const r = await this.recv([CMD.SESS_NEG_RESP], this.cfg.timeoutMs ?? 5000, true);
    const d = this.version === '3.5' ? r.payloadHex : unpkcs7(await this.c.aesEcb(false, this.key, r.payloadHex));
    const remote = d.slice(0, 32), mac = d.slice(32, 96);
    const want = await this.c.hmacSha256(this.key, local);
    if (mac && mac !== want) throw new Error('Tuya: Session-Aushandlung fehlgeschlagen (HMAC passt nicht) – localKey falsch?');
    await this.conn.send(await this.packMsg(CMD.SESS_NEG_FINISH, await this.c.hmacSha256(this.key, remote), true));
    const x = xorHex(local, remote);
    this.sessionKey = this.version === '3.5'
      ? (await this.c.aesGcm(true, this.key, local.slice(0, 24), '', x)).slice(0, 32)
      : (await this.c.aesEcb(true, this.key, x)).slice(0, 32);
    this.log('Session-Key ausgehandelt');
  }

  private ts() { return String(Math.floor(Date.now() / 1000)); }

  async status(): Promise<Record<string, any>> {
    await this.connect();
    const id = this.cfg.id;
    const v33 = this.version === '3.3';
    const json = v33 ? { gwId: id, devId: id, uid: id, t: this.ts() } : {};
    await this.conn!.send(await this.packMsg(v33 ? CMD.DP_QUERY : CMD.DP_QUERY_NEW, utf8ToHex(JSON.stringify(json))));
    const f = await this.recv([CMD.DP_QUERY, CMD.DP_QUERY_NEW, CMD.STATUS], this.cfg.timeoutMs ?? 5000);
    const data = await this.decode(f);
    const dps = data?.dps ?? data?.data?.dps;
    if (!dps) throw new Error(`Tuya status: unerwartete Antwort: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
    return dps;
  }

  async set(dps: Record<string, any>): Promise<any> {
    await this.connect();
    const id = this.cfg.id;
    let plain: string;
    if (this.version === '3.3') plain = utf8ToHex(JSON.stringify({ devId: id, uid: id, t: this.ts(), dps }));
    else plain = utf8ToHex(JSON.stringify({ protocol: 5, t: Number(this.ts()), data: { dps } }));
    let msg: string;
    if (this.version === '3.3') {
      // 3.3: "3.3"+12 header in clear, followed by ECB ciphertext
      const enc = await this.c.aesEcb(true, this.key, pkcs7(plain));
      msg = await pack55(this.c, this.seq++, CMD.CONTROL, versionHeader('3.3') + enc, null);
    } else msg = await this.packMsg(CMD.CONTROL_NEW, versionHeader(this.version) + plain);
    await this.conn!.send(msg);
    const f = await this.recv([CMD.CONTROL, CMD.CONTROL_NEW, CMD.STATUS], this.cfg.timeoutMs ?? 5000).catch((e) => { this.log('keine Bestätigung: ' + e.message); return null; });
    if (f && f.retcode) throw new Error(`Tuya set: Gerät meldet Fehler (retcode ${f.retcode})`);
    return f ? await this.decode(f).catch(() => null) : null;
  }

  private async decode(f: Frame) {
    if (this.version === '3.3') return decrypt55(this.c, this.key, f.payloadHex);
    if (this.version === '3.5') return parseJson(hexToUtf8(stripVer(f.payloadHex)));
    if (!f.payloadHex) return null;
    return parseJson(hexToUtf8(stripVer(unpkcs7(await this.c.aesEcb(false, this.sessionKey || this.key, f.payloadHex)))));
  }

  async close() { const c = this.conn; this.conn = null; this.sessionKey = null; this.buf = ''; if (c) await c.close().catch(() => {}); }
}

// ---------- discovery ----------
export async function decodeBroadcast(c: CryptoHex, hex: string): Promise<any | null> {
  const udpKey = await c.md5(utf8ToHex(UDP_KEY_SEED));
  try {
    if (hex.startsWith(P66)) {
      const { frames } = await unpackAll(c, hex, '3.5', udpKey);
      return frames[0] ? parseJson(hexToUtf8(frames[0].payloadHex)) : null;
    }
    const { frames } = await unpackAll(c, hex, '3.3', null);
    if (!frames[0]) return null;
    const p = frames[0].payloadHex;
    if (p.startsWith('7b')) return parseJson(hexToUtf8(p)); // 6666: plain
    return parseJson(hexToUtf8(unpkcs7(await c.aesEcb(false, udpKey, p))));
  } catch { return null; }
}

/** Listens for Tuya broadcasts (6666 plain, 6667 encrypted, 7000 v3.5). Returns [{ip, gwId, version, productKey, ...}]. */
export async function discover(c: CryptoHex, net: NetHex, durationMs = 6000): Promise<any[]> {
  const pkts = await net.udpListen([6666, 6667, 7000], durationMs);
  const out: Record<string, any> = {};
  for (const p of pkts) {
    const d = await decodeBroadcast(c, p.hex);
    if (d && typeof d === 'object' && (d.gwId || d.devId)) out[d.gwId || d.devId] = { ip: d.ip || p.from, ...d, port: p.localPort };
  }
  return Object.values(out);
}

/** ctx.tuyaLocal(cfg): finds IP by broadcast if missing; each call opens a connection, does the op, closes. */
export function makeTuyaLocal(c: CryptoHex, net: NetHex, cfg: TuyaCfg) {
  if (!cfg || !cfg.id) throw new Error('tuyaLocal: "id" (Geräte-ID) fehlt');
  keyHex(cfg.localKey);
  let ip = cfg.ip; let version = cfg.version;
  const resolve = async () => {
    if (ip) return;
    const found = (await discover(c, net, 6000)).find((d) => d.gwId === cfg.id || d.devId === cfg.id);
    if (!found) throw new Error(`tuyaLocal: Gerät ${cfg.id} nicht per UDP-Broadcast gefunden (6 s) – gleiches WLAN? Lampe an? Sonst ip angeben`);
    ip = found.ip; version = version || found.version;
    cfg.debug?.(`[tuya] gefunden: ${ip} v${found.version}`);
  };
  const run = async <T>(fn: (cl: TuyaLocalClient) => Promise<T>): Promise<T> => {
    await resolve();
    const cl = new TuyaLocalClient(c, net, { ...cfg, ip: ip!, version: version || '3.3' });
    try { return await fn(cl); } finally { await cl.close(); }
  };
  return {
    status: () => run((cl) => cl.status()),
    set: (dps: Record<string, any>) => run((cl) => cl.set(dps)),
    get ip() { return ip; },
  };
}
