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
  | 'net'
  | 'popup'
  | 'tiles'
  | 'spotify'
  | 'clipboard'
  | 'network'
  | 'media'
  | 'secrets'
  | 'crypto';

/** catalog: curated list. developer: signed-in owner's repo. free: confirmed foreign add (flag off). */
export type MiniAppOrigin = 'catalog' | 'developer' | 'free';

export interface MiniApp {
  id: string;
  repoUrl: string;
  manifest: MiniAppManifest;
  localPath: string;
  addedAt: number;
  folderId: string | null;
  /** Commit of `main` that was downloaded. Absent on mini-apps installed before SHA pinning. */
  commitSha?: string;
  /** Absent on mini-apps installed before developer mode. */
  origin?: MiniAppOrigin;
  /** GitHub login that owned the repo at install. Set for origin `developer`. */
  ownerLogin?: string;
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
