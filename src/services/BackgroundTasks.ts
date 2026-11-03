/**
 * Generic host-side background task engine for mini-apps. See docs/BACKGROUND.md.
 * Tasks are registered per appId via the bridge (background.registerTask) and run in the RN JS runtime,
 * which is started headlessly by native receivers (Bluetooth ACL, boot) even if the UI is closed.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Vibration } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Clipboard from 'expo-clipboard';
import { sendMediaKey } from '../../modules/expo-media-control';
import { BackgroundService } from './BackgroundService';
import { requireOptionalNativeModule } from 'expo-modules-core';
import * as ClassicBluetooth from '../../modules/expo-classic-bluetooth';

export type Trigger =
  | { type: 'bluetoothConnected'; nameOrAddress?: string | null }
  | { type: 'bluetoothDisconnected'; nameOrAddress?: string | null }
  | { type: 'interval'; ms: number }
  | { type: 'boot' }
  | { type: 'appStart' }
  | { type: 'quickTile'; name: string };

export interface BackgroundTask {
  id: string;
  name?: string;
  triggers: Trigger[];
  /** JS function body; runs as `async (ctx, event) => { <code> }` */
  code: string;
  registeredAt?: number;
}

export interface TriggerEvent { type: string; tile?: { index: number; name: string }; device?: { name?: string; alias?: string; address?: string; [k: string]: any }; time: number }

const TASKS_KEY = '@everyapp_bg_tasks';
const MIN_INTERVAL = 10_000;
const LOG_LIMIT = 200;
const sk = (appId: string, k: string) => `@miniapp_${appId}_${k}`;
const tag = (appId: string, taskId: string) => `[EveryApp][BG][${appId}/${taskId}]`;

type Registry = Record<string, Record<string, BackgroundTask>>;

async function readRegistry(): Promise<Registry> {
  try { return JSON.parse((await AsyncStorage.getItem(TASKS_KEY)) || '{}'); } catch { return {}; }
}
async function writeRegistry(r: Registry) { await AsyncStorage.setItem(TASKS_KEY, JSON.stringify(r)); }

export async function bgLog(appId: string, message: string, level: 'info' | 'error' = 'info') {
  const line = `[EveryApp][BG][${appId}] ${message}`;
  if (level === 'error') console.error(line); else console.log(line);
  try {
    const raw = await AsyncStorage.getItem(sk(appId, 'background_log'));
    const list = raw ? JSON.parse(raw) : [];
    list.unshift({ message, level, timestamp: new Date().toLocaleTimeString('de-DE'), time: Date.now() });
    await AsyncStorage.setItem(sk(appId, 'background_log'), JSON.stringify(list.slice(0, LOG_LIMIT)));
  } catch (e) { console.error('[EveryApp][BG] log write failed', e); }
}

function validate(task: any): BackgroundTask {
  if (!task || typeof task.id !== 'string' || !task.id) throw new Error('registerTask: "id" (string) fehlt');
  if (!Array.isArray(task.triggers) || task.triggers.length === 0) throw new Error('registerTask: "triggers" (Array) fehlt');
  if (typeof task.code !== 'string') throw new Error('registerTask: "code" (String mit Funktionskörper) fehlt');
  for (const t of task.triggers) {
    if (!['bluetoothConnected', 'bluetoothDisconnected', 'interval', 'boot', 'appStart', 'quickTile'].includes(t?.type))
      throw new Error(`registerTask: unbekannter Trigger "${t?.type}"`);
    if (t.type === 'quickTile' && !(typeof t.name === 'string' && t.name.trim())) throw new Error('registerTask: quickTile braucht einen Namen');
    if (t.type === 'interval' && !(t.ms >= MIN_INTERVAL)) throw new Error(`registerTask: interval.ms muss >= ${MIN_INTERVAL} sein`);
  }
  compile(task.code); // throws on syntax error
  return { id: task.id, name: task.name || task.id, triggers: task.triggers, code: task.code, registeredAt: Date.now() };
}

function compile(code: string): (ctx: any, event: any) => Promise<any> {
  try {
    // eslint-disable-next-line no-new-func
    return new Function('ctx', 'event', `return (async () => {\n${code}\n})();`) as any;
  } catch (e: any) {
    throw new Error(`Syntaxfehler im Task-Code: ${e?.message}`);
  }
}

export const BackgroundTasks = {
  async register(appId: string, task: any) {
    const t = validate(task);
    const r = await readRegistry();
    r[appId] = { ...(r[appId] || {}), [t.id]: t };
    await writeRegistry(r);
    await bgLog(appId, `Task "${t.id}" registriert (${t.triggers.map((x) => x.type).join(', ')})`);
    restartTimers();
  },
  async unregister(appId: string, taskId: string) {
    const r = await readRegistry();
    if (r[appId]) delete r[appId][taskId];
    await writeRegistry(r);
    await bgLog(appId, `Task "${taskId}" entfernt`);
    restartTimers();
  },
  async unregisterAll(appId: string) {
    const r = await readRegistry();
    delete r[appId];
    await writeRegistry(r);
    restartTimers();
  },
  async list(appId: string): Promise<BackgroundTask[]> {
    return Object.values((await readRegistry())[appId] || {});
  },
  async getLog(appId: string): Promise<string> {
    return (await AsyncStorage.getItem(sk(appId, 'background_log'))) || '[]';
  },
  async clearLog(appId: string) { await AsyncStorage.removeItem(sk(appId, 'background_log')); },
};

