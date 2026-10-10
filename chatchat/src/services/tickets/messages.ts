import type { Case, Prisma } from '@prisma/client';
import { can } from '../../auth/rbac.js';
import type { Principal } from '../../auth/sessions.js';
import { notify } from '../collab/notify.js';
import type { CollabDeps } from '../collab/publish.js';
import { lockKey } from '../steps/locate.js';
import { afterTicketChange } from './effects.js';
import { recordTicketEvent } from './events.js';
import { caseStatusFor, isOpenTicket, nextTicketStatus } from './flow.js';
import { changeOf, type Applied } from './tx.js';

/**
 * Съобщението на техника в случай с отворен тикет (FR-19): отговорът на „поискай още данни“
 * връща случая в работа (WAITING → IN_PROGRESS) в транзакцията на съобщението; иначе
 * отговорникът научава, че техникът е писал. Предаден случай (`aiPaused`) не стига до AI.
 */

export interface MessageFlow {
  applied: Applied | null;
  notifyOwner: string | null;
}

const NONE: MessageFlow = { applied: null, notifyOwner: null };

/** AI е спрян за човека: случаят е предаден на оператор, а питащият не е операторът/персоналът. */
export function aiPausedFor(c: Pick<Case, 'aiPaused'>, p: Principal): boolean {
  return c.aiPaused && !(p.user.kind === 'INTERNAL' && can(p.user.role, 'case:assign'));
}

export async function onCaseMessageTx(
  tx: Prisma.TransactionClient,
  c: Case,
  authorId: string,
  messageId: string,
): Promise<MessageFlow> {
  if (authorId !== c.createdById) return NONE;
  const t = await tx.ticket.findUnique({ where: { caseId: c.id } });
  if (!t || !isOpenTicket(t.status)) return NONE;
  if (t.status === 'WAITING') {
    await lockKey(tx, `ticket|${t.id}`);
    const fresh = await tx.ticket.findUniqueOrThrow({ where: { id: t.id } });
    const request = await tx.ticketInfoRequest.findFirst({
      where: { ticketId: t.id, answeredAt: null },
      orderBy: { createdAt: 'desc' },
    });
    const to = nextTicketStatus('info_provided', fresh.status, fresh.ownerId !== null);
    if (request && to) {
      await tx.ticketInfoRequest.update({
        where: { id: request.id },
        data: { answeredAt: new Date(), answeredMessageId: messageId },
      });
      const ticket = await tx.ticket.update({ where: { id: t.id }, data: { status: to } });
      const updated = await tx.case.update({
        where: { id: c.id },
        data: { status: caseStatusFor(to) },
      });
      await recordTicketEvent(tx, {
        tenantId: c.tenantId,
        ticket,
        type: 'ticket.info_provided',
        actorId: authorId,
        from: fresh.status,
        to,
        detail: { requestId: request.id, messageId },
      });
      return { applied: { kind: 'ticket.info_provided', ticket, c: updated }, notifyOwner: null };
    }
  }
  return { applied: null, notifyOwner: t.ownerId && t.ownerId !== authorId ? t.ownerId : null };
}

export async function afterCaseMessage(
  deps: CollabDeps,
  flow: MessageFlow,
  c: Pick<Case, 'id' | 'number' | 'tenantId'>,
  actorId: string,
): Promise<void> {
  if (flow.applied) {
    await afterTicketChange(deps, changeOf(flow.applied, actorId));
    return;
  }
  if (!flow.notifyOwner) return;
  // Без текста на съобщението — само номерът; съдържанието се чете през REST с проверка.
  await notify(
    deps,
    [
      {
        tenantId: c.tenantId,
        userId: flow.notifyOwner,
        eventType: 'handoff.message',
        objectType: 'case',
        objectId: c.id,
        payload: { caseId: c.id, number: c.number },
      },
    ],
    actorId,
  );
}
