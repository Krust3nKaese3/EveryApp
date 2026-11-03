/**
 * Secrets per mini-app, keyed by secret KEY (not by macro), scoped by appId.
 * LITE (current APK): unencrypted app-internal AsyncStorage.
 * Next build: expo-secure-store (Android Keystore). If its native module is present,
 * secrets are read/written there and lite entries are migrated automatically (then removed).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { maskWith } from './secretMask';
export { maskWith };

const KEY_RE = /^[A-Za-z0-9_.-]{1,64}$/;
const liteKey = (appId: string, k: string) => `@secret_${appId}_${k}`;
const indexKey = (appId: string) => `@secret_index_${appId}`;
// SecureStore keys only allow [A-Za-z0-9._-]
const secureKey = (appId: string, k: string) => `ea_${appId.replace(/[^A-Za-z0-9._-]/g, '_')}_${k}`;

const Secure: any = (() => { try { return requireOptionalNativeModule('ExpoSecureStore'); } catch { return null; } })();
export const secretsEncrypted = () => !!Secure;

function check(k: string) { if (!KEY_RE.test(String(k))) throw new Error(`Ungültiger Secret-Key: ${k}`); }

async function readIndex(appId: string): Promise<string[]> {
  try { return JSON.parse((await AsyncStorage.getItem(indexKey(appId))) || '[]'); } catch { return []; }
}
async function writeIndex(appId: string, keys: string[]) {
  await AsyncStorage.setItem(indexKey(appId), JSON.stringify(Array.from(new Set(keys)).sort()));
}

const cache: Record<string, Record<string, string>> = {}; // appId -> key -> value (for log masking)
const migrated: Record<string, boolean> = {};

async function migrate(appId: string) {
  if (!Secure || migrated[appId]) return;
  migrated[appId] = true;
  for (const k of await readIndex(appId)) {
    const v = await AsyncStorage.getItem(liteKey(appId, k));
    if (v != null) {
      try {
        await Secure.setValueWithKeyAsync(v, secureKey(appId, k), {});
        await AsyncStorage.removeItem(liteKey(appId, k));
        console.log(`[EveryApp][secrets] ${appId}: ${k} nach SecureStore migriert`);
      } catch (e: any) { console.error(`[EveryApp][secrets] Migration ${k} fehlgeschlagen: ${e?.message || e}`); }
    }
  }
}

export const SecretStore = {
  async get(appId: string, k: string): Promise<string | null> {
    check(k); await migrate(appId);
    let v: string | null = null;
    if (Secure) v = (await Secure.getValueWithKeyAsync(secureKey(appId, k), {})) ?? null;
    if (v == null) v = await AsyncStorage.getItem(liteKey(appId, k));
    if (v != null) (cache[appId] = cache[appId] || {})[k] = v;
    return v;
  },
  async set(appId: string, k: string, value: string) {
    check(k); await migrate(appId);
    const v = String(value ?? '');
    if (!v) return SecretStore.delete(appId, k);
    if (Secure) await Secure.setValueWithKeyAsync(v, secureKey(appId, k), {});
    else await AsyncStorage.setItem(liteKey(appId, k), v);
    await writeIndex(appId, [...(await readIndex(appId)), k]);
    (cache[appId] = cache[appId] || {})[k] = v;
  },
  async delete(appId: string, k: string) {
    check(k);
    if (Secure) { try { await Secure.deleteValueWithKeyAsync(secureKey(appId, k), {}); } catch {} }
    await AsyncStorage.removeItem(liteKey(appId, k));
    await writeIndex(appId, (await readIndex(appId)).filter((x) => x !== k));
    if (cache[appId]) delete cache[appId][k];
  },
  /** Keys only, never values. */
  async list(appId: string): Promise<string[]> { await migrate(appId); return readIndex(appId); },
  async getAll(appId: string): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const k of await readIndex(appId)) { const v = await SecretStore.get(appId, k); if (v != null) out[k] = v; }
    return out;
  },
  info() { return { encrypted: !!Secure, backend: Secure ? 'expo-secure-store' : 'lite (AsyncStorage, unverschlüsselt)' }; },
};

/** Replace any known secret value of this app in a string with •••. */
export function maskSecrets(appId: string, s: string): string {
  return maskWith(Object.values(cache[appId] || {}), s);
}
/** ctx.secrets for background tasks: preloaded values, clear error on missing key. */
export async function secretsProxy(appId: string): Promise<any> {
  const all = await SecretStore.getAll(appId);
  return new Proxy(all, {
    get(t, p) {
      if (typeof p !== 'string' || p === 'then' || p === 'toJSON') return undefined;
      if (!(p in t)) throw new Error(`Secret ${p} fehlt – in EveryMacro beim Makro unter „🔑 Secrets“ eintragen`);
      return t[p];
    },
    set() { throw new Error('ctx.secrets ist schreibgeschützt'); },
    ownKeys: (t) => Reflect.ownKeys(t), getOwnPropertyDescriptor: (t, p) => Reflect.getOwnPropertyDescriptor(t, p),
  });
}
