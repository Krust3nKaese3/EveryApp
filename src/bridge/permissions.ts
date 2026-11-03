/** Pure bridge permission check (unit tested). Throws a readable error when the category is not allowed. */
export const FREE_CATEGORIES = ['clipboard', 'network', 'media', 'secrets', 'crypto'];
export function checkBridgePermission(category: string, granted: string[]): void {
  if (category === 'events' || FREE_CATEGORIES.includes(category)) return;
  if (granted.includes(category)) return;
  if (category === 'popup' || category === 'tiles')
    throw new Error(`${category === 'popup' ? 'Popups' : 'Kacheln'} nicht erlaubt: Die Mini-App muss "${category}" in den permissions ihres Manifests (everyapp.json) deklarieren und der Nutzer muss es erlauben`);
  if (category === 'net')
    throw new Error('Raw-Netzwerk nicht erlaubt: Die Mini-App muss "net" in den permissions ihres Manifests (everyapp.json) deklarieren und der Nutzer muss es erlauben');
  if (category === 'ble')
    throw new Error('BLE nicht erlaubt: Die Mini-App muss "ble" in den permissions ihres Manifests (everyapp.json) deklarieren und der Nutzer muss es erlauben');
  throw new Error(`Permission denied: ${category}`);
}
