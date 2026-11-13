import { prisma } from '../db.js';
import { DAY } from '../time.js';

/**
 * Срокът за данните от банковите извлечения (правен преглед, H1; договорът за обработване, т. 11): копието
 * при нас е само за сверката. Свързан или пропуснат ред — 90 дни след решението се заличават наредителят,
 * IBAN-ът и основанието (остават датата, сумата и референцията към плащането); несвързан ред се трие 12
 * месеца след датата на постъплението. Извлеченията по ЗСч пази фирмата и банката, не ние.
 */
export const BANK_RETENTION = {
  decidedMs: 90 * DAY,
  unmatchedMs: 365 * DAY,
} as const;

export async function purgeBankData(
  now: Date = new Date(),
): Promise<{ erased: number; deleted: number; statements: number }> {
  const erased = await prisma.bankLine.updateMany({
    where: {
      status: { in: ['MATCHED', 'IGNORED'] },
      decidedAt: { lt: new Date(now.getTime() - BANK_RETENTION.decidedMs) },
      OR: [
        { counterparty: { not: null } },
        { counterpartyIban: { not: null } },
        { remittance: { not: '' } },
      ],
    },
    data: { counterparty: null, counterpartyIban: null, remittance: '' },
  });
  const deleted = await prisma.bankLine.deleteMany({
    where: {
      status: 'NEW',
      bookingDate: { lt: new Date(now.getTime() - BANK_RETENTION.unmatchedMs) },
    },
  });
  // Извлечение без нито един ред (всичко изтрито) — и то си отива.
  const statements = await prisma.bankStatement.deleteMany({ where: { lines: { none: {} } } });
  return { erased: erased.count, deleted: deleted.count, statements: statements.count };
}
