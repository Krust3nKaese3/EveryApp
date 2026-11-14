import AsyncStorage from '@react-native-async-storage/async-storage';
import { MiniApp, Folder, GrantedPermissions, Permission } from '../types';
import { clearRate } from '../bridge/allowlist';
import {
  HostRecords,
  keysOwnedByApp,
  parseJsonRecord,
  parseJsonStringList,
  purgeHostRecords,
} from './appPurge';
import { GitRepoService } from './GitRepoService';
import { SecretStore } from './SecretStore';

const APPS_KEY = '@everyapp_apps';
const FOLDERS_KEY = '@everyapp_folders';
const PERMISSIONS_KEY = '@everyapp_permissions';
const DENIED_KEY = '@everyapp_permission_denied';
const BACKGROUND_APPS_KEY = '@everyapp_background_apps';
const TASKS_KEY = '@everyapp_bg_tasks';
const UI_KEY = '@everyapp_ui';
const LOCK_ASKED_KEY = '@everyapp_lock_asked';

export class StorageService {
  static async getApps(): Promise<MiniApp[]> {
    const data = await AsyncStorage.getItem(APPS_KEY);
    return data ? JSON.parse(data) : [];
  }

  static async saveApp(app: MiniApp): Promise<void> {
    const apps = await this.getApps();
    const existingIndex = apps.findIndex(a => a.id === app.id);
    
    if (existingIndex >= 0) {
      apps[existingIndex] = app;
    } else {
      apps.push(app);
    }
    
    await AsyncStorage.setItem(APPS_KEY, JSON.stringify(apps));
  }

  static async deleteApp(appId: string): Promise<void> {
    const apps = await this.getApps();
    const otherIds = apps.map((app) => app.id);
    const filtered = apps.filter(a => a.id !== appId);
    await AsyncStorage.setItem(APPS_KEY, JSON.stringify(filtered));
    await this.purgeAppData(appId, otherIds);
  }

  /**
   * Drops this mini-app's key-value storage, secrets, permission decisions,
   * background-task cache, tile/widget cache, and downloaded files.
   * Game storage of other mini-apps is left in place.
   */
  static async purgeAppData(appId: string, knownAppIds?: string[]): Promise<void> {
    const ids = knownAppIds && knownAppIds.length > 0 ? knownAppIds : [appId];
    try { await SecretStore.purge(appId); } catch (error) { console.error('[EveryApp] secret purge', error); }

    const [permissionRaw, deniedRaw, backgroundRaw, tasksRaw, uiRaw, lockRaw, allKeys] = await Promise.all([
      AsyncStorage.getItem(PERMISSIONS_KEY),
      AsyncStorage.getItem(DENIED_KEY),
      AsyncStorage.getItem(BACKGROUND_APPS_KEY),
      AsyncStorage.getItem(TASKS_KEY),
      AsyncStorage.getItem(UI_KEY),
      AsyncStorage.getItem(LOCK_ASKED_KEY),
      AsyncStorage.getAllKeys(),
    ]);
    const uiRecord = parseJsonRecord(uiRaw);
    const current: HostRecords = {
      permissions: parseJsonRecord(permissionRaw),
      denied: parseJsonRecord(deniedRaw),
      backgroundApps: parseJsonStringList(backgroundRaw),
      tasks: parseJsonRecord(tasksRaw),
      ui: {
        tiles: (uiRecord.tiles && typeof uiRecord.tiles === 'object' ? uiRecord.tiles : {}) as HostRecords['ui']['tiles'],
        widgets: (uiRecord.widgets && typeof uiRecord.widgets === 'object' ? uiRecord.widgets : {}) as HostRecords['ui']['widgets'],
      },
      lockAsked: parseJsonRecord(lockRaw),
    };
    const next = purgeHostRecords(current, appId);
    await AsyncStorage.multiSet([
      [PERMISSIONS_KEY, JSON.stringify(next.permissions)],
      [DENIED_KEY, JSON.stringify(next.denied)],
      [BACKGROUND_APPS_KEY, JSON.stringify(next.backgroundApps)],
      [TASKS_KEY, JSON.stringify(next.tasks)],
      [UI_KEY, JSON.stringify(next.ui)],
      [LOCK_ASKED_KEY, JSON.stringify(next.lockAsked)],
    ]);
    const owned = keysOwnedByApp(allKeys, appId, ids);
    if (owned.length > 0) await AsyncStorage.multiRemove(owned);
    clearRate(appId);
    try { await GitRepoService.deleteStoredApp(appId); } catch (error) { console.error('[EveryApp] file purge', error); }
  }

