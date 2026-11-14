/**
 * Strict bridge surface. Only names in BRIDGE_METHODS may be called.
 * There is no method for the file system, contacts, or location.
 */
import { Permission } from '../types';

export const STORAGE_LIMITS = {
  maxKeyChars: 128,
  maxValueBytes: 256 * 1024,
};

export interface RateRule {
  max: number;
  windowMs: number;
}

const DEFAULT_RATE: RateRule = { max: 40, windowMs: 10_000 };
const STORAGE_RATE: RateRule = { max: 60, windowMs: 10_000 };
const HTTP_RATE: RateRule = { max: 20, windowMs: 10_000 };
const SCAN_RATE: RateRule = { max: 3, windowMs: 20_000 };
const SENSOR_RATE: RateRule = { max: 10, windowMs: 10_000 };
const NOTIFY_RATE: RateRule = { max: 5, windowMs: 60_000 };
const NET_RATE: RateRule = { max: 12, windowMs: 10_000 };

export interface MethodSpec {
  category: Permission | 'events';
  action: string;
  rate: RateRule;
  validate: (args: unknown[]) => unknown[];
}

type SpecInput = Omit<MethodSpec, 'rate'> & { rate?: RateRule };

function method(spec: SpecInput): MethodSpec {
  return { ...spec, rate: spec.rate || DEFAULT_RATE };
}

export function utf8Bytes(value: string): number {
  let n = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      n += 4;
      i += 1;
    } else n += 3;
  }
  return n;
}

export function assertStorageKey(key: unknown): string {
  if (typeof key !== 'string' || key.length === 0 || key.length > STORAGE_LIMITS.maxKeyChars) {
    throw new Error(`Ungültiger Speicherschlüssel (1–${STORAGE_LIMITS.maxKeyChars} Zeichen).`);
  }
  if (/[\u0000-\u001f\u007f]/.test(key)) throw new Error('Speicherschlüssel enthält ungültige Zeichen.');
  return key;
}

export function assertStorageValue(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Speicherwerte müssen Text sein.');
  if (utf8Bytes(value) > STORAGE_LIMITS.maxValueBytes) {
    throw new Error(`Speicherwert ist zu groß (höchstens ${STORAGE_LIMITS.maxValueBytes} Bytes).`);
  }
  return value;
}

export function storageRecordKey(appId: string, key: string): string {
  return `@miniapp_${appId}_${assertStorageKey(key)}`;
}

function str(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string') throw new Error(`${label} muss Text sein.`);
  if (value.length > max) throw new Error(`${label} ist zu lang.`);
  if (value.includes('\0')) throw new Error(`${label} ist ungültig.`);
  return value;
}

function optStr(value: unknown, label: string, max: number): string | undefined {
  if (value == null) return undefined;
  return str(value, label, max);
}

function num(value: unknown, label: string, min: number, max: number, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} muss eine Zahl sein.`);
  if (integer && !Number.isInteger(value)) throw new Error(`${label} muss eine ganze Zahl sein.`);
  if (value < min || value > max) throw new Error(`${label} liegt außerhalb des erlaubten Bereichs.`);
  return value;
}

function optNum(value: unknown, label: string, min: number, max: number, integer = false): number | undefined {
  if (value == null) return undefined;
  return num(value, label, min, max, integer);
}

function bool(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} muss wahr oder falsch sein.`);
  return value;
}

function slotOrName(value: unknown): string | number {
  if (typeof value === 'number') return num(value, 'Kachel', 1, 5, true);
  return idStr(value, 'Kachel');
}

function bytePayload(value: unknown, label: string): unknown {
  if (typeof value === 'string') return str(value, label, STORAGE_LIMITS.maxValueBytes);
  if (Array.isArray(value)) {
    if (value.length > 65_536) throw new Error(`${label} ist zu groß.`);
    return value.map((item) => num(item, label, 0, 255, true));
  }
  throw new Error(`${label} muss Text oder eine Byte-Liste sein.`);
}

