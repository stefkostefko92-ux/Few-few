// Срокове за съхранение — чиста логика (без база), за да се тества.
// Записът/триенето е в ./retention.ts.

/** Търсенията без резултат се пазят най-много толкова дни от ПЪРВОТО търсене. */
export const SEARCH_MISS_RETENTION_DAYS = 90;

/** Сигнал „Този номер е сгрешен“, който е поправен: толкова дни след последната промяна. */
export const PHONE_REPORT_RESOLVED_DAYS = 90;
/** Сигнал, който НЕ е поправен: толкова месеца (1 година) след подаването. */
export const PHONE_REPORT_OPEN_MONTHS = 12;
/** Контактите от формата за бизнес: толкова месеца след подаването. */
export const BUSINESS_CONTACT_RETENTION_MONTHS = 6;

// Формата „Добавете своя бизнес“ (/biznes/nova) пази името, телефона и имейла
// на подателя в ContactMessage с една от тези теми. Тест проверява, че
// src/app/biznes/nova/actions.ts ползва точно тях — иначе триенето би
// пропуснало записите. Другите контактни съобщения (/kontakti) не се пипат тук.
export const BUSINESS_CONTACT_SUBJECT_PREFIXES = ["Нов бизнес за проверка:", "Поправка за бизнес:"] as const;

/** Колко често (най-много) приложението само чисти, без външен cron. */
export const PURGE_EVERY_MS = 12 * 60 * 60 * 1000;

/** Моментът, преди който записите са с изтекъл срок. */
export function retentionCutoff(now: Date, days: number = SEARCH_MISS_RETENTION_DAYS): Date {
  const d = Math.max(1, Math.floor(days));
  return new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
}

/** Същото, но в календарни месеци („6 месеца“, „1 година“) — 31.08 − 6 мес. = 28/29.02. */
export function retentionCutoffMonths(now: Date, months: number): Date {
  const m = Math.max(1, Math.floor(months));
  const y = now.getUTCFullYear();
  const mo = now.getUTCMonth() - m;
  const lastDay = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      y,
      mo,
      Math.min(now.getUTCDate(), lastDay),
      now.getUTCHours(),
      now.getUTCMinutes(),
      now.getUTCSeconds(),
      now.getUTCMilliseconds(),
    ),
  );
}

// Условията за триене като обикновени обекти (форма на Prisma `where`), за да се
// тестват без база.

/** PhoneReport: поправен → 90 дни след последната промяна; непоправен → 1 година от подаването. */
export function phoneReportPurgeWhere(now: Date) {
  return {
    OR: [
      { resolved: true, updatedAt: { lt: retentionCutoff(now, PHONE_REPORT_RESOLVED_DAYS) } },
      { resolved: false, createdAt: { lt: retentionCutoffMonths(now, PHONE_REPORT_OPEN_MONTHS) } },
    ],
  };
}

/** ContactMessage от формата за бизнес → 6 месеца от подаването (обработен или не). */
export function businessContactPurgeWhere(now: Date) {
  return {
    createdAt: { lt: retentionCutoffMonths(now, BUSINESS_CONTACT_RETENTION_MONTHS) },
    OR: BUSINESS_CONTACT_SUBJECT_PREFIXES.map((p) => ({ subject: { startsWith: p } })),
  };
}

/** Време ли е за поредното автоматично чистене? */
export function purgeDue(lastAt: number | null, nowMs: number, everyMs = PURGE_EVERY_MS): boolean {
  return lastAt === null || nowMs - lastAt >= everyMs || nowMs < lastAt;
}
