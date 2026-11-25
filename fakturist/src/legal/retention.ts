import { prisma } from '../db.js';
import { DAY } from '../time.js';

/**
 * Сроковете от политиката за поверителност (views/legal/privacy, ред „Приетите правни документи“ и
 * „Одитен дневник“) — изпълнителят им (src/maintenance.ts):
 * - приетите условия — 5 години след закриване на профила (общата давност): приетите само от човека се
 *   трият; приетите за фирма, която още работи, губят връзката с човека (остават доказателство за
 *   договора ѝ); тези на изтрита фирма — 5 години след изтриването ѝ;
 * - одитът на фирмата — 5 години след изтриването ѝ (надгробието от termination-purge.ts).
 * Одитната верига губи тези редове: следващият ред пази `prevHash` на изтрития — прекъсване по срока,
 * не подправяне (проверката на веригата трябва да го приема).
 */
export const LEGAL_RETENTION_MS = 5 * 365 * DAY;

/** Закритият профил (src/accounts/close.ts): псевдонимизиран имейл и `disabledAt` = моментът на закриването. */
const CLOSED_EMAIL_SUFFIX = '@fakturist.invalid';

export async function purgeLegalRecords(now: Date = new Date()): Promise<{
  acceptances: number;
  audit: number;
}> {
  const before = new Date(now.getTime() - LEGAL_RETENTION_MS);
  const closed = { email: { endsWith: CLOSED_EMAIL_SUFFIX }, disabledAt: { lt: before } };
  const removed = await prisma.legalAcceptance.deleteMany({
    where: {
      OR: [{ organization: { deletedAt: { lt: before } } }, { organizationId: null, user: closed }],
    },
  });
  // Фирмата още работи: приемането остава доказателство за договора ѝ, но без връзката с човека.
  const unlinked = await prisma.legalAcceptance.updateMany({
    where: { user: closed },
    data: { userId: null },
  });
  const acceptances = { count: removed.count + unlinked.count };
  const audit = await prisma.auditLog.deleteMany({
    where: { organization: { deletedAt: { lt: before } } },
  });
  return { acceptances: acceptances.count, audit: audit.count };
}
