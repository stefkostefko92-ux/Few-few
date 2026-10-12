import { caseAudiences, can } from '../../auth/rbac.js';
import type { Principal } from '../../auth/sessions.js';
import { redactPii } from '../../domain/pii.js';
import { buildTicketSummary } from '../cases.js';
import type { CollabDeps } from '../collab/publish.js';
import { auditReason } from '../users.js';
import type { Prisma } from '@prisma/client';
import { recordTicketEvent } from './events.js';
import { caseStatusFor, nextTicketStatus } from './flow.js';
import { fail, inTicketTx, ok, owned, type Applied, type Result } from './tx.js';

/**
 * Действията на оператора по тикета (FR-09, FR-19): поемане, назначаване/прехвърляне, „поискай
 * още данни“, „прехвърли към Engineering“, „върни към AI“. Само `case:assign` (проверено в
 * маршрута); промяна по ЧУЖД тикет — само отговорникът, освен прехвърлянето с причина.
 * Всяка промяна → `recordTicketEvent` в транзакцията (хронология + одит + дневник).
 */

type R = Promise<Result<Applied | null>>;

export function claimTicket(deps: CollabDeps, p: Principal, ticketId: string): R {
  return inTicketTx(deps, p, ticketId, async (tx, t, c) => {
    if (c.status === 'RESOLVED' || t.status === 'CLOSED') return fail(409, 'invalid_transition');
    if (t.ownerId && !owned(p, t)) return fail(409, 'ticket_owned');
    const to = nextTicketStatus('claim', t.status, true);
    if (!to) return fail(409, 'invalid_transition');
    if (owned(p, t) && to === t.status) return ok(null);
    const ticket = await tx.ticket.update({
      where: { id: t.id },
      data: { ownerId: p.user.id, status: to },
    });
    const updated = await tx.case.update({
      where: { id: c.id },
      data: { assignedToId: p.user.id, status: caseStatusFor(to) },
    });
    await recordTicketEvent(tx, {
      tenantId: c.tenantId,
      ticket,
      type: 'ticket.claimed',
      actorId: p.user.id,
      from: t.status,
      to,
    });
    return ok({ kind: 'ticket.claimed', ticket, c: updated, previousOwnerId: t.ownerId });
  });
}

