import { NativeModules } from 'react-native';
import * as Notifications from 'expo-notifications';
import { deliverBackgroundEvent } from '../services/backgroundEvents';

type BgAction =
  | { kind: 'http'; url: string; method?: string; headers?: Record<string, string>; body?: string }
  | { kind: 'notification'; title: string; body: string };

function log(message: string) {
  console.log(message);
  try {
    NativeModules.ExpoBackgroundService?.addNativeLog?.(message);
  } catch {
    // native log is best-effort
  }
}

function matches(task: any, event: string, data: any): boolean {
  switch (task?.type) {
    case 'interval':
      return event === 'interval';
    case 'wifiChanged':
      return event === 'wifiChanged';
    case 'boot':
      return event === 'boot';
    case 'bluetooth':
      return event === 'bluetooth.connected' || event === 'bluetooth.disconnected';
    case 'bleNotify':
      return event === 'bleNotify' && String(task.deviceId || '').toLowerCase() === String(data?.deviceId || '').toLowerCase();
    default:
      return false;
  }
}

async function runAction(appId: string, event: string, action: BgAction) {
  if (action.kind === 'http') {
    const response = await fetch(action.url, {
      method: action.method || 'GET',
      headers: action.headers,
      body: action.body,
    });
    log(`Hintergrundaktion HTTP | appId=${appId} | event=${event} | status=${response.status} | ${action.url}`);
    return;
  }
  if (action.kind === 'notification') {
    await Notifications.scheduleNotificationAsync({
      content: { title: action.title, body: action.body },
      trigger: null,
    });
    log(`Hintergrundaktion Notification | appId=${appId} | event=${event} | ${action.title}`);
  }
}

async function runDeclarative(event: string, data: any) {
  const raw = NativeModules.ExpoBackgroundService?.getTaskSnapshot?.() || '{}';
  const root = JSON.parse(raw);
  const apps = root?.apps || {};
  for (const appId of Object.keys(apps)) {
    const app = apps[appId];
    if (!app?.enabled) continue;
    const tasks = Array.isArray(app.tasks) ? app.tasks : [];
    for (const task of tasks) {
      if (!matches(task, event, data) || !task.action) continue;
      try {
        await runAction(appId, event, task.action as BgAction);
      } catch (error: any) {
        log(`FEHLER Hintergrundaktion | appId=${appId} | event=${event} | ${error?.name || 'Error'}: ${error?.message || error}`);
      }
    }
  }
}

export async function everyAppHeadlessTask(raw: { event?: string; dataJson?: string } | null): Promise<void> {
  const event = raw?.event || 'unknown';
  let data: any = {};
  try {
    data = raw?.dataJson ? JSON.parse(raw.dataJson) : {};
  } catch (error: any) {
    data = { parseError: `${error?.name || 'Error'}: ${error?.message || error}`, raw: raw?.dataJson };
    log(`FEHLER HEADLESS JSON | event=${event} | ${data.parseError}`);
  }
  try {
    deliverBackgroundEvent(event, data);
    await runDeclarative(event, data);
    log(`HEADLESS FERTIG | event=${event}`);
  } catch (error: any) {
    log(`FEHLER HEADLESS TASK | event=${event} | ${error?.name || 'Error'}: ${error?.message || error}`);
  }
}
