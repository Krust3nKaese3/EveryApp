/**
 * Grenzen für den TCP-Handshake. Die Raumlogik bleibt davon getrennt und ist einzeln testbar.
 */
import { MP_LIMITS } from './protocol';

/** Vergleicht zwei Zeichenketten ohne vorzeitigen Abbruch. */
export function sameSecret(a: string, b: string): boolean {
  const left = String(a ?? '');
  const right = String(b ?? '');
  const len = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let i = 0; i < len; i++) {
    const ac = i < left.length ? left.charCodeAt(i) : 0;
    const bc = i < right.length ? right.charCodeAt(i) : 0;
    diff |= ac ^ bc;
  }
  return diff === 0;
}

export function handshakeExpired(startedAt: number, now: number): boolean {
  return now - startedAt >= MP_LIMITS.handshakeMs;
}

/** Zu viele fehlgeschlagene Hellos sperren neue Verbindungen für eine kurze Zeit. */
export class HelloGuard {
  private failures: number[] = [];
  private lockedUntil = 0;

  recordFailure(now: number): void {
    this.failures = this.failures.filter((stamp) => now - stamp < MP_LIMITS.failureWindowMs);
    this.failures.push(now);
    if (this.failures.length >= MP_LIMITS.maxFailedHellos) {
      this.lockedUntil = now + MP_LIMITS.lockoutMs;
      this.failures = [];
    }
  }

  isLocked(now: number): boolean {
    return now < this.lockedUntil;
  }

  reset(): void {
    this.failures = [];
    this.lockedUntil = 0;
  }
}
