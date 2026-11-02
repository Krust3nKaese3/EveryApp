import AsyncStorage from '@react-native-async-storage/async-storage';
import { MiniApp, Folder, GrantedPermissions, Permission } from '../types';

const APPS_KEY = '@everyapp_apps';
const FOLDERS_KEY = '@everyapp_folders';
const PERMISSIONS_KEY = '@everyapp_permissions';

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
    const filtered = apps.filter(a => a.id !== appId);
    await AsyncStorage.setItem(APPS_KEY, JSON.stringify(filtered));
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
}
