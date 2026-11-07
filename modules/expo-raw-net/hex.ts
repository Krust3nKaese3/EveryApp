// ---- byte helpers (pure) ----
export const utf8ToHex = (s: string) => Array.from(new TextEncoder().encode(s)).map((b) => b.toString(16).padStart(2, '0')).join('');
export const hexToUtf8 = (h: string) => new TextDecoder().decode(new Uint8Array((h.match(/../g) || []).map((x) => parseInt(x, 16))));
export const toHex = (d: number[] | string | Uint8Array) =>
  typeof d === 'string' ? d.replace(/[^0-9a-fA-F]/g, '').toLowerCase() : Array.from(d).map((b) => (Number(b) & 0xff).toString(16).padStart(2, '0')).join('');
export const hexToBytes = (h: string) => (h.match(/../g) || []).map((x) => parseInt(x, 16));