/** Назначаване на колега / прехвърляне. Чужд тикет — само с причина (тя е в одита). */
export async function assignTicket(
  deps: CollabDeps,
  p: Principal,
  ticketId: string,
  input: { userId: string; reason?: string | undefined },
): R {
  if (input.userId === p.user.id) return claimTicket(deps, p, ticketId);
  const now = new Date();
  const target = await deps.db.user.findFirst({
    where: {
      id: input.userId,
      tenantId: p.user.tenantId,
      active: true,
      kind: 'INTERNAL',
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { id: true, role: true },
  });
  if (!target || !can(target.role, 'case:assign')) return fail(422, 'invalid_assignee');
  return inTicketTx(deps, p, ticketId, async (tx, t, c) => {
    if (c.status === 'RESOLVED' || t.status === 'CLOSED') return fail(409, 'invalid_transition');
    if (t.ownerId === target.id) return ok(null);
    if (t.ownerId && !owned(p, t) && !input.reason) return fail(422, 'reason_required');
    const to = nextTicketStatus('assign', t.status, true);
    if (!to) return fail(409, 'invalid_transition');
    const ticket = await tx.ticket.update({
      where: { id: t.id },
      data: { ownerId: target.id, status: to },
    });
    const updated = await tx.case.update({
      where: { id: c.id },
      data: { assignedToId: target.id, status: caseStatusFor(to) },
    });
    await recordTicketEvent(tx, {
      tenantId: c.tenantId,
      ticket,
      type: 'ticket.assigned',
      actorId: p.user.id,
      from: t.status,
      to,
      detail: { toId: target.id, toRole: target.role },
      auditOnly: input.reason ? { reason: auditReason(input.reason) } : {},
    });
    return ok({ kind: 'ticket.assigned', ticket, c: updated, previousOwnerId: t.ownerId });
  });
}

/** „Поискай още данни“: тикетът чака техника, случаят — WAITING_CUSTOMER със списъка. */
export function requestInfo(
  deps: CollabDeps,
  p: Principal,
  ticketId: string,
  input: { items: string[]; note?: string | undefined },
): R {
  return inTicketTx(deps, p, ticketId, async (tx, t, c) => {
    if (!owned(p, t)) return fail(403, 'not_ticket_owner');
    const to = nextTicketStatus('request_info', t.status, true);
    if (!to || c.status === 'RESOLVED') return fail(409, 'invalid_transition');
    const request = await tx.ticketInfoRequest.create({
      data: {
        ticketId: t.id,
        items: input.items.map((i) => redactPii(i)) as Prisma.InputJsonValue,
        note: input.note ? redactPii(input.note) : null,
        requestedById: p.user.id,
      },
    });
    const ticket = await tx.ticket.update({ where: { id: t.id }, data: { status: to } });
    const updated = await tx.case.update({
      where: { id: c.id },
      data: { status: caseStatusFor(to) },
    });
    await recordTicketEvent(tx, {
      tenantId: c.tenantId,
      ticket,
      type: 'ticket.info_requested',
      actorId: p.user.id,
      from: t.status,
      to,
      detail: { requestId: request.id, items: input.items.length },
    });
    return ok({ kind: 'ticket.info_requested', ticket, c: updated });
  });
}

/** „Прехвърли към Engineering“: в опашката на инженеринга, без отговорник, с резюме и причина. */
export async function escalateTicket(
  deps: CollabDeps,
  p: Principal,
  ticketId: string,
  input: { reason: string },
): R {
  const reason = redactPii(input.reason);
  return inTicketTx(deps, p, ticketId, async (tx, t, c) => {
    if (t.queue === 'ENGINEERING') return fail(409, 'already_engineering');
    if (t.ownerId && !owned(p, t)) return fail(403, 'not_ticket_owner');
    const to = nextTicketStatus('escalate', t.status, false);
    if (!to || c.status === 'RESOLVED') return fail(409, 'invalid_transition');
    const summary = await buildTicketSummary(tx, c, caseAudiences(p.user.role, c.portal));
    const ticket = await tx.ticket.update({
      where: { id: t.id },
      data: { queue: 'ENGINEERING', ownerId: null, status: to },
    });
    const updated = await tx.case.update({
      where: { id: c.id },
      data: { assignedToId: null, status: caseStatusFor(to) },
    });
    const handoff = await tx.caseHandoff.create({
      data: {
        tenantId: c.tenantId,
        caseId: c.id,
        ticketId: t.id,
        direction: 'TO_ENGINEERING',
        reason,
        summary: summary as unknown as Prisma.InputJsonValue,
        fromUserId: p.user.id,
      },
    });
    await recordTicketEvent(tx, {
      tenantId: c.tenantId,
      ticket,
      type: 'handoff.to_engineering',
      actorId: p.user.id,
      from: t.status,
      to,
      detail: { handoffId: handoff.id, queue: 'ENGINEERING' },
      auditOnly: { reason: auditReason(input.reason) },
    });
    return ok({ kind: 'handoff.to_engineering', ticket, c: updated, previousOwnerId: t.ownerId });
  });
}

/** „Върни към AI“: операторът позволява на AI да продължи; отговорникът и статусът остават. */
export function returnToAi(
  deps: CollabDeps,
  p: Principal,
  ticketId: string,
  input: { note?: string | undefined },
): R {
  return inTicketTx(deps, p, ticketId, async (tx, t, c) => {
    if (!owned(p, t)) return fail(403, 'not_ticket_owner');
    const to = nextTicketStatus('return_to_ai', t.status, true);
    if (!to || c.status === 'RESOLVED') return fail(409, 'invalid_transition');
    if (!c.aiPaused) return fail(409, 'ai_not_paused');
    const updated = await tx.case.update({ where: { id: c.id }, data: { aiPaused: false } });
    const handoff = await tx.caseHandoff.create({
      data: {
        tenantId: c.tenantId,
        caseId: c.id,
        ticketId: t.id,
        direction: 'TO_AI',
        reason: input.note ? redactPii(input.note) : '',
        fromUserId: p.user.id,
      },
    });
    await recordTicketEvent(tx, {
      tenantId: c.tenantId,
      ticket: t,
      type: 'handoff.to_ai',
      actorId: p.user.id,
      from: t.status,
      to,
      detail: { handoffId: handoff.id },
    });
    return ok({ kind: 'handoff.to_ai', ticket: t, c: updated });
  });
}
