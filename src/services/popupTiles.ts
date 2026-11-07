const TILE_FIELDS = ['icon', 'label', 'subtitle', 'state', 'popup', 'menu', 'allowLocked'];
export const TILE_STATES = ['active', 'inactive', 'unavailable'];

export function normalizeTilePatch(p: any): Record<string, any> {
  if (!p || typeof p !== 'object') throw new Error('tile.set: Objekt erwartet, z.B. {label:"Licht", state:"active"}');
  const out: Record<string, any> = {};
  for (const k of Object.keys(p)) {
    if (!TILE_FIELDS.includes(k)) throw new Error(`tile.set: unbekanntes Feld "${k}"`);
  }
  if (p.label !== undefined) out.label = String(p.label);
  if (p.subtitle !== undefined) out.subtitle = p.subtitle == null ? '' : String(p.subtitle);
  if (p.icon !== undefined) out.icon = p.icon == null ? '' : String(p.icon);
  if (p.state !== undefined) {
    if (!TILE_STATES.includes(p.state)) throw new Error(`tile.set: state "${p.state}" ungültig`);
    out.state = p.state;
  }
  if (p.popup !== undefined) out.popup = p.popup;
  if (p.menu !== undefined) out.menu = p.menu;
  if (p.allowLocked !== undefined) out.allowLocked = p.allowLocked === true;
  return out;
}

export function normalizePopupSpec(spec: any, appId: string): Record<string, any> {
  if (!spec || typeof spec !== 'object') throw new Error('popup: Objekt erwartet');
  const hasHtml = typeof spec.html === 'string';
  const hasUrl = typeof spec.url === 'string';
  if (hasHtml === hasUrl) throw new Error('popup: genau eines von html oder url');
  const out: Record<string, any> = { appId };
  if (spec.id !== undefined) out.id = String(spec.id);
  if (hasHtml) out.html = spec.html;
  else out.url = spec.url;
  if (spec.title !== undefined) out.title = String(spec.title);
  if (spec.state !== undefined) out.state = spec.state;
  if (spec.allowLocked === true) out.allowLocked = true;
  if (spec.throttleMs !== undefined) out.throttleMs = Math.max(0, Math.min(10000, Number(spec.throttleMs) || 0));
  return out;
}
