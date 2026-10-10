import type { Prisma, TicketEventSource, TicketStatus } from '@prisma/client';
import { appendAudit } from '../../audit.js';
import { addTimeline } from '../cases.js';
import { enqueueHelpdeskDelivery } from '../integrations/enqueue.js';

/**
 * ЕДИНСТВЕНАТА точка за промяна по тикет (FR-09, FR-19): всяка промяна вика `recordTicketEvent`
 * В СВОЯТА транзакция — ред в дневника на тикета (`TicketEvent`), събитие в хронологията на
 * случая (AC-19), звено в одитната верига и — при включен конектор на клиента — доставка в
 * outbox-а към helpdesk (`services/integrations/enqueue.ts`, §14.4). Промяна, дошла от
 * helpdesk-а, е с източник `EXTERNAL` и не се връща обратно към него.
 *
 * В `detail` — САМО идентификатори, кодове и броячи: влиза в хронологията, която вижда и
 * порталът. Свободен текст (причини) — само в `auditOnly`, маскиран, и само в одита.
 */

export const TICKET_EVENT_TYPES = [
  'ticket.created',
  'ticket.claimed',
  'ticket.assigned',
  'ticket.info_requested',
  'ticket.info_provided',
  'ticket.closed',
  'ticket.reopened',
  'handoff.to_operator',
  'handoff.to_engineering',
  'handoff.to_ai',
] as const;
export type TicketEventType = (typeof TICKET_EVENT_TYPES)[number];

/** Действието в одита — „ticket.create“ е запазеното име отпреди работния поток. */
const AUDIT_ACTION: Record<TicketEventType, string> = {
  'ticket.created': 'ticket.create',
  'ticket.claimed': 'ticket.claim',
  'ticket.assigned': 'ticket.assign',
  'ticket.info_requested': 'ticket.info.request',
  'ticket.info_provided': 'ticket.info.provide',
  'ticket.closed': 'ticket.close',
  'ticket.reopened': 'ticket.reopen',
  'handoff.to_operator': 'handoff.to_operator',
  'handoff.to_engineering': 'handoff.to_engineering',
  'handoff.to_ai': 'handoff.to_ai',
};

export type EventDetail = Record<string, string | number | boolean | null>;

export interface TicketEventInput {
  tenantId: string;
  ticket: { id: string; caseId: string };
  type: TicketEventType;
  actorId: string | null;
  from?: TicketStatus | null;
  to?: TicketStatus | null;
  detail?: EventDetail;
  /** Само за одита: маскирана причина и други метаданни за персонала. */
  auditOnly?: Record<string, unknown>;
  /** Откъде е промяната; по подразбиране ChatChat (`APP`), обратната синхронизация — `EXTERNAL`. */
  source?: TicketEventSource;
}

export async function recordTicketEvent(
  tx: Prisma.TransactionClient,
  e: TicketEventInput,
): Promise<void> {
  const statuses = {
    ...(e.from !== undefined ? { from: e.from } : {}),
    ...(e.to !== undefined ? { to: e.to } : {}),
  };
  const payload = { ticketId: e.ticket.id, ...statuses, ...(e.detail ?? {}) };
  const source = e.source ?? 'APP';
  const event = await tx.ticketEvent.create({
    data: {
      tenantId: e.tenantId,
      ticketId: e.ticket.id,
      caseId: e.ticket.caseId,
      type: e.type,
      actorId: e.actorId,
      fromStatus: e.from ?? null,
      toStatus: e.to ?? null,
      payload: payload as Prisma.InputJsonValue,
      source,
    },
    select: { id: true },
  });
  await addTimeline(tx, e.ticket.caseId, e.type, e.actorId, payload);
  await appendAudit(tx, {
    tenantId: e.tenantId,
    actorId: e.actorId,
    action: AUDIT_ACTION[e.type],
    objectType: 'ticket',
    objectId: e.ticket.id,
    detail: { caseId: e.ticket.caseId, ...statuses, ...(e.detail ?? {}), ...(e.auditOnly ?? {}) },
  });
  // Последно — след ключа на одита (виж enqueue.ts за реда на заключванията).
  await enqueueHelpdeskDelivery(tx, {
    tenantId: e.tenantId,
    ticketId: e.ticket.id,
    eventId: event.id,
    type: e.type,
    source,
  });
}
