/**
 * Host-side macro engine. Runs macros of background-enabled mini-apps outside the WebView,
 * triggered by the native MacroTriggerReceiver via the Headless JS task "EveryAppMacroTask".
 * Works when the mini-app is closed, EveryApp is in the background, or the app was swiped away
 * (as long as background mode / the foreground service is on).
 *
 * Convention: a mini-app stores its macros as JSON array under storage key "macros"
 * ([{id, name, code, enabled, ...}]), exactly what EveryMacro already does.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Vibration } from 'react-native';
import * as Notifications from 'expo-notifications';
import { BackgroundService } from './BackgroundService';

type TriggerEvent = { event: string; name?: string; address?: string; time?: number };

const key = (appId: string, k: string) => `@miniapp_${appId}_${k}`;
const LOG_LIMIT = 100;

async function appendLog(appId: string, message: string, level: 'info' | 'error' = 'info') {
  const line = `[EveryApp][Macro][${appId}] ${message}`;
  if (level === 'error') console.error(line); else console.log(line);
  try {
    const raw = await AsyncStorage.getItem(key(appId, 'background_log'));
    const list = raw ? JSON.parse(raw) : [];
    list.unshift({ message, level, timestamp: new Date().toLocaleTimeString('de-DE'), time: Date.now() });
    await AsyncStorage.setItem(key(appId, 'background_log'), JSON.stringify(list.slice(0, LOG_LIMIT)));
  } catch (e) {
    console.error('[EveryApp][Macro] failed to write log', e);
  }
}

const DSL = {
  bluetoothConnected: (nameOrAddress: string | null = null) => ({ type: 'bluetoothConnected', nameOrAddress }),
  bluetoothDisconnected: (nameOrAddress: string | null = null) => ({ type: 'bluetoothDisconnected', nameOrAddress }),
  appStart: () => ({ type: 'appStart' }),
  interval: (ms: number) => ({ type: 'interval', ms }),
  manual: () => ({ type: 'manual' }),
};

function parseMacro(code: string): any {
  let captured: any = null;
  const names = ['macro', ...Object.keys(DSL)];
  // eslint-disable-next-line no-new-func
  const fn = new Function(...names, code);
  fn((d: any) => { captured = d; }, ...Object.values(DSL));
  if (!captured) throw new Error('macro({...}) wurde nicht aufgerufen');
  return captured;
}

async function httpRequest(req: { url: string; method?: string; headers?: any; body?: any; timeoutMs?: number }) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), req.timeoutMs || 15000);
  try {
    const res = await fetch(req.url, { method: req.method || 'GET', headers: req.headers, body: req.body, signal: controller.signal });
    const body = await res.text();
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => { headers[k] = v; });
    return { status: res.status, headers, body };
  } catch (e: any) {
    throw new Error(`HTTP ${req.method || 'GET'} ${req.url} fehlgeschlagen: ${e?.message || e}`);
  } finally {
    clearTimeout(t);
  }
}

async function createCtx(appId: string, macro: any, device: any) {
  const varsKey = key(appId, `macro_vars_${macro.id}`);
  let cache: Record<string, any> = {};
  try { cache = JSON.parse((await AsyncStorage.getItem(varsKey)) || '{}'); } catch {}
  const vars = new Proxy(cache, {
    set: (t, p, v) => { (t as any)[p] = v; AsyncStorage.setItem(varsKey, JSON.stringify(t)).catch(() => {}); return true; },
  });
  const ctx: any = {
    vars,
    device,
    background: true,
    log: (m: any) => { appendLog(appId, `[${macro.name}] ${m}`); },
    wait: (ms: number) => new Promise((r) => setTimeout(r, ms)),
    http: {
      request: (o: any) => httpRequest(o),
      get: (url: string) => httpRequest({ url, method: 'GET' }),
    },
    notify: async (title: string, body: string) => {
      await Notifications.scheduleNotificationAsync({ content: { title, body }, trigger: null });
    },
    vibrate: (pattern?: number[]) => {
      if (pattern && pattern.length) Vibration.vibrate([0, ...pattern]); else Vibration.vibrate(200);
    },
  };
  return ctx;
}

function matches(trigger: any, type: string, device: any) {
  if (trigger?.type !== type) return false;
  if (!trigger.nameOrAddress) return true;
  return trigger.nameOrAddress === device.name || trigger.nameOrAddress === device.address;
}

export async function runMacroTask(data: TriggerEvent): Promise<void> {
  const type = data.event === 'bluetooth.connected' ? 'bluetoothConnected'
    : data.event === 'bluetooth.disconnected' ? 'bluetoothDisconnected' : null;
  console.log('[EveryApp][Macro] task received', JSON.stringify(data));
  if (!type) return;
  const device = { name: data.name, address: data.address };

  let apps: string[] = [];
  try { apps = await BackgroundService.getRunningApps(); } catch (e) { console.error('[EveryApp][Macro] cannot read background apps', e); }
  if (apps.length === 0) console.log('[EveryApp][Macro] no background-enabled mini-apps');

  for (const appId of apps) {
    let macros: any[] = [];
    try { macros = JSON.parse((await AsyncStorage.getItem(key(appId, 'macros'))) || '[]'); } catch (e: any) {
      await appendLog(appId, `FEHLER: Makros nicht lesbar: ${e?.message}`, 'error');
      continue;
    }
    let changed = false;
    for (const macro of macros.filter((m) => m && m.enabled)) {
      let obj: any;
      try { obj = parseMacro(macro.code); } catch (e: any) {
        await appendLog(appId, `FEHLER: Makro "${macro.name}" Syntax: ${e?.message}`, 'error');
        continue;
      }
      if (!(obj.triggers || []).some((t: any) => matches(t, type, device))) continue;
      await appendLog(appId, `Makro "${macro.name}" ausgelöst (${type}: ${device.name} ${device.address}) [Hintergrund]`);
      try {
        const ctx = await createCtx(appId, macro, device);
        for (const cond of obj.conditions || []) {
          if (!(await cond(ctx))) { await appendLog(appId, `Makro "${macro.name}" übersprungen (Bedingung nicht erfüllt)`); obj = null; break; }
        }
        if (!obj) continue;
        if (typeof obj.actions !== 'function') throw new Error('actions ist keine Funktion');
        await obj.actions(ctx);
        macro.lastRun = Date.now(); macro.lastError = null; macro.runCount = (macro.runCount || 0) + 1;
        await appendLog(appId, `Makro "${macro.name}" erfolgreich ausgeführt [Hintergrund]`);
      } catch (e: any) {
        macro.lastError = e?.message || String(e);
        await appendLog(appId, `FEHLER: Makro "${macro.name}" fehlgeschlagen: ${macro.lastError}\n${e?.stack || ''}`, 'error');
      }
      changed = true;
    }
    if (changed) {
      // Re-read and merge only stats so we don't overwrite edits made meanwhile
      try {
        const fresh: any[] = JSON.parse((await AsyncStorage.getItem(key(appId, 'macros'))) || '[]');
        for (const f of fresh) {
          const m = macros.find((x) => x.id === f.id);
          if (m) { f.lastRun = m.lastRun; f.lastError = m.lastError; f.runCount = m.runCount; }
        }
        await AsyncStorage.setItem(key(appId, 'macros'), JSON.stringify(fresh));
      } catch {}
    }
  }
}
