/** JSON, das gefahrlos in ein injiziertes Skript eingesetzt werden kann. */
export function scriptJson(value: unknown): string {
  return JSON.stringify(value ?? null)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
    .replace(/&/g, '\\u0026');
}