  static async updateAppFolder(appId: string, folderId: string | null): Promise<void> {
    const apps = await this.getApps();
    const app = apps.find(a => a.id === appId);
    if (app) {
      app.folderId = folderId;
      await AsyncStorage.setItem(APPS_KEY, JSON.stringify(apps));
    }
  }

  static async getFolders(): Promise<Folder[]> {
    const data = await AsyncStorage.getItem(FOLDERS_KEY);
    return data ? JSON.parse(data) : [];
  }

  static async saveFolder(folder: Folder): Promise<void> {
    const folders = await this.getFolders();
    const existingIndex = folders.findIndex(f => f.id === folder.id);
    
    if (existingIndex >= 0) {
      folders[existingIndex] = folder;
    } else {
      folders.push(folder);
    }
    
    await AsyncStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
  }

  static async deleteFolder(folderId: string): Promise<void> {
    const folders = await this.getFolders();
    const filtered = folders.filter(f => f.id !== folderId);
    await AsyncStorage.setItem(FOLDERS_KEY, JSON.stringify(filtered));

    const apps = await this.getApps();
    apps.forEach(app => {
      if (app.folderId === folderId) {
        app.folderId = null;
      }
    });
    await AsyncStorage.setItem(APPS_KEY, JSON.stringify(apps));
  }

  static async getGrantedPermissions(): Promise<GrantedPermissions> {
    const data = await AsyncStorage.getItem(PERMISSIONS_KEY);
    return data ? JSON.parse(data) : {};
  }

  static async saveGrantedPermissions(appId: string, permissions: Permission[]): Promise<void> {
    const allPermissions = await this.getGrantedPermissions();
    allPermissions[appId] = permissions;
    await AsyncStorage.setItem(PERMISSIONS_KEY, JSON.stringify(allPermissions));
  }

  static async getAppPermissions(appId: string): Promise<Permission[]> {
    const allPermissions = await this.getGrantedPermissions();
    return allPermissions[appId] || [];
  }

  static async getDeniedMap(): Promise<GrantedPermissions> {
    const data = await AsyncStorage.getItem(DENIED_KEY);
    return data ? JSON.parse(data) : {};
  }

  static async getDeniedPermissions(appId: string): Promise<Permission[]> {
    const all = await this.getDeniedMap();
    return all[appId] || [];
  }

  static async saveDeniedPermissions(appId: string, permissions: Permission[]): Promise<void> {
    const all = await this.getDeniedMap();
    all[appId] = permissions;
    await AsyncStorage.setItem(DENIED_KEY, JSON.stringify(all));
  }

  /** One capability is either granted or denied, never both. */
  static async setPermissionDecision(appId: string, permission: Permission, decision: 'granted' | 'denied'): Promise<void> {
    const granted = await this.getGrantedPermissions();
    const denied = await this.getDeniedMap();
    const grantedSet = new Set(granted[appId] || []);
    const deniedSet = new Set(denied[appId] || []);
    if (decision === 'granted') {
      grantedSet.add(permission);
      deniedSet.delete(permission);
    } else {
      grantedSet.delete(permission);
      deniedSet.add(permission);
    }
    granted[appId] = [...grantedSet];
    denied[appId] = [...deniedSet];
    await AsyncStorage.setItem(PERMISSIONS_KEY, JSON.stringify(granted));
    await AsyncStorage.setItem(DENIED_KEY, JSON.stringify(denied));
  }
}
