import "server-only";
import { prisma } from "@/lib/prisma";
import { purgeDue, retentionCutoff, SEARCH_MISS_RETENTION_DAYS } from "@/lib/retention-core";

export { SEARCH_MISS_RETENTION_DAYS } from "@/lib/retention-core";

// Срок за съхранение на данните от търсенето.
//
// - SearchMiss (текст на търсене без резултат, вече маскиран) се трие 90 дни
//   след ПЪРВОТО търсене (createdAt) — независимо дали е обработен. Ако някой
//   потърси същото пак, записът започва наново с брой 1.
// - DailyStat НЕ се трие: съдържа само брой на ден × страница × източник,
//   без никакви лични данни (агрегат).
//
// Пуска се по два начина: защитен POST /api/retention (cron на сървъра) и
// автоматично, най-много веднъж на 12 часа, при запис на ново търсене.

export async function purgeExpiredSearchMisses(now = new Date()): Promise<number> {
  const res = await prisma.searchMiss.deleteMany({
    where: { createdAt: { lt: retentionCutoff(now, SEARCH_MISS_RETENTION_DAYS) } },
  });
  return res.count;
}

let lastPurgeAt: number | null = null;

/** Чисти, ако е минало достатъчно време от последния път. Никога не хвърля. */
export async function purgeIfDue(): Promise<void> {
  const now = Date.now();
  if (!purgeDue(lastPurgeAt, now)) return;
  lastPurgeAt = now;
  try {
    await purgeExpiredSearchMisses(new Date(now));
  } catch (err) {
    console.error("Грешка при чистене на стари търсения:", err);
  }
}
