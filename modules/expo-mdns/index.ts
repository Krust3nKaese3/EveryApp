import { requireNativeModule, requireOptionalNativeModule } from 'expo-modules-core';

const native = requireOptionalNativeModule('ExpoMdns');

export const isAvailable = () => !!native;

export type ServiceEvent = {
  present: boolean;
  key: string;
  host?: string;
  port?: number;
  txt?: Record<string, string>;
};

type Listener = (event: ServiceEvent) => void;
const listeners = new Set<Listener>();

function emit(event: ServiceEvent) {
  listeners.forEach((listener) => listener(event));
}

if (native && typeof native.addListener === 'function') {
  native.addListener('services', emit);
}

export function addServiceListener(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function publishAsync(name: string, port: number, txt: Record<string, string>): Promise<void> {
  if (!native) throw new Error('Suche in der Nähe braucht einen neuen Entwicklungs-Build.');
  await native.publish(name, port, txt);
}

export async function unpublishAsync(): Promise<void> {
  if (!native) return;
  await native.unpublish();
}

export async function browseAsync(): Promise<void> {
  if (!native) throw new Error('Suche in der Nähe braucht einen neuen Entwicklungs-Build.');
  await native.browse();
}

export async function stopBrowseAsync(): Promise<void> {
  if (!native) return;
  await native.stopBrowse();
}

export function nativeModule() {
  return native || requireNativeModule('ExpoMdns');
}
