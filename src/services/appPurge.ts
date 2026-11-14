/**
 * Pure selection of everything a deleted mini-app leaves in AsyncStorage.
 * File copies under the app documents directory are removed separately.
 */

export function miniAppStoragePrefix(appId: string): string {
  return `@miniapp_${appId}_`;
}

export function secretStoragePrefix(appId: string): string {
  return `@secret_${appId}_`;
}

export function secretIndexKey(appId: string): string {
  return `@secret_index_${appId}`;
}

/**
 * A shorter app id must not delete a longer one's keys:
 * `@miniapp_…_a_b_` is a prefix of `@miniapp_…_a_b_extra_`.
 * The longest matching installed id owns the key.
 */
export function keysOwnedByApp(allKeys: readonly string[], appId: string, allAppIds: readonly string[]): string[] {
  const ids = Array.from(new Set([...allAppIds, appId])).filter((id) => id.length > 0);
  return allKeys.filter((key) => ownerOfKey(key, ids) === appId);
}

export function ownerOfKey(key: string, appIds: readonly string[]): string | null {
  let best: string | null = null;
  for (const id of appIds) {
    const storage = miniAppStoragePrefix(id);
    const secret = secretStoragePrefix(id);
    const index = secretIndexKey(id);
    const matches = key === index || key.startsWith(storage) || key.startsWith(secret);
    if (!matches) continue;
    if (best == null || id.length > best.length) best = id;
  }
  return best;
}

export interface HostRecords {
  permissions: Record<string, unknown>;
  denied: Record<string, unknown>;
  backgroundApps: string[];
  tasks: Record<string, unknown>;
  ui: { tiles: Record<string, { appId?: string }>; widgets: Record<string, { appId?: string }> };
  lockAsked: Record<string, unknown>;
}

export function emptyHostRecords(): HostRecords {
  return {
    permissions: {},
    denied: {},
    backgroundApps: [],
    tasks: {},
    ui: { tiles: {}, widgets: {} },
    lockAsked: {},
  };
}

export function purgeHostRecords(records: HostRecords, appId: string): HostRecords {
  const permissions = { ...records.permissions };
  const denied = { ...records.denied };
  const tasks = { ...records.tasks };
  const lockAsked = { ...records.lockAsked };
  delete permissions[appId];
  delete denied[appId];
  delete tasks[appId];
  delete lockAsked[appId];
  const tiles: HostRecords['ui']['tiles'] = {};
  const widgets: HostRecords['ui']['widgets'] = {};
  for (const [slot, cfg] of Object.entries(records.ui?.tiles || {})) {
    if (cfg?.appId !== appId) tiles[slot] = cfg;
  }
  for (const [id, cfg] of Object.entries(records.ui?.widgets || {})) {
    if (cfg?.appId !== appId) widgets[id] = cfg;
  }
  return {
    permissions,
    denied,
    backgroundApps: (records.backgroundApps || []).filter((id) => id !== appId),
    tasks,
    ui: { tiles, widgets },
    lockAsked,
  };
}

export function parseJsonRecord(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

export function parseJsonStringList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

/** Update replaces files and the app record. It must not select storage keys for deletion. */
export function storageKeysTouchedByUpdate(): string[] {
  return [];
}
