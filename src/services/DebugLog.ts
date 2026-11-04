import AsyncStorage from '@react-native-async-storage/async-storage';

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
  try { return JSON.parse((await AsyncStorage.getItem(DEBUG_LOG_KEY)) || '[]'); } catch { return []; }
}

export async function clearDebugLog() { await chain; await AsyncStorage.removeItem(DEBUG_LOG_KEY); }
