/**
 * iOS learning shell. The platform string is chosen by the binary.
 * Catalog files and other remote JSON are not an input.
 */
import { bridgeMethod } from '../bridge/allowlist';
import { Permission } from '../types';
import { isStoredRelPath, normalizeEntrypoint } from './miniAppFiles';

export type InstallMode = 'open' | 'catalog-only' | 'own-repos-only';

const IOS_ALLOWED = new Set<string>(['storage', 'http', 'sensors', 'ble', 'vibration', 'events']);

export const IOS_CAPABILITY_ERROR =
  'Diese Funktion ist auf iOS nicht verfügbar. Erlaubt sind Speicher, Sensoren, HTTP, Bluetooth LE und Vibration.';

export const IOS_ALLOWED_LABELS = ['Speicher', 'Sensoren', 'HTTP', 'Bluetooth LE', 'Vibration'] as const;

export function isIosLearningPlatform(platform: string): boolean {
  return platform === 'ios';
}

/** iOS is own-repos-only even when a catalog-only build flag is set. Android keeps its flag. */
export function installModeForPlatform(platform: string, catalogOnlyFlag = false): InstallMode {
  if (isIosLearningPlatform(platform)) return 'own-repos-only';
  return catalogOnlyFlag ? 'catalog-only' : 'open';
}

export function showsCuratedCatalog(platform: string): boolean {
  return !isIosLearningPlatform(platform);
}

export function showsLearningChrome(platform: string): boolean {
  return isIosLearningPlatform(platform);
}

/** Running code uses at most 80% of the available height. The bar keeps the rest. */
export function learningPaneHeights(availableHeight: number): { bar: number; code: number } {
  const height = Number.isFinite(availableHeight) && availableHeight > 0 ? availableHeight : 0;
  const code = Math.floor(height * 0.8);
  return { bar: height - code, code };
}

export function iosBlockedCapability(platform: string, category: string, remote?: unknown): string | null {
  void remote;
  if (!isIosLearningPlatform(platform)) return null;
  if (IOS_ALLOWED.has(category)) return null;
  return IOS_CAPABILITY_ERROR;
}

export function assessBridgeCall(platform: string, method: string): string | null {
  const spec = bridgeMethod(method);
  if (!spec) return null;
  return iosBlockedCapability(platform, spec.category);
}

export function permissionsOfferedOnPlatform(platform: string, permissions: readonly Permission[]): Permission[] {
  if (!isIosLearningPlatform(platform)) return permissions.slice();
  return permissions.filter((permission) => IOS_ALLOWED.has(permission));
}

function isViewableSource(rel: string): boolean {
  const base = rel.split('/').pop() || '';
  return /\.(html?|js|mjs|cjs)$/i.test(base);
}

/** Entry HTML first, then other HTML and JavaScript files. Other types stay out of the viewer. */
export function selectSourceFiles(rels: readonly string[], entrypoint: string): string[] {
  const source = rels.filter((rel) => isStoredRelPath(rel) && isViewableSource(rel));
  let entry = '';
  try {
    entry = normalizeEntrypoint(entrypoint);
  } catch {
    entry = '';
  }
  const unique = Array.from(new Set(source));
  const rest = unique.filter((rel) => rel !== entry).sort((a, b) => a.localeCompare(b));
  if (entry && unique.includes(entry)) return [entry, ...rest];
  return rest;
}
