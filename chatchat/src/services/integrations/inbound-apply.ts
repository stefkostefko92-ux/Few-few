import type { HelpdeskKind, Prisma, Ticket } from '@prisma/client';
import type { CollabDeps } from '../collab/publish.js';
import { lockKey } from '../steps/locate.js';
import { afterTicketChange } from '../tickets/effects.js';
import { recordTicketEvent } from '../tickets/events.js';
import { caseStatusFor } from '../tickets/flow.js';
import { changeOf, type Applied } from '../tickets/tx.js';
import { inboundTransition, type InboundAction } from './status-map.js';

/**
 * Обратната синхронизация (helpdesk → ChatChat): само „затвори“ и „отвори наново“, през машината
 * на преходите (`inboundTransition` → `nextTicketStatus`), с тикета заключен като при всяко друго
 * действие. Отпечатъците на известието се записват в СЪЩАТА транзакция: повтор = „duplicate“, без
 * втора промяна; грешка по средата не оставя отпечатък (helpdesk-ът може да опита пак). Промяната
 * минава през `recordTicketEvent` с източник EXTERNAL (хронология, одит, без ехо към helpdesk-а).
 */

export interface InboundRef {
  /** id в helpdesk-а (Zendesk ticket id, JSM issueId, id от получателя на общия webhook). */
  externalId?: string;
  /** Ключът (JSM „HELPDESK-1“). */
  externalKey?: string;
  /** Номерът на тикета в ChatChat (Zendesk external_id, общият webhook). */
  number?: string;
}

export type InboundResult =
  | { result: 'applied'; to: string }
  | { result: 'ignored'; reason: string }
  | { result: 'duplicate' };

export const EXTERNAL_ACTOR = 'external';

async function findTicket(
  tx: Prisma.TransactionClient,
  integration: { id: string; tenantId: string },
  ref: InboundRef,
): Promise<Ticket | null> {
  const ors: Prisma.HelpdeskLinkWhereInput[] = [];
  if (ref.externalId) ors.push({ externalId: ref.externalId });
  if (ref.externalKey) ors.push({ externalKey: ref.externalKey });
  if (ors.length > 0) {
    const link = await tx.helpdeskLink.findFirst({
      where: { integrationId: integration.id, OR: ors },
      select: { ticketId: true },
    });
    if (link) return tx.ticket.findUnique({ where: { id: link.ticketId } });
  }
  if (!ref.number) return null;
  return tx.ticket.findFirst({
    where: { number: ref.number, case: { tenantId: integration.tenantId } },
  });
}

async function applyTx(
  tx: Prisma.TransactionClient,
  integration: { id: string; tenantId: string; kind: HelpdeskKind },
  input: { nonces: string[]; ref: InboundRef; action: InboundAction | null },
): Promise<{ out: InboundResult; applied?: Applied }> {
  // Повторение = поне един отпечатък (подпис или id на доставката) вече е виждан.
  const receipt = await tx.helpdeskInboundReceipt.createMany({
    data: input.nonces.map((nonce) => ({ integrationId: integration.id, nonce })),
    skipDuplicates: true,
  });
  if (receipt.count < input.nonces.length) return { out: { result: 'duplicate' } };
  if (!input.action) return { out: { result: 'ignored', reason: 'unmapped_status' } };
  const found = await findTicket(tx, integration, input.ref);
  if (!found) return { out: { result: 'ignored', reason: 'unknown_ticket' } };
  await lockKey(tx, `ticket|${found.id}`);
  const t = await tx.ticket.findUniqueOrThrow({ where: { id: found.id } });
  const c = await tx.case.findUniqueOrThrow({ where: { id: t.caseId } });
  if (c.tenantId !== integration.tenantId) {
    return { out: { result: 'ignored', reason: 'unknown_ticket' } };
  }
  const step = inboundTransition(input.action, t.status, t.ownerId !== null);
  if (!step.apply) return { out: { result: 'ignored', reason: step.reason } };
  const now = new Date();
  const closing = input.action === 'close';
  const ticket = await tx.ticket.update({
    where: { id: t.id },
    data: closing
      ? {
          status: step.to,
          resolution: { rootCause: null, solution: null, sources: [], via: 'external' },
          closedAt: now,
          closedById: null,
        }
      : { status: step.to, closedAt: null, closedById: null },
  });
  const updated = await tx.case.update({
    where: { id: c.id },
    data: closing
      ? { status: 'RESOLVED', outcome: 'RESOLVED', closedAt: now, aiPaused: false }
      : {
          status: caseStatusFor(step.to),
          outcome: 'ESCALATED',
          closedAt: null,
          assignedToId: t.ownerId,
        },
  });
  const type = closing ? ('ticket.closed' as const) : ('ticket.reopened' as const);
  await recordTicketEvent(tx, {
    tenantId: c.tenantId,
    ticket,
    type,
    actorId: null,
    from: t.status,
    to: step.to,
    detail: { via: 'external', helpdesk: integration.kind },
    source: 'EXTERNAL',
  });
  return {
    out: { result: 'applied', to: step.to },
    applied: { kind: type, ticket, c: updated, previousOwnerId: t.ownerId },
  };
}

export async function applyInbound(
  deps: CollabDeps,
  integration: { id: string; tenantId: string; kind: HelpdeskKind },
  input: { nonces: string[]; ref: InboundRef; action: InboundAction | null },
): Promise<InboundResult> {
  const { out, applied } = await deps.db.$transaction((tx) => applyTx(tx, integration, input));
  // Известия и реално време — след commit, като при всяко друго действие по тикета.
  if (applied) await afterTicketChange(deps, changeOf(applied, EXTERNAL_ACTOR));
  return out;
}
