import type { HelpdeskDeliveryStatus, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { appendAudit } from '../../audit.js';
import type { Principal } from '../../auth/sessions.js';
import type { AdminResult } from './admin-config.js';

/**
 * Дневникът на доставките за администратора на клиента: статус, опити, последна грешка (КОД — без
 * тайни и без текст от отсрещната страна), номер на тикета, кога. „Блокиран“ = чака по-ранно
 * недоставено събитие на същия тикет (подредбата). Повторно пускане — само от dead-letter, с одит.
 */

export const DELIVERY_STATUSES = [
  'PENDING',
  'SENDING',
  'DELIVERED',
  'SKIPPED',
  'DEAD',
] as const satisfies readonly HelpdeskDeliveryStatus[];

export const LogQuery = z.object({
  status: z.enum(DELIVERY_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  /** Курсор: id на последния ред от предишната страница. */
  after: z.string().trim().min(1).max(40).optional(),
});
export type LogQueryInput = z.infer<typeof LogQuery>;

export async function listDeliveries(db: PrismaClient, tenantId: string, q: LogQueryInput) {
  const rows = await db.helpdeskDelivery.findMany({
    where: { tenantId, ...(q.status ? { status: q.status } : {}) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: q.limit + 1,
    ...(q.after ? { cursor: { id: q.after }, skip: 1 } : {}),
    select: {
      id: true,
      ticketId: true,
      eventType: true,
      seq: true,
      status: true,
      attempts: true,
      lastError: true,
      notBefore: true,
      deliveredAt: true,
      createdAt: true,
      updatedAt: true,
      ticket: { select: { number: true } },
    },
  });
  const page = rows.slice(0, q.limit);
  const ticketIds = [...new Set(page.filter((r) => r.status === 'PENDING').map((r) => r.ticketId))];
  const heads =
    ticketIds.length === 0
      ? []
      : await db.helpdeskDelivery.groupBy({
          by: ['ticketId'],
          where: { ticketId: { in: ticketIds }, status: { in: ['PENDING', 'SENDING', 'DEAD'] } },
          _min: { seq: true },
        });
  const head = new Map(heads.map((h) => [h.ticketId, h._min.seq ?? 0]));
  const counts = await db.helpdeskDelivery.groupBy({
    by: ['status'],
    where: { tenantId },
    _count: { _all: true },
  });
  return {
    items: page.map((r) => ({
      id: r.id,
      ticketNumber: r.ticket.number,
      eventType: r.eventType,
      status: r.status,
      attempts: r.attempts,
      lastError: r.lastError,
      notBefore: r.notBefore,
      deliveredAt: r.deliveredAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      blocked: r.status === 'PENDING' && (head.get(r.ticketId) ?? r.seq) < r.seq,
    })),
    nextCursor: rows.length > q.limit ? (page.at(-1)?.id ?? null) : null,
    counts: Object.fromEntries(
      DELIVERY_STATUSES.map((s) => [s, counts.find((c) => c.status === s)?._count._all ?? 0]),
    ),
  };
}

/** Повторно пускане от dead-letter: опитите от нула, веднага; следващите събития на тикета тръгват след него. */
export async function replayDelivery(
  db: PrismaClient,
  p: Principal,
  id: string,
): Promise<AdminResult<{ id: string; status: 'PENDING' }>> {
  const row = await db.helpdeskDelivery.findFirst({
    where: { id, tenantId: p.user.tenantId },
    include: { integration: { select: { enabled: true } } },
  });
  if (!row) return { ok: false, status: 404, code: 'not_found' };
  if (row.status !== 'DEAD') return { ok: false, status: 409, code: 'not_dead' };
  if (!row.integration.enabled) return { ok: false, status: 409, code: 'integration_disabled' };
  const done = await db.$transaction(async (tx) => {
    const updated = await tx.helpdeskDelivery.updateMany({
      where: { id: row.id, status: 'DEAD' },
      data: { status: 'PENDING', attempts: 0, notBefore: new Date(), lockedUntil: null },
    });
    if (updated.count === 0) return false;
    await appendAudit(tx, {
      tenantId: row.tenantId,
      actorId: p.user.id,
      action: 'integration.delivery.replay',
      objectType: 'helpdesk_delivery',
      objectId: row.id,
      detail: {
        ticketId: row.ticketId,
        eventType: row.eventType,
        attempts: row.attempts,
        lastError: row.lastError,
      },
    });
    return true;
  });
  if (!done) return { ok: false, status: 409, code: 'not_dead' };
  return { ok: true, value: { id: row.id, status: 'PENDING' } };
}
