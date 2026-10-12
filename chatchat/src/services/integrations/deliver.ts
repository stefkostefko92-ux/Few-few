import type { PrismaClient, TicketEvent } from '@prisma/client';
import { TICKET_EVENT_TYPES, type TicketEventType } from '../tickets/events.js';
import { deliverWith } from './connectors/index.js';
import type { DeliveryEvent, ExternalLink } from './connectors/types.js';
import { loadConnector, type IntegrationDeps } from './deps.js';
import { createHttpClient } from './http.js';
import { buildExternalTicket } from './payload.js';

/**
 * Една доставка: всичко се чете В МОМЕНТА на изпращане — конекторът още е включен и е същият,
 * тайните се отварят само в паметта, тикетът се сглобява минимизиран (payload.ts). Резултатът е
 * код — никога текст от отсрещната страна.
 */

export interface ClaimedDelivery {
  id: string;
  tenantId: string;
  integrationId: string;
  ticketId: string;
  eventId: string;
  eventType: string;
  seq: number;
  attempts: number;
}

export type Outcome =
  | { status: 'DELIVERED'; link?: ExternalLink; note?: string }
  | { status: 'SKIPPED'; code: string }
  | { status: 'RETRY'; code: string; retryAfterMs?: number }
  | { status: 'DEAD'; code: string };

const isEventType = (t: string): t is TicketEventType =>
  (TICKET_EVENT_TYPES as readonly string[]).includes(t);

/** „Възложен на роля“: за поемане — ролята на поелия; за назначаване — записаната в събитието. */
async function assigneeRoleOf(db: PrismaClient, e: TicketEvent): Promise<string | null> {
  if (e.type === 'ticket.assigned') {
    const p = e.payload;
    const role = typeof p === 'object' && p !== null && !Array.isArray(p) ? p.toRole : null;
    return typeof role === 'string' ? role : null;
  }
  if (e.type === 'ticket.claimed' && e.actorId) {
    const u = await db.user.findFirst({
      where: { id: e.actorId, tenantId: e.tenantId },
      select: { role: true },
    });
    return u?.role ?? null;
  }
  return null;
}

export async function deliverOne(
  db: PrismaClient,
  deps: IntegrationDeps,
  row: ClaimedDelivery,
): Promise<Outcome> {
  const integration = await db.helpdeskIntegration.findUnique({ where: { id: row.integrationId } });
  if (!integration || !integration.enabled || integration.tenantId !== row.tenantId) {
    return { status: 'SKIPPED', code: 'disabled' };
  }
  const loaded = loadConnector(deps, integration);
  if ('error' in loaded) return { status: 'DEAD', code: loaded.error };
  const event = await db.ticketEvent.findUnique({ where: { id: row.eventId } });
  if (!event || event.tenantId !== row.tenantId) return { status: 'SKIPPED', code: 'event_gone' };
  if (!isEventType(event.type)) return { status: 'SKIPPED', code: 'unknown_event' };
  const ticket = await buildExternalTicket(db, row.ticketId, deps.baseUrl);
  if (!ticket) return { status: 'SKIPPED', code: 'ticket_gone' };
  const link = await db.helpdeskLink.findUnique({ where: { ticketId: row.ticketId } });
  const current = link && link.integrationId === integration.id ? link : null;
  const deliveryEvent: DeliveryEvent = {
    id: event.id,
    type: event.type,
    at: event.at,
    from: event.fromStatus,
    to: event.toStatus,
    queue: ticket.ticket.queue,
    assigneeRole: await assigneeRoleOf(db, event),
  };
  const result = await deliverWith(
    loaded.parsed,
    {
      http: createHttpClient(deps.net),
      secrets: loaded.secrets,
      deliveryId: row.id,
      attempt: row.attempts,
      event: deliveryEvent,
      ticket,
      link: current ? { externalId: current.externalId, externalKey: current.externalKey } : null,
    },
    deps.zendeskOrigin,
  );
  if (result.ok) {
    return {
      status: 'DELIVERED',
      ...(result.link ? { link: result.link } : {}),
      ...(result.skipped ? { note: result.skipped } : {}),
    };
  }
  if (!result.retry) return { status: 'DEAD', code: result.code };
  return {
    status: 'RETRY',
    code: result.code,
    ...(result.retryAfterMs ? { retryAfterMs: result.retryAfterMs } : {}),
  };
}
