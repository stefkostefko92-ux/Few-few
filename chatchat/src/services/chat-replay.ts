import type { CaseMessage, PrismaClient } from '@prisma/client';
import { attachmentsByMessage, type MessageAttachment } from './attachments.js';

/**
 * Повторите на `POST /chat/messages` (NFR-12, AC-12): вече записаното съобщение по clientMessageId и
 * отговорът на него, плюс заключването „едно AI извикване на случай наведнъж“.
 */

/** Заключване за AI по-старо от това е от сринал се процес (таванът на извикването е 115 s). */
export const STALE_AI_MS = 3 * 60 * 1000;

export interface PriorMessage {
  prior: CaseMessage;
  answer: CaseMessage | null;
  files: MessageAttachment[];
  /** Няма по-късно човешко съобщение в случая — само тогава повторът може да пита AI наново. */
  latest: boolean;
}

export async function findPrior(
  db: PrismaClient,
  tenantId: string,
  caseId: string,
  clientMessageId: string,
): Promise<PriorMessage | null> {
  const prior = await db.caseMessage.findUnique({
    where: { caseId_clientMessageId: { caseId, clientMessageId } },
  });
  if (!prior) return null;
  // Отговорът на ТОВА съобщение: първият AI след него, но преди следващото човешко — иначе
  // повтор на съобщение без AI (askAi=false) би взел чужд, по-късен отговор.
  const next = await db.caseMessage.findFirst({
    where: { caseId, kind: 'HUMAN', createdAt: { gt: prior.createdAt } },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  });
  const answer = await db.caseMessage.findFirst({
    where: {
      caseId,
      kind: 'AI',
      createdAt: { gte: prior.createdAt, ...(next ? { lt: next.createdAt } : {}) },
    },
    orderBy: { createdAt: 'asc' },
  });
  const files = (await attachmentsByMessage(db, tenantId, [prior.id])).get(prior.id) ?? [];
  return { prior, answer, files, latest: next === null };
}

/**
 * Едно AI извикване на случай наведнъж — условен UPDATE в базата: паралелен повтор не вика модела
 * втори път. Заключване от сринал се процес (по-старо от STALE_AI_MS) не блокира случая завинаги.
 */
export async function claimAi(db: PrismaClient, caseId: string): Promise<boolean> {
  const claimed = await db.case.updateMany({
    where: {
      id: caseId,
      status: { not: 'RESOLVED' },
      OR: [
        { status: { not: 'AI_IN_PROGRESS' } },
        { updatedAt: { lt: new Date(Date.now() - STALE_AI_MS) } },
      ],
    },
    data: { status: 'AI_IN_PROGRESS' },
  });
  return claimed.count === 1;
}
