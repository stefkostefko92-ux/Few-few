// Срокове за съхранение — чиста логика (без база), за да се тества.
// Записът/триенето е в ./retention.ts.

/** Търсенията без резултат се пазят най-много толкова дни от ПЪРВОТО търсене. */
export const SEARCH_MISS_RETENTION_DAYS = 90;

/** Колко често (най-много) приложението само чисти, без външен cron. */
export const PURGE_EVERY_MS = 12 * 60 * 60 * 1000;

/** Моментът, преди който записите са с изтекъл срок. */
export function retentionCutoff(now: Date, days: number = SEARCH_MISS_RETENTION_DAYS): Date {
  const d = Math.max(1, Math.floor(days));
  return new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
}

/** Време ли е за поредното автоматично чистене? */
export function purgeDue(lastAt: number | null, nowMs: number, everyMs = PURGE_EVERY_MS): boolean {
  return lastAt === null || nowMs - lastAt >= everyMs || nowMs < lastAt;
}
