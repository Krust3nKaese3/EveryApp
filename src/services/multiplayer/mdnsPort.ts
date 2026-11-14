/**
 * mDNS-Anbindung. Fehlt das native Modul, bleibt der QR-Beitritt nutzbar.
 */
import type { DiscoveryPort, LanService } from './discovery';

export function nativeDiscoveryPort(): DiscoveryPort {
  const services = new Map<string, LanService>();
  let onChange: ((rows: LanService[]) => void) | null = null;
  let stopListen = () => {};

  function module(): {
    publishAsync: (name: string, port: number, txt: Record<string, string>) => Promise<void>;
    unpublishAsync: () => Promise<void>;
    browseAsync: () => Promise<void>;
    stopBrowseAsync: () => Promise<void>;
    addServiceListener: (listener: (event: { present: boolean; key: string; host?: string; port?: number; txt?: Record<string, string> }) => void) => () => void;
  } {
    return require('../../../modules/expo-mdns');
  }

  return {
    async publish(name, port, txt) {
      await module().publishAsync(name, port, txt);
    },
    async unpublish() {
      try {
        await module().unpublishAsync();
      } catch {
        /* Schon weg. */
      }
    },
    async browse(cb) {
      onChange = cb;
      const mod = module();
      stopListen = mod.addServiceListener((event) => {
        if (!event.present) {
          for (const key of [...services.keys()]) {
            if (key === event.key || key.startsWith(`${event.key}|`)) services.delete(key);
          }
        } else if (event.host && event.port) {
          services.set(event.key, { key: event.key, host: event.host, port: event.port, txt: event.txt || {} });
        }
        onChange?.([...services.values()]);
      });
      await mod.browseAsync();
    },
    async stopBrowse() {
      stopListen();
      stopListen = () => {};
      services.clear();
      onChange = null;
      try {
        await module().stopBrowseAsync();
      } catch {
        /* Schon weg. */
      }
    },
  };
}
