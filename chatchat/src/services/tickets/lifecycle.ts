import type { Case, Prisma, Ticket } from '@prisma/client';
import { audiencesFor, caseAudiences, can } from '../../auth/rbac.js';
import type { Principal } from '../../auth/sessions.js';
import { redactPii } from '../../domain/pii.js';
import { buildTicketSummary, humanNumber, isUniqueOn, withUniqueRetry } from '../cases.js';
import type { CollabDeps } from '../collab/publish.js';
import { lockKey } from '../steps/locate.js';
import { auditReason } from '../users.js';
import { afterTicketChange } from './effects.js';
import { recordTicketEvent } from './events.js';
import { caseStatusFor, isOpenTicket, nextTicketStatus } from './flow.js';
import { changeOf, fail, inTicketTx, ok, owned, type Applied, type Result } from './tx.js';

/**
 * Жизненият цикъл на тикета: създаване (с обобщение), предаване от техника на оператор (FR-19),
 * затваряне с резолюция (FR-09), повторно отваряне. Затвореният тикет затваря и случая
 * (RESOLVED); отвореният наново — отваря го (ESCALATED).
 */

type Tx = Prisma.TransactionClient;
type Summary = Awaited<ReturnType<typeof buildTicketSummary>>;

/**
 * Нов тикет в транзакцията. Поет случай → тикетът е на поелия и „в работа“ (отговорникът на
 * тикета и поелият случая са един човек). Повторът при съвпаднал номер е около транзакцията.
 */
export async function createTicketTx(
  tx: Tx,
  c: Case,
  actorId: string,
  reason: string,
  summary: Summary,
): Promise<Ticket> {
  const status = c.assignedToId ? 'IN_PROGRESS' : 'OPEN';
  const ticket = await tx.ticket.create({
    data: {
      caseId: c.id,
      number: humanNumber('TS'),
      reason: redactPii(reason),
      summary: summary as unknown as Prisma.InputJsonValue,
      createdById: actorId,
      ownerId: c.assignedToId,
      status,
    },
  });
  await recordTicketEvent(tx, {
    tenantId: c.tenantId,
    ticket,
    type: 'ticket.created',
    actorId,
    to: status,
    detail: { number: ticket.number },
  });
  return ticket;
}

/** Ескалация с тикет (POST /tickets, AC-08): тикет + ескалиран случай — всичко или нищо. */
export async function createTicket(
  deps: CollabDeps,
  p: Principal,
  c: Case,
  reason: string,
): Promise<Result<{ ticket: Ticket; summary: Summary }>> {
  const summary = await buildTicketSummary(deps.db, c, caseAudiences(p.user.role, c.portal));
  let applied: Applied;
  try {
    applied = await withUniqueRetry(() =>
      deps.db.$transaction(async (tx) => {
        const fresh = await tx.case.findUniqueOrThrow({ where: { id: c.id } });
        const ticket = await createTicketTx(tx, fresh, p.user.id, reason, summary);
        const updated = await tx.case.update({
          where: { id: c.id },
          data: { status: caseStatusFor(ticket.status), outcome: 'ESCALATED' },
        });
        return { kind: 'ticket.created' as const, ticket, c: updated };
      }),
    );
  } catch (err) {
    // Паралелна заявка за същия случай вече създаде тикета.
    if (isUniqueOn(err, 'caseId')) return fail(409, 'ticket_exists');
    throw err;
  }
  await afterTicketChange(deps, changeOf(applied, p.user.id));
  return ok({ ticket: applied.ticket, summary });
}

