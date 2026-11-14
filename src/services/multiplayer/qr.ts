/**
 * Der QR-Code trägt die lokale Adresse, den Port, den Raumcode und ein Token.
 * Das Schema everyapp-mp:// ist kein GitHub-Link und wird nicht als Mini-App installiert.
 */
export interface JoinTarget {
  v: 1;
  host: string;
  port: number;
  room: string;
  token: string;
  appId: string;
}

export interface LanCandidate {
  name: string;
  ip: string;
}

const ROOM_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/;
const TOKEN_RE = /^[a-f0-9]{16}$/;

export function isPrivateIPv4(host: string): boolean {
  const parts = host.split('.');
  if (parts.length !== 4) return false;
  const nums = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : NaN));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const a = nums[0];
  const b = nums[1];
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

/**
 * Eine Adresse für den QR-Code.
 * WLAN (wlan0/en0) vor Hotspot (ap/bridge), damit Gäste im selben Netz die erreichbare Adresse sehen.
 * Ein Hotspot ohne WLAN-Client fällt auf die Hotspot-Adresse zurück.
 */
export function chooseLanIPv4(candidates: LanCandidate[]): string | null {
  const usable = candidates.filter((row) => row && isPrivateIPv4(row.ip) && !/^lo/i.test(row.name || ''));
  const wifi = usable.find((row) => /^(wlan0|en0|eth0)$/i.test(row.name));
  if (wifi) return wifi.ip;
  const otherWifi = usable.find((row) => /^(wlan|en|eth)\d*$/i.test(row.name));
  if (otherWifi) return otherWifi.ip;
  const hotspot = usable.find((row) => /(^ap)|softap|swlan|bridge/i.test(row.name));
  if (hotspot) return hotspot.ip;
  return usable[0]?.ip ?? null;
}

export function encodeJoinUrl(target: JoinTarget): string {
  if (!isPrivateIPv4(target.host)) throw new Error('Nur Adressen im lokalen Netz sind erlaubt.');
  if (!Number.isInteger(target.port) || target.port < 1024 || target.port > 65535) throw new Error('Ungültiger Port.');
  if (!ROOM_RE.test(target.room) || !TOKEN_RE.test(target.token)) throw new Error('Raumdaten sind ungültig.');
  if (!target.appId || target.appId.length > 200) throw new Error('Mini-App fehlt.');
  const query = new URLSearchParams({
    v: '1',
    host: target.host,
    port: String(target.port),
    room: target.room,
    token: target.token,
    app: target.appId,
  });
  return `everyapp-mp://join?${query.toString()}`;
}

export function decodeJoinUrl(text: string): JoinTarget {
  const raw = String(text || '').trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Das ist kein EveryApp-Spielraum.');
  }
  if (url.protocol !== 'everyapp-mp:' || url.hostname !== 'join') throw new Error('Das ist kein EveryApp-Spielraum.');
  if (url.searchParams.get('v') !== '1') throw new Error('Diese Einladung ist zu neu oder zu alt.');
  const host = url.searchParams.get('host') || '';
  if (!isPrivateIPv4(host)) throw new Error('Nur Adressen im lokalen Netz sind erlaubt.');
  const port = Number(url.searchParams.get('port'));
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Ungültiger Port.');
  const room = (url.searchParams.get('room') || '').toUpperCase();
  const token = (url.searchParams.get('token') || '').toLowerCase();
  const appId = url.searchParams.get('app') || '';
  if (!ROOM_RE.test(room) || !TOKEN_RE.test(token)) throw new Error('Raumcode oder Token fehlt.');
  if (!appId || appId.length > 200) throw new Error('Mini-App fehlt.');
  return { v: 1, host, port, room, token, appId };
}
