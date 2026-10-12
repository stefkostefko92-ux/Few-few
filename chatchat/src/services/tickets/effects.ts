import type { CaseStatus, Role, TicketQueue, TicketStatus } from '@prisma/client';
import { assigneeFor, type MessageAuthor } from '../case-views.js';
import { notify, type NotificationEvent, type NotificationInput } from '../collab/notify.js';
import type { CollabDeps } from '../collab/publish.js';
import type { TicketEventType } from './events.js';
import { publishCaseEvent, publishQueueEvent } from './realtime.js';

/**
 * Последиците СЛЕД commit на промяна по тикета: известие до създателя (и до когото още засяга) и
 * събития в реално време. Порталният получател вижда РОЛЯТА на отговорника, не името
 * (`assigneeFor`). Известието е вторично — грешка тук не връща промяната (тя вече е записана).
 */

export interface FlowCase {
  id: string;
  number: string;
  tenantId: string;
  createdById: string;
  assignedToId: string | null;
  status: CaseStatus;
  aiPaused: boolean;
}

export interface FlowTicket {
  id: string;
  number: string;
  status: TicketStatus;
  queue: TicketQueue;
  ownerId: string | null;
}

export interface TicketChange {
  kind: TicketEventType;
  c: FlowCase;
  ticket: FlowTicket;
  actorId: string;
  previousOwnerId?: string | null;
}

/** Ролите на опашката — кой научава за предаване без отговорник. */
const QUEUE_ROLES: Record<TicketQueue, Role[]> = {
  SUPPORT: ['SUPPORT'],
  ENGINEERING: ['ENGINEERING'],
};

const MAX_FANOUT = 200;

async function people(deps: CollabDeps, tenantId: string, ids: string[]) {
  if (ids.length === 0) return new Map<string, MessageAuthor>();
  const rows = await deps.db.user.findMany({
    where: { id: { in: ids }, tenantId },
    select: { id: true, name: true, role: true, kind: true },
  });
  return new Map(rows.map((u) => [u.id, u]));
}

async function queueStaff(deps: CollabDeps, tenantId: string, queue: TicketQueue) {
  const rows = await deps.db.user.findMany({
    where: { tenantId, active: true, kind: 'INTERNAL', role: { in: QUEUE_ROLES[queue] } },
    select: { id: true },
    take: MAX_FANOUT,
  });
  return rows.map((r) => r.id);
}

/** Кой какво известие получава за промяната (без автора ѝ). */
async function recipients(
  deps: CollabDeps,
  ch: TicketChange,
): Promise<Array<{ userId: string; eventType: NotificationEvent }>> {
  const { c, ticket } = ch;
  const out: Array<{ userId: string; eventType: NotificationEvent }> = [];
  const add = (userId: string | null | undefined, eventType: NotificationEvent) => {
    if (!userId || userId === ch.actorId || out.some((o) => o.userId === userId)) return;
    out.push({ userId, eventType });
  };
  switch (ch.kind) {
    case 'ticket.assigned':
      add(ticket.ownerId, 'ticket.assigned');
      add(c.createdById, 'ticket.changed');
      add(ch.previousOwnerId, 'ticket.changed');
      break;
    case 'ticket.info_requested':
      add(c.createdById, 'ticket.info_requested');
      break;
    case 'ticket.info_provided':
      add(ticket.ownerId, 'ticket.info_provided');
      break;
    case 'handoff.to_operator':
      if (ticket.ownerId) add(ticket.ownerId, 'handoff.requested');
      else {
        for (const id of await queueStaff(deps, c.tenantId, ticket.queue)) {
          add(id, 'handoff.requested');
        }
      }
      break;
    case 'handoff.to_engineering':
      for (const id of await queueStaff(deps, c.tenantId, 'ENGINEERING')) {
        add(id, 'ticket.escalated');
      }
      add(c.createdById, 'ticket.changed');
      add(ch.previousOwnerId, 'ticket.changed');
      break;
    case 'handoff.to_ai':
      add(c.createdById, 'handoff.to_ai');
      break;
    default:
      // created, claimed, closed, reopened — създателят и отговорникът.
      add(c.createdById, 'ticket.changed');
      add(ticket.ownerId, 'ticket.changed');
      add(ch.previousOwnerId, 'ticket.changed');
  }
  return out;
}

export async function afterTicketChange(deps: CollabDeps, ch: TicketChange): Promise<void> {
  const { c, ticket } = ch;
  const targets = await recipients(deps, ch);
  const ids = [...new Set([...targets.map((t) => t.userId), ticket.ownerId ?? ''])].filter(Boolean);
  const users = await people(deps, c.tenantId, ids);
  const owner = ticket.ownerId ? users.get(ticket.ownerId) : undefined;
  const items: NotificationInput[] = [];
  for (const t of targets) {
    const reader = users.get(t.userId);
    if (!reader) continue;
    const handoff = t.eventType === 'handoff.requested' || t.eventType === 'handoff.to_ai';
    items.push({
      tenantId: c.tenantId,
      userId: t.userId,
      eventType: t.eventType,
      objectType: 'ticket',
      objectId: ticket.id,
      payload: {
        caseId: c.id,
        caseNumber: c.number,
        // В текста на известието: номерът на случая за предаване, на тикета — за останалото.
        number: handoff ? c.number : ticket.number,
        ticketNumber: ticket.number,
        status: ticket.status,
        queue: ticket.queue,
        change: ch.kind,
        assignedTo: owner ? assigneeFor(reader, owner) : null,
      },
    });
  }
  await notify(deps, items, ch.actorId);
  publishCaseEvent(
    deps,
    'case.updated',
    { caseId: c.id, tenantId: c.tenantId },
    ch.actorId,
    (v) => ({
      caseId: c.id,
      status: c.status,
      aiPaused: c.aiPaused,
      ticket: {
        id: ticket.id,
        number: ticket.number,
        status: ticket.status,
        queue: ticket.queue,
        owner: owner ? assigneeFor(v, owner) : null,
      },
      change: ch.kind,
    }),
  );
  publishQueueEvent(deps, c.tenantId, ch.actorId, {
    ticketId: ticket.id,
    caseId: c.id,
    status: ticket.status,
    queue: ticket.queue,
  });
}
