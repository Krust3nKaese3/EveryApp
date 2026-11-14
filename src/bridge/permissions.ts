/**
 * Every native capability needs a per-mini-app decision.
 * `events` is only the subscription channel; each event name has its own permission.
 * FREE_CATEGORIES stays empty so older call sites keep compiling.
 */
export const FREE_CATEGORIES: string[] = [];

export type PermissionChoice = 'allow' | 'ask' | 'deny';

export function permissionDecision(category: string, granted: string[], denied: string[] = []): PermissionChoice {
  if (category === 'events' || FREE_CATEGORIES.includes(category)) return 'allow';
  if (granted.includes(category)) return 'allow';
  if (denied.includes(category)) return 'deny';
  return 'ask';
}

/** Throws when the category is not already granted. First-use consent is handled by the caller. */
export function checkBridgePermission(category: string, granted: string[]): void {
  if (permissionDecision(category, granted, []) === 'allow') return;
  if (category === 'popup' || category === 'tiles')
    throw new Error(`${category === 'popup' ? 'Popups' : 'Kacheln'} nicht erlaubt: Die Mini-App muss "${category}" in den permissions ihres Manifests (everyapp.json) deklarieren und der Nutzer muss es erlauben`);
  if (category === 'net')
    throw new Error('Raw-Netzwerk nicht erlaubt: Die Mini-App muss "net" in den permissions ihres Manifests (everyapp.json) deklarieren und der Nutzer muss es erlauben');
  if (category === 'ble')
    throw new Error('BLE nicht erlaubt: Die Mini-App muss "ble" in den permissions ihres Manifests (everyapp.json) deklarieren und der Nutzer muss es erlauben');
  if (category === 'spotify')
    throw new Error('Spotify nicht erlaubt: Die Mini-App muss "spotify" in den permissions ihres Manifests (everyapp.json) deklarieren und der Nutzer muss es erlauben');
  throw new Error(`Permission denied: ${category}`);
}
