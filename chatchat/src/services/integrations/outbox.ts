import { Prisma, type PrismaClient } from '@prisma/client';
import type { IntegrationDeps } from './deps.js';
import { deliverOne, type ClaimedDelivery, type Outcome } from './deliver.js';

/**
 * Изпращачът на outbox-а към helpdesk (асинхронно, без Redis — като имейлите): взима зрелите
 * редове с `FOR UPDATE SKIP LOCKED` (два процеса не взимат един ред), наема ги за 2 мин. (срив по
 * средата → редът се взима отново), праща и записва изхода. ПОДРЕДБА ПО ТИКЕТ: ред се взима само
 * ако няма по-ранен (по `seq`) недоставен ред на същия тикет — чакащ, в полет или в dead-letter;
 * затова събитие N+1 никога не изпреварва N, а dead-letter спира тикета до повторното пускане.
 * Повтор: експоненциален отстъп (1, 2, 4… мин., най-много 1 ч., с ±10 % разсейване; Retry-After на
 * отсрещната страна се уважава), след `maxAttempts` → DEAD. В лога — само id, вид и код.
 */

export interface OutboxDeps {
  db: PrismaClient;
  integrations: IntegrationDeps;
  logger: { info: (o: object, m: string) => void; warn: (o: object, m: string) => void };
}

const LEASE_MS = 2 * 60 * 1000;
const MAX_BACKOFF_MS = 60 * 60 * 1000;
const utc = (d: Date) => Prisma.sql`(${d}::timestamptz AT TIME ZONE 'UTC')`;

/** Повтор след 1, 2, 4… минути (най-много час), с разсейване ±10 %. */
export function deliveryBackoffMs(attempt: number, random = Math.random()): number {
  const base = Math.min(60_000 * 2 ** Math.max(0, attempt - 1), MAX_BACKOFF_MS);
  return Math.round(base * (0.9 + 0.2 * random));
}

async function claim(db: PrismaClient, now: Date, limit: number): Promise<ClaimedDelivery[]> {
  return db.$queryRaw<ClaimedDelivery[]>`
    UPDATE "HelpdeskDelivery" SET "status" = 'SENDING', "attempts" = "attempts" + 1,
           "lockedUntil" = ${utc(new Date(now.getTime() + LEASE_MS))}, "updatedAt" = ${utc(now)}
     WHERE "id" IN (
       SELECT d."id" FROM "HelpdeskDelivery" d
        WHERE ((d."status" = 'PENDING' AND d."notBefore" <= ${utc(now)})
            OR (d."status" = 'SENDING' AND d."lockedUntil" < ${utc(now)}))
          AND NOT EXISTS (
            SELECT 1 FROM "HelpdeskDelivery" p
             WHERE p."ticketId" = d."ticketId" AND p."seq" < d."seq"
               AND p."status" IN ('PENDING', 'SENDING', 'DEAD'))
        ORDER BY d."notBefore" ASC, d."seq" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED)
    RETURNING "id", "tenantId", "integrationId", "ticketId", "eventId", "eventType", "seq", "attempts"`;
}

/**
 * Записва изхода — само ако редът още е нашият (същият опит в полет): изтекъл наем, взет от друг
 * процес, не се презаписва. Новата връзка с външния запис — в същата транзакция.
 */
async function finish(
  db: PrismaClient,
  row: ClaimedDelivery,
  o: Outcome,
  now: Date,
): Promise<void> {
  const data =
    o.status === 'DELIVERED'
      ? { status: 'DELIVERED' as const, deliveredAt: now, lastError: null, lockedUntil: null }
      : o.status === 'SKIPPED'
        ? { status: 'SKIPPED' as const, lastError: o.code, lockedUntil: null }
        : o.status === 'RETRY'
          ? {
              status: 'PENDING' as const,
              lastError: o.code,
              lockedUntil: null,
              notBefore: new Date(
                now.getTime() +
                  Math.min(
                    Math.max(deliveryBackoffMs(row.attempts), o.retryAfterMs ?? 0),
                    MAX_BACKOFF_MS,
                  ),
              ),
            }
          : { status: 'DEAD' as const, lastError: o.code, lockedUntil: null };
  await db.$transaction(async (tx) => {
    const updated = await tx.helpdeskDelivery.updateMany({
      where: { id: row.id, status: 'SENDING', attempts: row.attempts },
      data,
    });
    if (updated.count === 0 || o.status !== 'DELIVERED' || !o.link) return;
    // Друг тикет със същия външен id (получател, върнал един и същ id) — връзката не се пише.
    await tx.helpdeskLink.createMany({
      data: [
        {
          ticketId: row.ticketId,
          integrationId: row.integrationId,
          externalId: o.link.externalId.slice(0, 200),
          externalKey: o.link.externalKey?.slice(0, 200) ?? null,
        },
      ],
      skipDuplicates: true,
    });
  });
}

export interface DeliveryReport {
  claimed: number;
  delivered: number;
  skipped: number;
  retried: number;
  dead: number;
}

export async function processDeliveries(
  deps: OutboxDeps,
  now = new Date(),
  limit = 20,
): Promise<DeliveryReport> {
  const rows = await claim(deps.db, now, limit);
  const report: DeliveryReport = {
    claimed: rows.length,
    delivered: 0,
    skipped: 0,
    retried: 0,
    dead: 0,
  };
  for (const row of rows) {
    let outcome: Outcome;
    try {
      outcome = await deliverOne(deps.db, deps.integrations, row);
    } catch (err) {
      outcome = { status: 'RETRY', code: err instanceof Error ? 'error' : 'unknown' };
    }
    if (outcome.status === 'RETRY' && row.attempts >= deps.integrations.maxAttempts) {
      outcome = { status: 'DEAD', code: outcome.code };
    }
    try {
      await finish(deps.db, row, outcome, now);
    } catch (err) {
      // Тикетът е изтрит междувременно (ретенция) — редът си отива с него.
      deps.logger.warn(
        { deliveryId: row.id, errName: err instanceof Error ? err.name : 'unknown' },
        'изходът на доставката не е записан',
      );
      continue;
    }
    if (outcome.status === 'DELIVERED') report.delivered += 1;
    else if (outcome.status === 'SKIPPED') report.skipped += 1;
    else if (outcome.status === 'RETRY') report.retried += 1;
    else report.dead += 1;
    if (outcome.status === 'RETRY' || outcome.status === 'DEAD') {
      deps.logger.warn(
        {
          deliveryId: row.id,
          event: row.eventType,
          code: outcome.code,
          attempts: row.attempts,
          dead: outcome.status === 'DEAD',
        },
        'доставката към helpdesk не мина',
      );
    }
  }
  return report;
}