async function httpRequest(req: { url: string; method?: string; headers?: any; body?: any; timeoutMs?: number }) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), req.timeoutMs || 15000);
  try {
    const res = await fetch(req.url, { method: req.method || 'GET', headers: req.headers, body: req.body, signal: controller.signal });
    const body = await res.text();
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => { headers[k] = v; });
    return { status: res.status, ok: res.ok, headers, body };
  } catch (e: any) {
    throw new Error(`HTTP ${req.method || 'GET'} ${req.url} fehlgeschlagen: ${e?.message || e}`);
  } finally { clearTimeout(t); }
}

function createCtx(appId: string, task: BackgroundTask) {
  return {
    appId,
    taskId: task.id,
    log: (m: any) => { bgLog(appId, `[${task.name || task.id}] ${typeof m === 'string' ? m : JSON.stringify(m)}`); },
    wait: (ms: number) => new Promise((r) => setTimeout(r, ms)),
    http: {
      request: (o: any) => httpRequest(o),
      get: (url: string) => httpRequest({ url, method: 'GET' }),
    },
    notify: async (title: string, body: string) => {
      await Notifications.scheduleNotificationAsync({ content: { title, body }, trigger: null });
    },
    media: {
      play: () => sendMediaKey('play'), pause: () => sendMediaKey('pause'), toggle: () => sendMediaKey('toggle'),
      next: () => sendMediaKey('next'), previous: () => sendMediaKey('previous'), stop: () => sendMediaKey('stop'),
    },
    bluetooth: {
      getConnectedDevices: async () => await ClassicBluetooth.getConnectedDevicesAsync(false),
      isConnected: async (x: string) => (await ClassicBluetooth.getConnectedDevicesAsync(false)).some((d: any) => deviceMatches(x, d)),
    },
    copy: async (text: string) => { await Clipboard.setStringAsync(String(text ?? '')); },
    vibrate: (pattern?: number[]) => {
      if (pattern && pattern.length) Vibration.vibrate([0, ...pattern]); else Vibration.vibrate(200);
    },
    // Same keys as the WebView bridge's EveryAppBridge.storage -> data is shared with the mini-app UI
    storage: {
      get: (k: string) => AsyncStorage.getItem(sk(appId, k)),
      set: (k: string, v: string) => AsyncStorage.setItem(sk(appId, k), String(v)),
      remove: (k: string) => AsyncStorage.removeItem(sk(appId, k)),
    },
  };
}

/** x matches if it equals name OR alias OR address (case-insensitive, trimmed). */
export function deviceMatches(x: string, d?: { name?: string; alias?: string; address?: string }) {
  const n = (v: any) => String(v ?? '').trim().toLowerCase();
  const want = n(x);
  return !!d && want !== '' && [d.name, d.alias, d.address].some((v) => n(v) === want);
}

function matches(t: Trigger, ev: TriggerEvent) {
  if (t.type !== ev.type) return false;
  if ((t.type === 'bluetoothConnected' || t.type === 'bluetoothDisconnected') && t.nameOrAddress) {
    return deviceMatches(t.nameOrAddress, ev.device);
  }
  if (t.type === 'quickTile') return String(t.name).trim().toLowerCase() === String(ev.tile?.name ?? '').trim().toLowerCase();
  return true;
}

async function runTask(appId: string, task: BackgroundTask, ev: TriggerEvent) {
  await bgLog(appId, `▶ Task "${task.id}" läuft (Trigger: ${ev.type}${ev.device ? ` ${ev.device.name} / ${ev.device.alias} ${ev.device.address}` : ''})`);
  try {
    const ctx: any = createCtx(appId, task);
    ctx.trigger = { type: ev.type, device: ev.device, tile: ev.tile };
    ctx.device = ev.device;
    await compile(task.code)(ctx, ev);
    await bgLog(appId, `✔ Task "${task.id}" fertig`);
  } catch (e: any) {
    await bgLog(appId, `FEHLER: Task "${task.id}" fehlgeschlagen: ${e?.message || e}\n${e?.stack || ''}`, 'error');
  }
}

/** Only apps with background mode enabled (BackgroundService running list) get their tasks executed. */
async function activeTasks(): Promise<Array<[string, BackgroundTask]>> {
  const [r, apps] = await Promise.all([readRegistry(), BackgroundService.getRunningApps().catch(() => [] as string[])]);
  const out: Array<[string, BackgroundTask]> = [];
  for (const appId of apps) for (const t of Object.values(r[appId] || {})) out.push([appId, t]);
  return out;
}

