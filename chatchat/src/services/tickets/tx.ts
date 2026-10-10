import type { Case, Prisma, PrismaClient, Ticket } from '@prisma/client';
import type { Principal } from '../../auth/sessions.js';
import { findCaseFor } from '../cases.js';
import type { CollabDeps } from '../collab/publish.js';
import { fail, ok, type Result } from '../collab/result.js';
import { lockKey } from '../steps/locate.js';
import { afterTicketChange, type TicketChange } from './effects.js';
import type { TicketEventType } from './events.js';

/**
 * Общото на действията по тикета: достъпът (тикетът се вижда, ако се вижда случаят му — чужд
 * клиент или чужд случай = 404) и транзакцията със заключване на тикета, в която действието
 * чете ПРЕСНОТО състояние. Последиците (известия, реално време) — след commit.
 */

export interface Applied {
  kind: TicketEventType;
  ticket: Ticket;
  c: Case;
  previousOwnerId?: string | null;
}

export async function loadTicketFor(
  db: PrismaClient,
  p: Principal,
  ticketId: string,
): Promise<{ ticket: Ticket; c: Case } | null> {
  const ticket = await db.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) return null;
  const c = await findCaseFor(db, p, ticket.caseId);
  return c ? { ticket, c } : null;
}

export function changeOf(a: Applied, actorId: string): TicketChange {
  return {
    kind: a.kind,
    actorId,
    previousOwnerId: a.previousOwnerId ?? null,
    c: {
      id: a.c.id,
      number: a.c.number,
      tenantId: a.c.tenantId,
      createdById: a.c.createdById,
      assignedToId: a.c.assignedToId,
      status: a.c.status,
      aiPaused: a.c.aiPaused,
    },
    ticket: {
      id: a.ticket.id,
      number: a.ticket.number,
      status: a.ticket.status,
      queue: a.ticket.queue,
      ownerId: a.ticket.ownerId,
    },
  };
}

/**
 * Изпълнява действие по тикета: 404 без достъп; в транзакцията — заключване и пресни редове.
 * `apply` връща грешка ПРЕДИ да пише, null при „няма промяна“ (повтор), иначе промяната.
 */
export async function inTicketTx(
  deps: CollabDeps,
  p: Principal,
  ticketId: string,
  apply: (tx: Prisma.TransactionClient, ticket: Ticket, c: Case) => Promise<Result<Applied | null>>,
): Promise<Result<Applied | null>> {
  if (!(await loadTicketFor(deps.db, p, ticketId))) return fail(404, 'not_found');
  const result = await deps.db.$transaction(async (tx) => {
    await lockKey(tx, `ticket|${ticketId}`);
    const ticket = await tx.ticket.findUnique({ where: { id: ticketId } });
    const c = ticket ? await tx.case.findUnique({ where: { id: ticket.caseId } }) : null;
    if (!ticket || !c) return fail<Applied | null>(404, 'not_found');
    return apply(tx, ticket, c);
  });
  if (result.ok && result.value) await afterTicketChange(deps, changeOf(result.value, p.user.id));
  return result;
}

export const owned = (p: Principal, t: Pick<Ticket, 'ownerId'>): boolean => t.ownerId === p.user.id;

export { fail, ok, type Result };
