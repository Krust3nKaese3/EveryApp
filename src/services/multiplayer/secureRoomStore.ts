/**
 * SecureStore, sobald das native Modul da ist. Sonst nur der laufende Prozess.
 * AsyncStorage bekommt diese Secrets nicht.
 */
import { createMemoryRoomStore, type RoomStore, type StoredRoom } from './persist';

const memory = createMemoryRoomStore();
const KEY = (appId: string) => `eamp.${appId.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80)}`;

function secure(): { getItemAsync?: (key: string) => Promise<string | null>; setItemAsync?: (key: string, value: string) => Promise<void>; deleteItemAsync?: (key: string) => Promise<void> } | null {
  try {
    const loaded = require('expo-secure-store');
    if (typeof loaded.getItemAsync !== 'function' || typeof loaded.setItemAsync !== 'function') return null;
    return loaded;
  } catch {
    return null;
  }
}

export function roomStore(): RoomStore {
  return {
    async read(appId) {
      const store = secure();
      if (!store?.getItemAsync) return memory.read(appId);
      const raw = await store.getItemAsync(KEY(appId));
      if (!raw) return null;
      try {
        return JSON.parse(raw) as StoredRoom;
      } catch {
        return null;
      }
    },
    async write(room) {
      const store = secure();
      const json = JSON.stringify(room);
      if (!store?.setItemAsync) {
        await memory.write(room);
        return;
      }
      await store.setItemAsync(KEY(room.appId), json);
    },
    async delete(appId) {
      const store = secure();
      if (!store?.deleteItemAsync) {
        await memory.delete(appId);
        return;
      }
      await store.deleteItemAsync(KEY(appId));
    },
  };
}