function boundedJson(value: unknown, label: string, max: number): unknown {
  if (typeof value === 'string') return str(value, label, max);
  if (typeof value === 'number') return num(value, label, -1e15, 1e15);
  if (typeof value === 'boolean' || value == null) return value;
  let json: string;
  try {
    json = JSON.stringify(value);
  } catch {
    throw new Error(`${label} lässt sich nicht lesen.`);
  }
  if (!json || json.length > max) throw new Error(`${label} ist zu groß.`);
  return value;
}

const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function plainObject(value: unknown, label: string, maxJson: number): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} muss ein Objekt sein.`);
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (FORBIDDEN_KEYS.has(key)) throw new Error(`${label} enthält ein unerlaubtes Feld.`);
  }
  let json: string;
  try {
    json = JSON.stringify(record);
  } catch {
    throw new Error(`${label} lässt sich nicht lesen.`);
  }
  if (json.length > maxJson) throw new Error(`${label} ist zu groß.`);
  return record;
}

function optObject(value: unknown, label: string, maxJson: number): Record<string, unknown> | undefined {
  if (value == null) return undefined;
  return plainObject(value, label, maxJson);
}

export function assertHttpUrl(value: unknown): string {
  const url = str(value, 'URL', 4096);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Ungültige URL.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Nur http- und https-Adressen sind erlaubt.');
  }
  return url;
}

function stringMap(value: unknown, label: string, maxEntries: number, maxValue: number): Record<string, string> {
  const obj = plainObject(value, label, 32_000);
  const keys = Object.keys(obj);
  if (keys.length > maxEntries) throw new Error(`${label} hat zu viele Einträge.`);
  const out: Record<string, string> = {};
  for (const key of keys) {
    if (key.length > 128) throw new Error(`${label} hat einen zu langen Namen.`);
    const item = obj[key];
    if (typeof item !== 'string' || item.length > maxValue) throw new Error(`${label} enthält einen ungültigen Wert.`);
    out[key] = item;
  }
  return out;
}

function httpRequest(value: unknown): Record<string, unknown> {
  const req = plainObject(value, 'HTTP-Anfrage', 300_000);
  const url = assertHttpUrl(req.url);
  const method = req.method == null ? undefined : str(req.method, 'HTTP-Methode', 16);
  const headers = req.headers == null ? undefined : stringMap(req.headers, 'HTTP-Header', 40, 4096);
  const body = req.body == null ? undefined : str(req.body, 'HTTP-Body', 200_000);
  const timeoutMs = optNum(req.timeoutMs, 'Zeitlimit', 1, 120_000, true);
  return { url, method, headers, body, timeoutMs };
}

function httpOptions(value: unknown): Record<string, unknown> | undefined {
  if (value == null) return undefined;
  const opt = plainObject(value, 'HTTP-Optionen', 300_000);
  return {
    method: opt.method == null ? undefined : str(opt.method, 'HTTP-Methode', 16),
    headers: opt.headers == null ? undefined : stringMap(opt.headers, 'HTTP-Header', 40, 4096),
    body: opt.body == null ? undefined : str(opt.body, 'HTTP-Body', 200_000),
  };
}

function hostName(value: unknown): string {
  const host = str(value, 'Host', 253);
  if (host.includes('://') || host.includes('/') || host.includes(' ') || host.includes('\\')) {
    throw new Error('Ungültiger Host.');
  }
  return host;
}

function portNum(value: unknown): number {
  return num(value, 'Port', 1, 65535, true);
}

function idStr(value: unknown, label = 'Kennung'): string {
  return str(value, label, 256);
}

function exact(args: unknown[], min: number, max: number): void {
  if (!Array.isArray(args) || args.length < min || args.length > max) {
    throw new Error('Die Argumente dieser Methode sind ungültig.');
  }
}

function none(args: unknown[]): unknown[] {
  exact(args, 0, 0);
  return [];
}

function storageSet(args: unknown[]): unknown[] {
  exact(args, 2, 2);
  return [assertStorageKey(args[0]), assertStorageValue(args[1])];
}

function storageKeyArg(args: unknown[]): unknown[] {
  exact(args, 1, 1);
  return [assertStorageKey(args[0])];
}

const BRIDGE_METHODS: Record<string, MethodSpec> = {
  'storage.get': method({ category: 'storage', action: 'get', rate: STORAGE_RATE, validate: storageKeyArg }),
  'storage.set': method({ category: 'storage', action: 'set', rate: STORAGE_RATE, validate: storageSet }),
  'storage.remove': method({ category: 'storage', action: 'remove', rate: STORAGE_RATE, validate: storageKeyArg }),

  'secrets.get': method({ category: 'secrets', action: 'get', validate: (a) => (exact(a, 1, 1), [idStr(a[0], 'Secret-Schlüssel')]) }),
  'secrets.set': method({ category: 'secrets', action: 'set', validate: (a) => (exact(a, 2, 2), [idStr(a[0], 'Secret-Schlüssel'), str(a[1], 'Secret', 8000)]) }),
  'secrets.delete': method({ category: 'secrets', action: 'delete', validate: (a) => (exact(a, 1, 1), [idStr(a[0], 'Secret-Schlüssel')]) }),
  'secrets.list': method({ category: 'secrets', action: 'list', validate: none }),
  'secrets.info': method({ category: 'secrets', action: 'info', validate: none }),

  'http.request': method({ category: 'http', action: 'request', rate: HTTP_RATE, validate: (a) => (exact(a, 1, 1), [httpRequest(a[0])]) }),
  'http.fetch': method({ category: 'http', action: 'fetch', rate: HTTP_RATE, validate: (a) => (exact(a, 1, 2), [assertHttpUrl(a[0]), httpOptions(a[1])]) }),

  'bluetooth.scan': method({ category: 'bluetooth', action: 'scan', rate: SCAN_RATE, validate: none }),
  'bluetooth.connect': method({ category: 'bluetooth', action: 'connect', validate: (a) => (exact(a, 1, 1), [idStr(a[0], 'Gerät')]) }),
  'bluetooth.disconnect': method({ category: 'bluetooth', action: 'disconnect', validate: (a) => (exact(a, 1, 1), [idStr(a[0], 'Gerät')]) }),
  'bluetooth.getConnectedDevices': method({ category: 'bluetooth', action: 'getConnectedDevices', validate: (a) => (exact(a, 0, 1), [a.length ? bool(a[0], 'includePaired') : false]) }),

  'notifications.schedule': method({
    category: 'notifications',
    action: 'schedule',
    rate: NOTIFY_RATE,
    validate: (a) => (exact(a, 3, 3), [str(a[0], 'Titel', 180), str(a[1], 'Text', 500), num(a[2], 'Sekunden', 0, 7 * 24 * 3600)]),
  }),

  'camera.takePicture': method({ category: 'camera', action: 'takePicture', validate: none }),
  'sensors.getAccelerometer': method({ category: 'sensors', action: 'getAccelerometer', rate: SENSOR_RATE, validate: none }),
  'sensors.getGyroscope': method({ category: 'sensors', action: 'getGyroscope', rate: SENSOR_RATE, validate: none }),
  'vibration.vibrate': method({
    category: 'vibration',
    action: 'vibrate',
    validate: (a) => {
      exact(a, 0, 1);
      if (a[0] == null) return [undefined];
      if (!Array.isArray(a[0]) || a[0].length > 20) throw new Error('Vibrationsmuster ist ungültig.');
      return [a[0].map((item) => num(item, 'Vibration', 0, 10_000))];
    },
  }),

  'background.enable': method({ category: 'background', action: 'enable', validate: none }),
  'background.disable': method({ category: 'background', action: 'disable', validate: none }),
  'background.isEnabled': method({ category: 'background', action: 'isEnabled', validate: none }),
  'background.handlesTriggers': method({ category: 'background', action: 'handlesTriggers', validate: none }),
  'background.getLog': method({ category: 'background', action: 'getLog', validate: none }),
  'background.clearLog': method({ category: 'background', action: 'clearLog', validate: none }),
  'background.registerTask': method({ category: 'background', action: 'registerTask', validate: (a) => (exact(a, 1, 1), [plainObject(a[0], 'Aufgabe', 100_000)]) }),
  'background.unregisterTask': method({ category: 'background', action: 'unregisterTask', validate: (a) => (exact(a, 1, 1), [idStr(a[0])]) }),
  'background.unregisterAll': method({ category: 'background', action: 'unregisterAll', validate: none }),
  'background.listTasks': method({ category: 'background', action: 'listTasks', validate: none }),
  'background.getTileSlots': method({ category: 'background', action: 'getTileSlots', validate: none }),
  'background.setUi': method({ category: 'background', action: 'setUi', validate: (a) => (exact(a, 1, 1), [plainObject(a[0], 'Oberfläche', 100_000)]) }),
  'background.getUi': method({ category: 'background', action: 'getUi', validate: none }),
  'background.tileUpdate': method({ category: 'background', action: 'tileUpdate', validate: (a) => (exact(a, 2, 2), [slotOrName(a[0]), plainObject(a[1], 'Kachel', 32_000)]) }),
  'background.widgetUpdate': method({ category: 'background', action: 'widgetUpdate', validate: (a) => (exact(a, 2, 2), [idStr(a[0]), plainObject(a[1], 'Widget', 64_000)]) }),

  'spotify.isAvailable': method({ category: 'spotify', action: 'isAvailable', validate: none }),
  'spotify.login': method({ category: 'spotify', action: 'login', validate: none }),
  'spotify.logout': method({ category: 'spotify', action: 'logout', validate: none }),
  'spotify.connect': method({ category: 'spotify', action: 'connect', validate: none }),
  'spotify.disconnect': method({ category: 'spotify', action: 'disconnect', validate: none }),
  'spotify.play': method({ category: 'spotify', action: 'play', validate: (a) => (exact(a, 1, 2), [str(a[0], 'Spotify-URI', 512), optObject(a[1], 'Optionen', 2000)]) }),
  'spotify.pause': method({ category: 'spotify', action: 'pause', validate: none }),
  'spotify.resume': method({ category: 'spotify', action: 'resume', validate: none }),
  'spotify.stop': method({ category: 'spotify', action: 'stop', validate: none }),
  'spotify.skipNext': method({ category: 'spotify', action: 'skipNext', validate: none }),
  'spotify.skipPrevious': method({ category: 'spotify', action: 'skipPrevious', validate: none }),
  'spotify.seek': method({ category: 'spotify', action: 'seek', validate: (a) => (exact(a, 1, 1), [num(a[0], 'Position', 0, 24 * 3600 * 1000)]) }),
  'spotify.getPlayerState': method({ category: 'spotify', action: 'getPlayerState', validate: none }),
  'spotify.search': method({ category: 'spotify', action: 'search', validate: (a) => (exact(a, 1, 2), [str(a[0], 'Suche', 200), optObject(a[1], 'Optionen', 2000)]) }),
  'spotify.getMe': method({ category: 'spotify', action: 'getMe', validate: none }),
  'spotify.getMyPlaylists': method({ category: 'spotify', action: 'getMyPlaylists', validate: (a) => (exact(a, 0, 1), [optObject(a[0], 'Optionen', 2000)]) }),
  'spotify.getSavedTracks': method({ category: 'spotify', action: 'getSavedTracks', validate: (a) => (exact(a, 0, 1), [optObject(a[0], 'Optionen', 2000)]) }),
  'spotify.setClientId': method({ category: 'spotify', action: 'setClientId', validate: (a) => (exact(a, 1, 1), [str(a[0], 'Client-ID', 128)]) }),
  'spotify.getClientId': method({ category: 'spotify', action: 'getClientId', validate: none }),

  'media.play': method({ category: 'media', action: 'play', validate: none }),
  'media.pause': method({ category: 'media', action: 'pause', validate: none }),
  'media.toggle': method({ category: 'media', action: 'toggle', validate: none }),
  'media.next': method({ category: 'media', action: 'next', validate: none }),
  'media.previous': method({ category: 'media', action: 'previous', validate: none }),
  'media.stop': method({ category: 'media', action: 'stop', validate: none }),

  'network.isAvailable': method({ category: 'network', action: 'isAvailable', validate: none }),
  'network.getInfo': method({ category: 'network', action: 'getInfo', validate: none }),
  'network.getWifi': method({ category: 'network', action: 'getWifi', validate: none }),

  'popup.open': method({ category: 'popup', action: 'open', validate: (a) => (exact(a, 1, 1), [plainObject(a[0], 'Popup', 64_000)]) }),
  'popup.send': method({ category: 'popup', action: 'send', validate: (a) => (exact(a, 2, 2), [idStr(a[0]), boundedJson(a[1], 'Nachricht', 64_000)]) }),
  'popup.close': method({ category: 'popup', action: 'close', validate: (a) => (exact(a, 0, 1), [optStr(a[0], 'Popup', 256)]) }),
  'popup.state': method({ category: 'popup', action: 'state', validate: (a) => (exact(a, 1, 1), [idStr(a[0])]) }),

  'tiles.set': method({ category: 'tiles', action: 'set', validate: (a) => (exact(a, 2, 2), [num(a[0], 'Kachel', 1, 5, true), plainObject(a[1], 'Kachel', 64_000)]) }),
  'tiles.get': method({ category: 'tiles', action: 'get', validate: (a) => (exact(a, 1, 1), [num(a[0], 'Kachel', 1, 5, true)]) }),
  'tiles.release': method({ category: 'tiles', action: 'release', validate: (a) => (exact(a, 1, 1), [num(a[0], 'Kachel', 1, 5, true)]) }),
  'tiles.fetchSvg': method({ category: 'tiles', action: 'fetchSvg', validate: (a) => (exact(a, 1, 1), [str(a[0], 'Icon', 2000)]) }),

  'net.isAvailable': method({ category: 'net', action: 'isAvailable', validate: none }),
  'net.tcpOpen': method({ category: 'net', action: 'tcpOpen', rate: NET_RATE, validate: (a) => (exact(a, 2, 3), [hostName(a[0]), portNum(a[1]), optObject(a[2], 'Optionen', 4000)]) }),
  'net.tcpSend': method({ category: 'net', action: 'tcpSend', rate: NET_RATE, validate: (a) => (exact(a, 2, 2), [num(a[0], 'Socket', 1, 1_000_000, true), bytePayload(a[1], 'Daten')]) }),
  'net.tcpReceive': method({ category: 'net', action: 'tcpReceive', rate: NET_RATE, validate: (a) => (exact(a, 1, 2), [num(a[0], 'Socket', 1, 1_000_000, true), optObject(a[1], 'Optionen', 4000)]) }),
  'net.tcpClose': method({ category: 'net', action: 'tcpClose', validate: (a) => (exact(a, 1, 1), [num(a[0], 'Socket', 1, 1_000_000, true)]) }),
  'net.udpSend': method({ category: 'net', action: 'udpSend', rate: NET_RATE, validate: (a) => (exact(a, 3, 4), [hostName(a[0]), portNum(a[1]), bytePayload(a[2], 'Daten'), optObject(a[3], 'Optionen', 4000)]) }),
  'net.udpListen': method({ category: 'net', action: 'udpListen', rate: SCAN_RATE, validate: (a) => {
    exact(a, 1, 2);
    if (!Array.isArray(a[0]) || a[0].length < 1 || a[0].length > 8) throw new Error('UDP-Ports sind ungültig.');
    return [a[0].map((item) => portNum(item)), optNum(a[1], 'Dauer', 100, 30_000, true)];
  } }),
  'net.tuyaStatus': method({ category: 'net', action: 'tuyaStatus', rate: NET_RATE, validate: (a) => (exact(a, 1, 1), [plainObject(a[0], 'Tuya', 8000)]) }),
  'net.tuyaSet': method({ category: 'net', action: 'tuyaSet', rate: NET_RATE, validate: (a) => (exact(a, 2, 2), [plainObject(a[0], 'Tuya', 8000), plainObject(a[1], 'Datenpunkte', 8000)]) }),
  'net.tuyaDiscover': method({ category: 'net', action: 'tuyaDiscover', rate: SCAN_RATE, validate: (a) => (exact(a, 0, 1), [optNum(a[0], 'Dauer', 100, 30_000, true)]) }),

  'crypto.isAvailable': method({ category: 'crypto', action: 'isAvailable', validate: none }),
  'crypto.aesEcb': method({ category: 'crypto', action: 'aesEcb', validate: (a) => (exact(a, 3, 3), [bool(a[0], 'Verschlüsseln'), str(a[1], 'Schlüssel', 4096), str(a[2], 'Daten', STORAGE_LIMITS.maxValueBytes)]) }),
  'crypto.aesGcm': method({ category: 'crypto', action: 'aesGcm', validate: (a) => (exact(a, 5, 5), [bool(a[0], 'Verschlüsseln'), str(a[1], 'Schlüssel', 4096), str(a[2], 'IV', 4096), str(a[3], 'AAD', 8192), str(a[4], 'Daten', STORAGE_LIMITS.maxValueBytes)]) }),
  'crypto.hmacSha256': method({ category: 'crypto', action: 'hmacSha256', validate: (a) => (exact(a, 2, 2), [str(a[0], 'Schlüssel', 4096), str(a[1], 'Daten', STORAGE_LIMITS.maxValueBytes)]) }),
  'crypto.md5': method({ category: 'crypto', action: 'md5', validate: (a) => (exact(a, 1, 1), [str(a[0], 'Daten', STORAGE_LIMITS.maxValueBytes)]) }),
  'crypto.crc32': method({ category: 'crypto', action: 'crc32', validate: (a) => (exact(a, 1, 1), [str(a[0], 'Daten', STORAGE_LIMITS.maxValueBytes)]) }),
  'crypto.randomHex': method({ category: 'crypto', action: 'randomHex', validate: (a) => (exact(a, 1, 1), [num(a[0], 'Länge', 1, 64, true)]) }),

  'ble.isAvailable': method({ category: 'ble', action: 'isAvailable', validate: none }),
  'ble.scan': method({ category: 'ble', action: 'scan', rate: SCAN_RATE, validate: (a) => (exact(a, 0, 1), [optObject(a[0], 'Scan', 4000)]) }),
  'ble.connect': method({ category: 'ble', action: 'connect', validate: (a) => (exact(a, 1, 2), [idStr(a[0], 'Adresse'), optObject(a[1], 'Optionen', 4000)]) }),
  'ble.disconnect': method({ category: 'ble', action: 'disconnect', validate: (a) => (exact(a, 1, 1), [idStr(a[0], 'Adresse')]) }),
  'ble.write': method({ category: 'ble', action: 'write', validate: (a) => (exact(a, 4, 5), [idStr(a[0], 'Adresse'), idStr(a[1], 'Service'), idStr(a[2], 'Characteristic'), bytePayload(a[3], 'Daten'), optObject(a[4], 'Optionen', 4000)]) }),
  'ble.read': method({ category: 'ble', action: 'read', validate: (a) => (exact(a, 3, 4), [idStr(a[0], 'Adresse'), idStr(a[1], 'Service'), idStr(a[2], 'Characteristic'), optObject(a[3], 'Optionen', 4000)]) }),
  'ble.notify': method({ category: 'ble', action: 'notify', validate: (a) => (exact(a, 4, 5), [idStr(a[0], 'Adresse'), idStr(a[1], 'Service'), idStr(a[2], 'Characteristic'), bool(a[3], 'Aktiv'), optObject(a[4], 'Optionen', 4000)]) }),

  'clipboard.setString': method({ category: 'clipboard', action: 'setString', validate: (a) => (exact(a, 1, 1), [str(a[0], 'Text', 64_000)]) }),
  'clipboard.getString': method({ category: 'clipboard', action: 'getString', validate: none }),
};

export function bridgeMethod(name: string): MethodSpec | null {
  return Object.prototype.hasOwnProperty.call(BRIDGE_METHODS, name) ? BRIDGE_METHODS[name] : null;
}

export function bridgeMethodNames(): string[] {
  return Object.keys(BRIDGE_METHODS);
}

/** Events the WebView may subscribe to, and the permission each one needs. */
export const BRIDGE_EVENTS: Record<string, Permission | null> = {
  'app.start': null,
  'bluetooth.connected': 'bluetooth',
  'bluetooth.disconnected': 'bluetooth',
  'spotify.connected': 'spotify',
  'spotify.disconnected': 'spotify',
  'spotify.player': 'spotify',
  'spotify.error': 'spotify',
};

export type ParsedMessage =
  | { kind: 'call'; id: unknown; method: string; args: unknown[] }
  | { kind: 'event'; id: unknown; event: string; action: 'on' | 'off' }
  | { kind: 'reject'; id: unknown; error: string };

export function parseBridgeMessage(message: unknown): ParsedMessage {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return { kind: 'reject', id: undefined, error: 'Unbekannte Nachricht.' };
  }
  const row = message as Record<string, unknown>;
  const id = row.id;
  if (row.type === 'event') {
    if (row.action !== 'on' && row.action !== 'off') {
      return { kind: 'reject', id, error: 'Unbekannte Event-Aktion.' };
    }
    if (typeof row.event !== 'string' || !Object.prototype.hasOwnProperty.call(BRIDGE_EVENTS, row.event)) {
      return { kind: 'reject', id, error: 'Unbekanntes Event.' };
    }
    return { kind: 'event', id, event: row.event, action: row.action };
  }
  if (row.type != null) return { kind: 'reject', id, error: 'Unbekannter Nachrichtentyp.' };
  if (typeof row.method !== 'string' || !row.method) return { kind: 'reject', id, error: 'Methode fehlt.' };
  if (row.args != null && !Array.isArray(row.args)) return { kind: 'reject', id, error: 'Argumente müssen eine Liste sein.' };
  if (Array.isArray(row.args) && row.args.length > 8) return { kind: 'reject', id, error: 'Zu viele Argumente.' };
  return { kind: 'call', id, method: row.method, args: Array.isArray(row.args) ? row.args : [] };
}

const rateHits = new Map<string, number[]>();

export function takeRate(appId: string, methodName: string, rule: RateRule, now = Date.now()): boolean {
  const bucket = `${appId}\0${methodName}`;
  const prev = (rateHits.get(bucket) || []).filter((stamp) => now - stamp < rule.windowMs);
  if (prev.length >= rule.max) {
    rateHits.set(bucket, prev);
    return false;
  }
  prev.push(now);
  rateHits.set(bucket, prev);
  return true;
}

export function clearRate(appId?: string): void {
  if (!appId) {
    rateHits.clear();
    return;
  }
  const prefix = `${appId}\0`;
  for (const key of rateHits.keys()) {
    if (key.startsWith(prefix)) rateHits.delete(key);
  }
}

export const RATE_LIMIT_ERROR = 'Zu viele Anfragen. Bitte kurz warten.';
