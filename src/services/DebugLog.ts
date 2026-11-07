import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo-modules-core';

function nativeLines(): string[] {
  try {
    const m: any = requireOptionalNativeModule('ExpoBackgroundService');
    if (!m?.nativeLogRead) return ['(Native-Log nicht verfügbar – alter Build?)'];
    return JSON.parse(m.nativeLogRead() || '[]');
  } catch (e: any) { return ['NATIV-Log Lesefehler: ' + (e?.message || e)]; }
}


/** Persistent ring buffer for diagnostics (visible in EveryApp: Debug-Log). */
export const DEBUG_LOG_KEY = '@everyapp_debuglog';
const MAX = 200;
let chain: Promise<any> = Promise.resolve();

function stamp() {
  const d = new Date();
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}. ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

export function debugLog(line: string): Promise<void> {
  const entry = `${stamp()} ${line}`;
  chain = chain.then(async () => {
    try {
      const cur: string[] = JSON.parse((await AsyncStorage.getItem(DEBUG_LOG_KEY)) || '[]');
      cur.push(entry.length > 2000 ? entry.slice(0, 2000) + '…' : entry);
      await AsyncStorage.setItem(DEBUG_LOG_KEY, JSON.stringify(cur.slice(-MAX)));
    } catch (e: any) { console.warn('[EveryApp][DebugLog] Schreibfehler', e?.message); }
  });
  return chain;
}

export async function readDebugLog(): Promise<string[]> {
  await chain;
  let js: string[] = [];
  try { js = JSON.parse((await AsyncStorage.getItem(DEBUG_LOG_KEY)) || '[]'); } catch { js = []; }
  // Both formats start with "dd.MM. HH:mm:ss.SSS" -> sortable within the same year
  const key = (l: string) => { const m = /^(\d\d)\.(\d\d)\. (\S+)/.exec(l); return m ? m[2] + m[1] + m[3] : ''; };
  return [...js, ...nativeLines()].map((l, i) => [key(l), i, l] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1])).map(x => x[2]);
}

export async function clearDebugLog() {
  await chain; await AsyncStorage.removeItem(DEBUG_LOG_KEY);
  try { (requireOptionalNativeModule('ExpoBackgroundService') as any)?.nativeLogClear?.(); } catch {}
}
