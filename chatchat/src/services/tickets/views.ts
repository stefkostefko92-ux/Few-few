import type { Case, CaseHandoff, PrismaClient, Ticket } from '@prisma/client';
import { can, caseAudiences } from '../../auth/rbac.js';
import type { Principal } from '../../auth/sessions.js';
import { assigneeFor, type MessageAuthor } from '../case-views.js';
import { buildTicketSummary, isParticipant } from '../cases.js';
import { loadStepPolicy } from '../steps/policy.js';
import { stepStateFor } from '../steps/views.js';

/**
 * Изгледите на тикета за читателя (FR-09, FR-19): статус, опашка, отговорник (порталът — ролята,
 * не името), отворената заявка за данни (техникът я вижда и отговаря в чата), предаванията.
 * Причината на прехвърляне към Engineering е вътрешна — порталът не я вижда.
 */

type Reader = Principal['user'];

async function people(db: PrismaClient, tenantId: string, ids: Array<string | null>) {
  const list = [...new Set(ids.filter((x): x is string => !!x))];
  if (list.length === 0) return new Map<string, MessageAuthor>();
  const rows = await db.user.findMany({
    where: { id: { in: list }, tenantId },
    select: { id: true, name: true, role: true, kind: true },
  });
  return new Map(rows.map((u) => [u.id, u]));
}

const view = (reader: Reader, map: Map<string, MessageAuthor>, id: string | null) => {
  const u = id ? map.get(id) : undefined;
  return u ? assigneeFor(reader, u) : null;
};

function handoffView(reader: Reader, map: Map<string, MessageAuthor>, h: CaseHandoff) {
  // Вътрешната причина за Engineering не излиза към портала (AC-18).
  const internalOnly = h.direction === 'TO_ENGINEERING' && reader.kind === 'PORTAL';
  return {
    id: h.id,
    direction: h.direction,
    reason: internalOnly ? null : h.reason,
    at: h.createdAt,
    by: view(reader, map, h.fromUserId),
  };
}

export async function ticketViewFor(
  db: PrismaClient,
  reader: Reader,
  c: Pick<Case, 'id' | 'tenantId'>,
) {
  const t = await db.ticket.findUnique({
    where: { caseId: c.id },
    include: {
      infoRequests: { where: { answeredAt: null }, orderBy: { createdAt: 'desc' }, take: 1 },
      handoffs: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });
  if (!t) return null;
  const request = t.status === 'WAITING' ? (t.infoRequests[0] ?? null) : null;
  const handoff = t.handoffs[0] ?? null;
  const map = await people(db, c.tenantId, [
    t.ownerId,
    request?.requestedById ?? null,
    handoff?.fromUserId ?? null,
  ]);
  return {
    ...ticketCore(t),
    owner: view(reader, map, t.ownerId),
    openInfoRequest: request
      ? {
          id: request.id,
          items: request.items,
          note: request.note,
          requestedAt: request.createdAt,
          requestedBy: view(reader, map, request.requestedById),
        }
      : null,
    lastHandoff: handoff ? handoffView(reader, map, handoff) : null,
  };
}

export function ticketCore(t: Ticket) {
  return {
    id: t.id,
    number: t.number,
    status: t.status,
    queue: t.queue,
    ownerId: t.ownerId,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    closedAt: t.closedAt,
    resolution: t.status === 'CLOSED' ? t.resolution : null,
  };
}

/** Допълненията към GET /cases/:id: тикет, стъпки, политиката за разрешенията. */
export async function caseFlowView(db: PrismaClient, p: Principal, c: Case) {
  const [ticket, steps, policy] = await Promise.all([
    ticketViewFor(db, p.user, c),
    stepStateFor(db, p, c),
    loadStepPolicy(db, c.tenantId),
  ]);
  const open = c.status !== 'RESOLVED';
  const staff = p.user.kind === 'INTERNAL';
  return {
    ticket,
    steps,
    stepPolicy: { safetyRelevant: policy.safetyRelevant, configurative: policy.configurative },
    // Какво човекът може тук — само за да не показва UI бутони, които сървърът би отказал.
    can: {
      recordSteps: open && isParticipant(p, c) && can(p.user.role, 'step:record'),
      approve: staff && can(p.user.role, 'step:approve'),
      handoff:
        open &&
        c.createdById === p.user.id &&
        can(p.user.role, 'ticket:create') &&
        !(c.aiPaused && ticket !== null && ticket.status !== 'CLOSED'),
      operate: staff && can(p.user.role, 'case:assign'),
      reopen:
        ticket?.status === 'CLOSED' &&
        (c.createdById === p.user.id || (staff && can(p.user.role, 'case:assign'))),
    },
  };
}

/** Пълният тикет (GET /tickets/:id): живото обобщение по аудиториите на читателя + история. */
export async function ticketDetail(db: PrismaClient, p: Principal, t: Ticket, c: Case) {
  const [summary, handoffs, requests, events] = await Promise.all([
    buildTicketSummary(db, c, caseAudiences(p.user.role, c.portal)),
    db.caseHandoff.findMany({
      where: { ticketId: t.id },
      orderBy: { createdAt: 'asc' },
      take: 100,
    }),
    db.ticketInfoRequest.findMany({
      where: { ticketId: t.id },
      orderBy: { createdAt: 'asc' },
      take: 100,
    }),
    db.ticketEvent.findMany({ where: { ticketId: t.id }, orderBy: { at: 'asc' }, take: 500 }),
  ]);
  const map = await people(db, c.tenantId, [
    t.ownerId,
    t.createdById,
    ...handoffs.map((h) => h.fromUserId),
    ...requests.map((r) => r.requestedById),
    ...events.map((e) => e.actorId),
  ]);
  return {
    ...ticketCore(t),
    caseId: c.id,
    caseNumber: c.number,
    owner: view(p.user, map, t.ownerId),
    createdBy: view(p.user, map, t.createdById),
    reason: t.reason,
    summary,
    // Резюмето в момента на предаването е сглобено с аудиториите на ПРЕДАЛИЯ — пази се за историята
    // (и за outbox към helpdesk), а читателят получава живото `summary` по СВОИТЕ аудитории.
    handoffs: handoffs.map((h) => ({
      ...handoffView(p.user, map, h),
      hasSummary: h.summary !== null,
    })),
    infoRequests: requests.map((r) => ({
      id: r.id,
      items: r.items,
      note: r.note,
      requestedAt: r.createdAt,
      answeredAt: r.answeredAt,
      requestedBy: view(p.user, map, r.requestedById),
    })),
    events: events.map((e) => ({
      type: e.type,
      from: e.fromStatus,
      to: e.toStatus,
      at: e.at,
      actor: view(p.user, map, e.actorId),
    })),
  };
}
