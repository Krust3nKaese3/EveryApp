import { NativeModules } from 'react-native';

type Listener = (event: string, data: any) => void;

const listeners = new Set<Listener>();
const recent = new Map<string, number>();

function dedupeKey(event: string, data: any): string {
  return `${event}|${data?.address || data?.deviceId || ''}|${data?.ssid || ''}|${data?.bssid || ''}`;
}

export function subscribeBackgroundEvents(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function hasBackgroundListeners(): boolean {
  return listeners.size > 0;
}

/** Delivers to in-process listeners. Persists for enabled mini-apps when nobody is listening. */
export function deliverBackgroundEvent(event: string, data: any): void {
  const now = Date.now();
  const key = dedupeKey(event, data);
  const prev = recent.get(key) || 0;
  if (now - prev < 2000) return;
  recent.set(key, now);

  if (listeners.size === 0) {
    try {
      NativeModules.ExpoBackgroundService?.appendEvent?.(event, JSON.stringify(data ?? {}));
    } catch (error: any) {
      console.error(`FEHLER Event speichern ${event}: ${error?.message || error}`);
    }
    return;
  }
  listeners.forEach((listener) => {
    try {
      listener(event, data);
    } catch (error) {
      console.error(`FEHLER Event ${event}:`, error);
    }
  });
}

export function drainBackgroundEvents(appId: string): any[] {
  try {
    const raw = NativeModules.ExpoBackgroundService?.drainEvents?.(appId);
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
