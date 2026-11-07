/** Pure: replace each secret value (>=3 chars, longest first) in s with •••. */
export function maskWith(values: string[], s: string): string {
  let out = String(s);
  for (const v of values.filter((x) => x && x.length >= 3).sort((a, b) => b.length - a.length)) out = out.split(v).join('•••');
  return out;
}