/** Свързаните източници на резолюцията: публикувани документи на клиента в аудиторията на човека. */
async function resolutionSources(deps: CollabDeps, p: Principal, ids: readonly string[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const docs = await deps.db.document.findMany({
    where: {
      id: { in: unique },
      tenantId: p.user.tenantId,
      status: 'PUBLISHED',
      audience: { in: [...audiencesFor(p.user.role)] },
    },
    select: { id: true, code: true, revision: true, title: true },
  });
  if (docs.length !== unique.length) return null;
  return docs.map((d) => ({
    documentId: d.id,
    documentCode: d.code,
    revision: d.revision,
    title: d.title,
  }));
}

export async function closeTicket(
  deps: CollabDeps,
  p: Principal,
  ticketId: string,
  input: { rootCause: string; solution: string; sourceDocumentIds: string[] },
): Promise<Result<Applied | null>> {
  const sources = await resolutionSources(deps, p, input.sourceDocumentIds);
  if (!sources) return fail(422, 'unknown_source');
  return inTicketTx(deps, p, ticketId, async (tx, t, c) => {
    if (!owned(p, t)) return fail(403, 'not_ticket_owner');
    const to = nextTicketStatus('close', t.status, true);
    if (!to) return fail(409, 'invalid_transition');
    const now = new Date();
    const resolution = {
      rootCause: redactPii(input.rootCause),
      solution: redactPii(input.solution),
      sources,
      via: 'ticket',
    };
    const ticket = await tx.ticket.update({
      where: { id: t.id },
      data: { status: to, resolution, closedAt: now, closedById: p.user.id },
    });
    const updated = await tx.case.update({
      where: { id: c.id },
      data: { status: 'RESOLVED', outcome: 'RESOLVED', closedAt: now, aiPaused: false },
    });
    await recordTicketEvent(tx, {
      tenantId: c.tenantId,
      ticket,
      type: 'ticket.closed',
      actorId: p.user.id,
      from: t.status,
      to,
      detail: { via: 'ticket', sources: sources.length },
    });
    return ok({ kind: 'ticket.closed', ticket, c: updated });
  });
}

/**
 * Техникът потвърждава „решен“ (§10.3) при отворен тикет: тикетът се затваря в СЪЩАТА
 * транзакция (резолюцията е „по изхода на случая“), за да не остане отворен в опашката.
 */
export async function closeTicketByOutcomeTx(
  tx: Tx,
  c: Case,
  actorId: string,
): Promise<Applied | null> {
  const t = await tx.ticket.findUnique({ where: { caseId: c.id } });
  if (!t || !isOpenTicket(t.status)) return null;
  const ticket = await tx.ticket.update({
    where: { id: t.id },
    data: {
      status: 'CLOSED',
      resolution: { rootCause: null, solution: null, sources: [], via: 'case.outcome' },
      closedAt: new Date(),
      closedById: actorId,
    },
  });
  await recordTicketEvent(tx, {
    tenantId: c.tenantId,
    ticket,
    type: 'ticket.closed',
    actorId,
    from: t.status,
    to: 'CLOSED',
    detail: { via: 'case.outcome', sources: 0 },
  });
  return { kind: 'ticket.closed', ticket, c };
}

/** Повторно отваряне: създателят на случая/тикета или операторът; причината е в одита. */
export function reopenTicket(
  deps: CollabDeps,
  p: Principal,
  ticketId: string,
  input: { reason: string },
): Promise<Result<Applied | null>> {
  return inTicketTx(deps, p, ticketId, async (tx, t, c) => {
    const allowed =
      c.createdById === p.user.id || t.createdById === p.user.id || can(p.user.role, 'case:assign');
    if (!allowed) return fail(403, 'forbidden');
    const to = nextTicketStatus('reopen', t.status, t.ownerId !== null);
    if (!to) return fail(409, 'invalid_transition');
    const ticket = await tx.ticket.update({
      where: { id: t.id },
      data: { status: to, closedAt: null, closedById: null },
    });
    const updated = await tx.case.update({
      where: { id: c.id },
      data: {
        status: caseStatusFor(to),
        outcome: 'ESCALATED',
        closedAt: null,
        assignedToId: t.ownerId,
      },
    });
    await recordTicketEvent(tx, {
      tenantId: c.tenantId,
      ticket,
      type: 'ticket.reopened',
      actorId: p.user.id,
      from: t.status,
      to,
      auditOnly: { reason: auditReason(input.reason) },
    });
    return ok({ kind: 'ticket.reopened', ticket, c: updated });
  });
}

/**
 * „Предай на оператор“ (FR-19, AC-14): изрично предаване от техника със съобщение. Създава тикет,
 * ако няма (затворен — отваря наново), спира AI за техника и записва предаването с резюмето
 * (контекст, източници, файлове, изпълнени стъпки, разрешения) и причината.
 */
export async function handoffToOperator(
  deps: CollabDeps,
  p: Principal,
  c: Case,
  message: string,
): Promise<Result<Applied>> {
  if (c.createdById !== p.user.id) return fail(403, 'forbidden');
  if (c.status === 'RESOLVED') return fail(409, 'case_closed');
  const summary = await buildTicketSummary(deps.db, c, caseAudiences(p.user.role, c.portal));
  const reason = redactPii(message);
  let result: Result<Applied>;
  try {
    result = await withUniqueRetry(() =>
      deps.db.$transaction(async (tx): Promise<Result<Applied>> => {
        await lockKey(tx, `case|${c.id}`);
        const fresh = await tx.case.findUniqueOrThrow({ where: { id: c.id } });
        let ticket = await tx.ticket.findUnique({ where: { caseId: c.id } });
        if (fresh.aiPaused && ticket && isOpenTicket(ticket.status)) {
          return fail(409, 'already_handed_off');
        }
        const from = ticket?.status ?? null;
        if (!ticket) {
          ticket = await createTicketTx(tx, fresh, p.user.id, message, summary);
        } else {
          const to = nextTicketStatus('handoff', ticket.status, ticket.ownerId !== null);
          if (to && to !== ticket.status) {
            ticket = await tx.ticket.update({
              where: { id: ticket.id },
              data: { status: to, closedAt: null, closedById: null },
            });
          }
        }
        const updated = await tx.case.update({
          where: { id: c.id },
          data: {
            aiPaused: true,
            status: caseStatusFor(ticket.status),
            outcome: 'ESCALATED',
            closedAt: null,
          },
        });
        const handoff = await tx.caseHandoff.create({
          data: {
            tenantId: c.tenantId,
            caseId: c.id,
            ticketId: ticket.id,
            direction: 'TO_OPERATOR',
            reason,
            summary: summary as unknown as Prisma.InputJsonValue,
            fromUserId: p.user.id,
          },
        });
        await recordTicketEvent(tx, {
          tenantId: c.tenantId,
          ticket,
          type: 'handoff.to_operator',
          actorId: p.user.id,
          from,
          to: ticket.status,
          detail: { handoffId: handoff.id },
        });
        return ok({ kind: 'handoff.to_operator', ticket, c: updated });
      }),
    );
  } catch (err) {
    if (isUniqueOn(err, 'caseId')) return fail(409, 'already_handed_off');
    throw err;
  }
  if (result.ok) await afterTicketChange(deps, changeOf(result.value, p.user.id));
  return result;
}
