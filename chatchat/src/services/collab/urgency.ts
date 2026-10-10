import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * „Спешно“ (§12.3 „assegnazione urgente“): случай, който иска човек веднага — има отворен тикет
 * (ескалация), или последният AI отговор е блокиран от Safety Gate или препоръчва ескалация.
 * Изчислява се от записаното (не е поле, което някой „вдига“), само булево — съдържанието на
 * отговора не излиза от тук (аудиториите не се заобикалят).
 */

type Db = PrismaClient | Prisma.TransactionClient;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

/** Признаците в DiagnosticAnswer (§14.3): safety.level = blocked, escalation.recommended. */
export function answerIsUrgent(payload: unknown): boolean {
  if (!isRecord(payload)) return false;
  const safety = payload.safety;
  const escalation = payload.escalation;
  return (
    (isRecord(safety) && safety.level === 'blocked') ||
    (isRecord(escalation) && escalation.recommended === true)
  );
}

export async function isUrgentCase(db: Db, caseId: string): Promise<boolean> {
  const [ticket, last] = await Promise.all([
    db.ticket.findUnique({ where: { caseId }, select: { status: true } }),
    db.caseMessage.findFirst({
      where: { caseId, kind: 'AI' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { payload: true },
    }),
  ]);
  if (ticket && ticket.status !== 'CLOSED') return true;
  return answerIsUrgent(last?.payload ?? null);
}
