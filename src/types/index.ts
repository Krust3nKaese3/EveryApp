export interface MiniAppManifest {
  name: string;
  version: string;
  description: string;
  icon?: string;
  entrypoint: string;
  permissions: Permission[];
}

export type Permission = 
  | 'storage'
  | 'http'
  | 'bluetooth'
  | 'notifications'
  | 'camera'
  | 'sensors'
  | 'vibration'
  | 'background'
  | 'ble'
  | 'net';

export interface MiniApp {
  id: string;
  repoUrl: string;
  manifest: MiniAppManifest;
  localPath: string;
  addedAt: number;
  folderId: string | null;
}

export interface Folder {
  id: string;
  name: string;
  createdAt: number;
}

export interface GrantedPermissions {
  [appId: string]: Permission[];
}

export interface BluetoothDevice {
  name: string;
  address: string;
}

export interface HttpRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}
