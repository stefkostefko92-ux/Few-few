// Линеен спад на трайността: decayPercent % на всеки decayMinutes минути, без да пада под 0%.

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;

export interface DecayRate {
  decayPercent: number;
  decayMinutes: number;
}

export interface BatchAnchor {
  percent: number;
  anchoredAt: Date;
}

export function percentPerMs(rate: DecayRate): number {
  return rate.decayPercent / (rate.decayMinutes * MINUTE_MS);
}

export function percentAt(batch: BatchAnchor, rate: DecayRate, now: Date): number {
  const elapsed = Math.max(0, now.getTime() - batch.anchoredAt.getTime());
  return Math.max(0, batch.percent - percentPerMs(rate) * elapsed);
}

export function expiresAt(batch: BatchAnchor, rate: DecayRate): Date {
  return new Date(batch.anchoredAt.getTime() + batch.percent / percentPerMs(rate));
}

export function msLeft(batch: BatchAnchor, rate: DecayRate, now: Date): number {
  return Math.max(0, expiresAt(batch, rate).getTime() - now.getTime());
}

// Нова котва в `now` със същия текущ процент — при смяна на скоростта миналото не се преизчислява.
export function rebase(batch: BatchAnchor, rate: DecayRate, now: Date): BatchAnchor {
  return { percent: percentAt(batch, rate, now), anchoredAt: now };
}
