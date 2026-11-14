/**
 * Beitritt ohne Token ist eine Anfrage.
 * Pro Adresse gibt es eine Obergrenze, abgelehnte Adressen warten.
 */
import { MP_LIMITS } from './protocol';

export class AskGuard {
  private stamps = new Map<string, number[]>();
  private locked = new Map<string, number>();

  allow(address: string, now: number): { ok: true } | { ok: false; code: 'rate'; message: string } {
    const key = address || 'unbekannt';
    const until = this.locked.get(key) || 0;
    if (now < until) return { ok: false, code: 'rate', message: 'Zu viele Anfragen. Kurz warten.' };
    const recent = (this.stamps.get(key) || []).filter((stamp) => now - stamp < MP_LIMITS.askWindowMs);
    this.stamps.set(key, recent);
    if (recent.length >= MP_LIMITS.maxAsksPerAddress) {
      return { ok: false, code: 'rate', message: 'Zu viele Anfragen. Kurz warten.' };
    }
    recent.push(now);
    this.stamps.set(key, recent);
    return { ok: true };
  }

  deny(address: string, now: number): void {
    this.locked.set(address || 'unbekannt', now + MP_LIMITS.askLockoutMs);
  }

  reset(): void {
    this.stamps.clear();
    this.locked.clear();
  }
}

export function resumeDelay(attempt: number): number {
  const step = Math.max(0, Math.min(4, Math.floor(attempt)));
  return Math.min(1000 * 2 ** step, MP_LIMITS.resumeBackoffMs);
}
