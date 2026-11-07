import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, AppState, NativeModules } from 'react-native';
import { normalizePopupSpec, normalizeTilePatch } from './popupTiles';
import { clampIntervalMs } from './backgroundPolicy';

const LOCK_ASKED_KEY = '@everyapp_lock_asked';

export type BgAction =
  | { kind: 'http'; url: string; method?: string; headers?: Record<string, string>; body?: string }
  | { kind: 'notification'; title: string; body: string };

export type BackgroundTaskInput =
  | { type: 'interval'; everyMs: number; action?: BgAction }
  | { type: 'wifiChanged'; action?: BgAction }
  | { type: 'bleNotify'; deviceId: string; serviceUUID: string; characteristicUUID: string; action?: BgAction }
  | { type: 'bluetooth'; action?: BgAction }
  | { type: 'boot'; action?: BgAction };

const native = () => NativeModules.ExpoBackgroundService;

export async function bgLog(appId: string, message: string) {
  const line = `[${appId}] ${message}`;
  console.log(line);
  try {
    native()?.addNativeLog?.(line);
  } catch {
    // copyable native log is best-effort
  }
}

const wantsLocked = (tile: any) => tile?.allowLocked === true || tile?.popup?.allowLocked === true;

export async function ensureLockGrant(appId: string) {
  const n = native();
  if (!n || typeof n.lockGrantGet !== 'function') {
    await bgLog(appId, 'allowLocked: braucht nächsten Build (Sperrbildschirm)');
    return;
  }
  if (n.lockGrantGet(appId)) return;
  const asked = JSON.parse((await AsyncStorage.getItem(LOCK_ASKED_KEY)) || '{}');
  if (asked[appId]) {
    await bgLog(appId, 'allowLocked: Sperrbildschirm-Freigabe wurde abgelehnt – Kachel verlangt Entsperren');
    return;
  }
  if (AppState.currentState !== 'active') {
    await bgLog(appId, 'allowLocked: Freigabe-Dialog erscheint beim nächsten Öffnen von EveryApp');
    return;
  }
  asked[appId] = true;
  await AsyncStorage.setItem(LOCK_ASKED_KEY, JSON.stringify(asked));
  Alert.alert(
    'Auf dem Sperrbildschirm erlauben?',
    `Die Mini-App "${appId}" möchte Kacheln/Popups bedienen lassen, ohne dass das Handy entsperrt ist. Jeder mit Zugriff auf dein gesperrtes Handy kann diese Aktionen dann auslösen.`,
    [
      { text: 'Ablehnen', style: 'cancel', onPress: () => { void bgLog(appId, 'allowLocked: Freigabe abgelehnt'); } },
      {
        text: 'Erlauben',
        onPress: () => {
          try {
            n.lockGrantSet(appId, true);
            void bgLog(appId, 'allowLocked: Freigabe erteilt');
          } catch (e: any) {
            void bgLog(appId, `FEHLER allowLocked lockGrantSet: ${e?.message}`);
          }
        },
      },
    ],
    { cancelable: false },
  );
}

export async function revokeLockGrant(appId: string) {
  try {
    native()?.lockGrantSet?.(appId, false);
  } catch (e: any) {
    await bgLog(appId, `FEHLER allowLocked lockGrantSet: ${e?.message}`);
  }
  const asked = JSON.parse((await AsyncStorage.getItem(LOCK_ASKED_KEY)) || '{}');
  delete asked[appId];
  await AsyncStorage.setItem(LOCK_ASKED_KEY, JSON.stringify(asked));
  await bgLog(appId, 'allowLocked: Freigabe entzogen');
}

export async function recheckLockGrants() {
  const n = native();
  if (!n || typeof n.getTiles !== 'function') return;
  let tiles: any[] = [];
  try {
    tiles = JSON.parse(n.getTiles() || '[]');
  } catch (e: any) {
    await bgLog('everyapp', `FEHLER allowLocked getTiles: ${e?.message}`);
    return;
  }
  const seen = new Set<string>();
  for (const tile of tiles) {
    if (!wantsLocked(tile) || !tile.appId || seen.has(tile.appId)) continue;
    seen.add(tile.appId);
    await ensureLockGrant(tile.appId);
  }
}

export async function setTile(appId: string, slot: number, patch: any) {
  const normalized = normalizeTilePatch(patch);
  if (normalized.popup) normalized.popup = normalizePopupSpec(normalized.popup, appId);
  const cfg = { ...normalized, appId, slot };
  const n = native();
  if (!n?.setTile) throw new Error('setTile braucht den nächsten Build');
  const ok = n.setTile(slot, JSON.stringify(cfg));
  if (!ok) throw new Error(`setTile: Slot ${slot} abgelehnt`);
  if (wantsLocked(cfg)) await ensureLockGrant(appId).catch((e) => bgLog(appId, `FEHLER allowLocked: ${e?.message}`));
  return cfg;
}

function sanitizeTask(task: any): BackgroundTaskInput {
  if (!task || typeof task !== 'object') throw new Error('background.registerTasks: Task-Objekt erwartet');
  const action = task.action;
  if (action != null) {
    if (action.kind !== 'http' && action.kind !== 'notification') {
      throw new Error('background.registerTasks: action.kind muss http oder notification sein');
    }
  }
  switch (task.type) {
    case 'interval':
      return { type: 'interval', everyMs: clampIntervalMs(Number(task.everyMs)), action };
    case 'wifiChanged':
      return { type: 'wifiChanged', action };
    case 'bluetooth':
      return { type: 'bluetooth', action };
    case 'boot':
      return { type: 'boot', action };
    case 'bleNotify':
      if (!task.deviceId || !task.serviceUUID || !task.characteristicUUID) {
        throw new Error('background.registerTasks: bleNotify braucht deviceId, serviceUUID, characteristicUUID');
      }
      return {
        type: 'bleNotify',
        deviceId: String(task.deviceId),
        serviceUUID: String(task.serviceUUID),
        characteristicUUID: String(task.characteristicUUID),
        action,
      };
    default:
      throw new Error(`background.registerTasks: unbekannter Typ "${task?.type}"`);
  }
}

export async function registerTasks(appId: string, tasks: any[]) {
  if (!Array.isArray(tasks)) throw new Error('background.registerTasks: Array erwartet');
  const sanitized = tasks.map(sanitizeTask);
  const n = native();
  if (!n?.registerTasks) throw new Error('registerTasks braucht den nächsten Build');
  const warning = n.registerTasks(appId, JSON.stringify(sanitized));
  if (warning) await bgLog(appId, `registerTasks Hinweis: ${warning}`);
  await bgLog(appId, `registerTasks: ${sanitized.length} Task(s)`);
  return sanitized;
}

export async function getNativeLog(): Promise<string> {
  try {
    return native()?.getNativeLog?.() || '';
  } catch (e: any) {
    return `FEHLER getNativeLog: ${e?.message || e}`;
  }
}