export async function dispatchEvent(ev: TriggerEvent) {
  console.log('[EveryApp][BG] event', JSON.stringify(ev));
  const tasks = await activeTasks();
  const hits = tasks.filter(([, t]) => t.triggers.some((tr) => matches(tr, ev)));
  if (hits.length === 0) console.log(`[EveryApp][BG] no task for ${ev.type} (active tasks: ${tasks.length})`);
  await Promise.all(hits.map(([appId, t]) => runTask(appId, t, ev)));
  if (ev.type === 'boot') restartTimers();
}

// ---- Quick Settings tiles: 5 static native tiles "EveryApp 1..5"; names are assigned to slots here ----
const TILES_KEY = '@everyapp_tiles';
const TILE_COUNT = 5;
export async function getTileSlots(): Promise<Record<string, string>> {
  try { return JSON.parse((await AsyncStorage.getItem(TILES_KEY)) || '{}'); } catch { return {}; }
}
async function syncTiles() {
  const names: string[] = [];
  for (const [, t] of await activeTasks())
    for (const tr of t.triggers) if (tr.type === 'quickTile' && !names.some((n) => n.toLowerCase() === tr.name.trim().toLowerCase())) names.push(tr.name.trim());
  const old = await getTileSlots(); // slot -> name; keep existing slots stable
  const slots: Record<string, string> = {};
  for (const [slot, name] of Object.entries(old)) if (names.some((n) => n.toLowerCase() === name.toLowerCase())) slots[slot] = name;
  for (const n of names) {
    if (Object.values(slots).some((v) => v.toLowerCase() === n.toLowerCase())) continue;
    const free = [1, 2, 3, 4, 5].find((i) => !slots[i]);
    if (!free) { console.warn(`[EveryApp][BG] FEHLER: mehr als ${TILE_COUNT} Kacheln – "${n}" ignoriert`); continue; }
    slots[free] = n;
  }
  await AsyncStorage.setItem(TILES_KEY, JSON.stringify(slots));
  const native: any = requireOptionalNativeModule('ExpoBackgroundService');
  if (!native || typeof native.setTileLabel !== 'function') {
    if (names.length) console.warn('[EveryApp][BG] Quick-Settings-Kacheln brauchen nächsten Build');
    return;
  }
  for (let i = 1; i <= TILE_COUNT; i++) native.setTileLabel(i, slots[i] ?? null);
  console.log('[EveryApp][BG] tiles', JSON.stringify(slots));
}

// ---- interval triggers: JS timers, live as long as the process (kept alive by the foreground service) ----
let timers: any[] = [];
let restartPending: any = null;
export function restartTimers() {
  if (restartPending) clearTimeout(restartPending);
  restartPending = setTimeout(async () => {
    restartPending = null;
    timers.forEach(clearInterval); timers = [];
    syncTiles().catch((e) => console.error('[EveryApp][BG] tile sync failed', e?.message));
    for (const [appId, t] of await activeTasks()) {
      for (const tr of t.triggers) {
        if (tr.type === 'interval') {
          timers.push(setInterval(() => runTask(appId, t, { type: 'interval', time: Date.now() }), Math.max(MIN_INTERVAL, tr.ms)));
          console.log(`${tag(appId, t.id)} interval ${tr.ms}ms aktiv`);
        }
      }
    }
  }, 300);
}

/** Headless entry point (native extras: event, name, address, time). */
export async function headlessEntry(data: any) {
  const map: Record<string, string> = { 'bluetooth.connected': 'bluetoothConnected', 'bluetooth.disconnected': 'bluetoothDisconnected', boot: 'boot', quickTile: 'quickTile' };
  if (data?.event === 'quickTile') {
    await dispatchEvent({ type: 'quickTile', tile: { index: Number(data.tileIndex), name: String(data.tileName || '') }, time: data.time || Date.now() });
    return;
  }
  const type = map[data?.event];
  if (!type) { console.warn('[EveryApp][BG] unknown headless event', JSON.stringify(data)); return; }
  let device: any = data.address ? { name: data.name, alias: data.name, address: data.address } : undefined;
  if (data.device) { try { device = JSON.parse(data.device); } catch (e: any) { console.warn('[EveryApp][BG] bad device json', e?.message); } }
  await dispatchEvent({ type, device, time: data.time || Date.now() });
}

let initialized = false;
let appStarted = false;
/** Called per JS runtime: from the headless task (false) and from App mount (true -> fires appStart once). */
export function initBackgroundTasks(isAppStart: boolean) {
  if (!initialized) { initialized = true; restartTimers(); }
  if (isAppStart && !appStarted) {
    appStarted = true;
    dispatchEvent({ type: 'appStart', time: Date.now() }).catch((e) => console.error('[EveryApp][BG] appStart failed', e));
  }
}
