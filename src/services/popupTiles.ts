/** Pure helpers for popups + runtime tile customization (unit tested in tests/popupTiles.test.js). */

export const BUILTIN_ICONS = ['add', 'bluetooth', 'bolt', 'car', 'check', 'circle', 'close', 'game', 'headset', 'heart', 'home', 'input',
  'lightbulb', 'lock', 'menu', 'movie', 'music', 'next', 'pause', 'play', 'power', 'previous', 'remove', 'speaker', 'star', 'stop', 'tv',
  'volume_down', 'volume_mute', 'volume_up', 'wifi'];
const ICON_ALIASES: Record<string, string> = { light: 'lightbulb', lamp: 'lightbulb', flash_on: 'bolt', favorite: 'heart', skip_next: 'next',
  skip_previous: 'previous', play_arrow: 'play', power_settings_new: 'power', bluetooth_connected: 'bluetooth', volume_off: 'volume_mute', settings_input_component: 'input' };

export type IconKind = { kind: 'builtin' | 'data' | 'url' | 'svg' | 'letter'; value: string };

/**
 * icon spec → what the native side can use.
 * - builtin/Material name ("lightbulb", "power_settings_new") → builtin
 * - "data:image/png;base64,…" → data; "data:image/svg+xml…" or "<svg…" → svg (rasterize in WebView first)
 * - https URL → url (native downloads + inlines); http is rejected
 * - repo-relative path ("icons/lamp.png") → url via rawBase; ".svg" → svg (WebView rasterizes)
 * - anything else (emoji, single letters) → letter fallback
 */
export function classifyIcon(spec: string, rawBase?: string | null): IconKind {
  const s = String(spec ?? '').trim();
  if (!s) throw new Error('icon leer');
  if (/^<svg[\s>]/i.test(s) || /^data:image\/svg\+xml/i.test(s)) return { kind: 'svg', value: s };
  if (/^data:image\//i.test(s)) return { kind: 'data', value: s };
  if (/^http:\/\//i.test(s)) throw new Error(`Icon "${s}": nur https erlaubt`);
  if (/^https:\/\//i.test(s)) return { kind: /\.svg(\?|#|$)/i.test(s) ? 'svg' : 'url', value: s };
  const name = s.toLowerCase();
  if (BUILTIN_ICONS.includes(name)) return { kind: 'builtin', value: name };
  if (ICON_ALIASES[name]) return { kind: 'builtin', value: ICON_ALIASES[name] };
  if (/^[\w./-]+\.(png|jpe?g|webp|gif|svg)$/i.test(s)) {
    if (!rawBase) throw new Error(`Icon "${s}": Repo-Pfad, aber Repo-URL der Mini-App unbekannt`);
    const url = rawBase.replace(/\/+$/, '') + '/' + s.replace(/^\.?\/+/, '');
    return { kind: /\.svg$/i.test(s) ? 'svg' : 'url', value: url };
  }
  return { kind: 'letter', value: s };
}

export const TILE_STATES = ['active', 'inactive', 'unavailable'];
/** Validates a tile(n).set patch. state accepts active|inactive|unavailable (also on/off/true/false). */
export function normalizeTilePatch(p: any): Record<string, any> {
  if (!p || typeof p !== 'object') throw new Error('tile.set: Objekt erwartet, z.B. {label:"Licht", state:"active"}');
  const out: Record<string, any> = {};
  for (const k of Object.keys(p)) if (!['icon', 'label', 'subtitle', 'state', 'popup', 'menu', 'allowLocked'].includes(k)) throw new Error(`tile.set: unbekanntes Feld "${k}"`);
  if (p.label !== undefined) out.label = String(p.label);
  if (p.subtitle !== undefined) out.subtitle = p.subtitle == null ? '' : String(p.subtitle);
  if (p.icon !== undefined) out.icon = p.icon == null ? '' : String(p.icon);
  if (p.state !== undefined) {
    const s = p.state === true || p.state === 'on' ? 'active' : p.state === false || p.state === 'off' ? 'inactive' : String(p.state);
    if (!TILE_STATES.includes(s)) throw new Error(`tile.set: state "${p.state}" ungültig (active|inactive|unavailable)`);
    out.state = s === 'active' ? 'on' : s === 'inactive' ? 'off' : 'unavailable';
  }
  if (p.popup !== undefined) out.popup = p.popup;
  if (p.menu !== undefined) out.menu = p.menu;
  if (p.allowLocked !== undefined) out.allowLocked = p.allowLocked === true;
  return out;
}

export function checkTileOwner(slot: number, cur: { appId?: string } | undefined, appId: string) {
  if (!Number.isInteger(slot) || slot < 1 || slot > 5) throw new Error(`Kachel ${slot}: nur 1–5`);
  if (cur?.appId && cur.appId !== appId) throw new Error(`Kachel ${slot} gehört der Mini-App "${cur.appId}" – erst dort freigeben (tile(${slot}).release())`);
}

const SIZE_RE = /^(auto|\d+(\.\d+)?%|\d+(\.\d+)?)$/;
const POS = ['center', 'bottom', 'top'];
const ANIM = ['fade', 'slide', 'scale', 'none'];
/** Validates/normalizes a popup spec; binds it to appId. */
export function normalizePopupSpec(spec: any, appId: string): Record<string, any> {
  if (!spec || typeof spec !== 'object') throw new Error('popup: Objekt erwartet {id, html|url, style?}');
  const id = String(spec.id ?? '').trim();
  if (!id) throw new Error('popup: "id" fehlt');
  const hasHtml = typeof spec.html === 'string' && spec.html.trim() !== '';
  const hasUrl = typeof spec.url === 'string' && spec.url.trim() !== '';
  if (hasHtml === hasUrl) throw new Error(`popup "${id}": genau eins von "html" oder "url" angeben`);
  if (hasUrl && !/^https:\/\//i.test(spec.url)) throw new Error(`popup "${id}": nur https-URLs erlaubt (${spec.url})`);
  const st = { ...(spec.style || {}) };
  for (const k of ['width', 'height']) if (st[k] !== undefined && !SIZE_RE.test(String(st[k]))) throw new Error(`popup "${id}": style.${k} "${st[k]}" ungültig (dp-Zahl, "NN%" oder "auto")`);
  if (st.width === 'auto') st.width = 'auto';
  if (st.position !== undefined && !POS.includes(st.position)) throw new Error(`popup "${id}": style.position "${st.position}" ungültig (${POS.join('|')})`);
  if (st.animation !== undefined && !ANIM.includes(st.animation)) throw new Error(`popup "${id}": style.animation "${st.animation}" ungültig (${ANIM.join('|')})`);
  for (const k of ['backgroundAlpha', 'scrimAlpha']) if (st[k] !== undefined && !(Number(st[k]) >= 0 && Number(st[k]) <= 1)) throw new Error(`popup "${id}": style.${k} muss 0..1 sein`);
  const out: Record<string, any> = { id, appId, style: st };
  if (hasHtml) out.html = spec.html; else out.url = spec.url;
  if (spec.title !== undefined) out.title = String(spec.title);
  if (spec.state !== undefined) out.state = spec.state;
  if (spec.allowLocked === true) out.allowLocked = true;
  if (spec.throttleMs !== undefined) out.throttleMs = Math.max(0, Math.min(10000, Number(spec.throttleMs) || 0));
  return out;
}
