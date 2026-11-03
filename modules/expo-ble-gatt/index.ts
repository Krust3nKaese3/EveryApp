import { requireOptionalNativeModule } from 'expo-modules-core';
import { PermissionsAndroid, Platform } from 'react-native';
const Native: any = requireOptionalNativeModule('ExpoBleGatt');
const NEXT = 'BLE (GATT) braucht nächsten Build';
export const isAvailable = () => !!Native;
const need = () => { if (!Native) throw new Error(NEXT); return Native; };

export function toHex(data: number[] | string | Uint8Array): string {
  if (typeof data === 'string') return data.replace(/[^0-9a-fA-F]/g, '').toLowerCase();
  return Array.from(data).map((b) => (Number(b) & 0xff).toString(16).padStart(2, '0')).join('');
}
export const hexToBytes = (h?: string | null) => (h ? (h.match(/../g) || []).map((x) => parseInt(x, 16)) : []);

/** Asks BLUETOOTH_SCAN + BLUETOOTH_CONNECT with explanation (Android 12+). Headless: only checks. */
export async function ensurePermissions(interactive = true): Promise<void> {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 31) return;
  const P: any = PermissionsAndroid.PERMISSIONS;
  const perms = [P.BLUETOOTH_SCAN, P.BLUETOOTH_CONNECT];
  const have = await Promise.all(perms.map((p) => PermissionsAndroid.check(p)));
  if (have.every(Boolean)) return;
  if (!interactive) throw new Error('BLE-Berechtigung fehlt (Geräte in der Nähe) – einmal in EveryMacro → BLE-Info scannen');
  const r: any = await PermissionsAndroid.requestMultiple(perms);
  if (!perms.every((p) => r[p] === 'granted')) throw new Error('BLE-Berechtigung „Geräte in der Nähe“ abgelehnt – in den App-Einstellungen erlauben');
}

export async function scan(o: { durationMs?: number; namePrefix?: string } = {}, interactive = true) {
  const n = need(); await ensurePermissions(interactive);
  return await n.scan(o.durationMs ?? 4000, o.namePrefix ?? null);
}
export async function connect(addr: string, o: { timeoutMs?: number } = {}, interactive = true) {
  const n = need(); await ensurePermissions(interactive);
  return await n.connect(addr, o.timeoutMs ?? 10000);
}
export const disconnect = async (addr: string) => need().disconnect(addr);
export async function write(addr: string, svc: string, chr: string, data: number[] | string, o: { withResponse?: boolean; timeoutMs?: number } = {}) {
  return await need().write(addr, svc, chr, toHex(data), o.withResponse ?? null, o.timeoutMs ?? 10000);
}
export async function read(addr: string, svc: string, chr: string, o: { timeoutMs?: number } = {}) {
  const hex: string | null = await need().read(addr, svc, chr, o.timeoutMs ?? 10000);
  return { hex, bytes: hexToBytes(hex) };
}
export async function notify(addr: string, svc: string, chr: string, enable = true, o: { timeoutMs?: number } = {}) {
  return await need().notify(addr, svc, chr, enable, o.timeoutMs ?? 10000);
}
export function makeApi(interactive: boolean) {
  return {
    isAvailable,
    scan: (o?: any) => scan(o, interactive),
    connect: (a: string, o?: any) => connect(a, o, interactive),
    disconnect, write, read, notify, toHex, hexToBytes,
  };
}
