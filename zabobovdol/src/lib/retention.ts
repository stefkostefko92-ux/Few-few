import "server-only";
import { prisma } from "@/lib/prisma";
import {
  businessContactPurgeWhere,
  phoneReportPurgeWhere,
  purgeDue,
  retentionCutoff,
  SEARCH_MISS_RETENTION_DAYS,
} from "@/lib/retention-core";

export {
  BUSINESS_CONTACT_RETENTION_MONTHS,
  PHONE_REPORT_OPEN_MONTHS,
  PHONE_REPORT_RESOLVED_DAYS,
  SEARCH_MISS_RETENTION_DAYS,
} from "@/lib/retention-core";

// Срокове за съхранение (числата и условията са в ./retention-core.ts):
//
// - SearchMiss (текст на търсене без резултат, вече маскиран) се трие 90 дни
//   след ПЪРВОТО търсене (createdAt) — независимо дали е обработен. Ако някой
//   потърси същото пак, записът започва наново с брой 1.
// - PhoneReport („Този номер е сгрешен“): поправеният — 90 дни след последната
//   промяна (updatedAt); непоправеният — 1 година след подаването.
// - Контактите от формата за бизнес (ContactMessage с тема „Нов бизнес за
//   проверка:“/„Поправка за бизнес:“) — 6 месеца след подаването.
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

export async function purgeExpiredPhoneReports(now = new Date()): Promise<number> {
  const res = await prisma.phoneReport.deleteMany({ where: phoneReportPurgeWhere(now) });
  return res.count;
}

export async function purgeExpiredBusinessContacts(now = new Date()): Promise<number> {
  const res = await prisma.contactMessage.deleteMany({ where: businessContactPurgeWhere(now) });
  return res.count;
}

export type PurgeCounts = { searchMiss: number; phoneReport: number; businessContact: number };

/** Всички срокове наведнъж. Хвърля при грешка в базата (за /api/retention). */
export async function purgeExpired(now = new Date()): Promise<PurgeCounts> {
  return {
    searchMiss: await purgeExpiredSearchMisses(now),
    phoneReport: await purgeExpiredPhoneReports(now),
    businessContact: await purgeExpiredBusinessContacts(now),
  };
}

let lastPurgeAt: number | null = null;

/** Чисти, ако е минало достатъчно време от последния път. Никога не хвърля. */
export async function purgeIfDue(): Promise<void> {
  const now = Date.now();
  if (!purgeDue(lastPurgeAt, now)) return;
  lastPurgeAt = now;
  // Поотделно: грешка в едното не спира другите.
  const at = new Date(now);
  for (const [what, run] of [
    ["стари търсения", purgeExpiredSearchMisses],
    ["стари сигнали за сгрешени номера", purgeExpiredPhoneReports],
    ["стари контакти от формата за бизнес", purgeExpiredBusinessContacts],
  ] as const) {
    try {
      await run(at);
    } catch (err) {
      console.error(`Грешка при чистене на ${what}:`, err);
    }
  }
}
