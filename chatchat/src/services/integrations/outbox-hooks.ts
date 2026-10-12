import { Prisma, type PrismaClient } from '@prisma/client';
import type { Outcome } from './deliver.js';

/**
 * Куките за наблюдаемост на изпращача към helpdesk (като `QueueHooks.onResult` на опашките):
 * изпращачът само съобщава ИЗХОДА като затворен код и периодично СНИМКАТА на outbox-а; как се
 * превръщат в метрики решава observability/helpdesk.ts. Без куки (тестове, CLI) — нищо не се пита и
 * нищо не се брои. Никога tenantId, id на тикет/доставка или текст — само кодове и агрегати.
 */

/** Изходът на един опит — затвореното множество за етикета `result`. */
export const OUTBOX_RESULTS = [
  'delivered',
  'skipped',
  'retry',
  'dead',
  'ssrf_blocked',
  'unrecorded',
] as const;
export type OutboxResult = (typeof OUTBOX_RESULTS)[number];

/**
 * Изходът → код: SSRF отказът е отделен (сигнал за сигурност — адресът на конектора сочи вътрешна
 * мрежа или DNS rebinding), иначе е dead-letter като всяка окончателна грешка.
 */
export function outboxResult(o: Outcome): OutboxResult {
  switch (o.status) {
    case 'DELIVERED':
      return 'delivered';
    case 'SKIPPED':
      return 'skipped';
    case 'RETRY':
      return 'retry';
    case 'DEAD':
      return o.code === 'ssrf_blocked' ? 'ssrf_blocked' : 'dead';
  }
}

/** Снимката на outbox-а по всички клиенти (агрегат, без разбивка). */
export interface OutboxSnapshot {
  pending: number;
  sending: number;
  /** DEAD на ВКЛЮЧЕН конектор — само те могат да се пуснат отново („Пусни отново“). */
  dead: number;
  /**
   * Създаването на най-старата недоставена доставка, която изпращачът МОЖЕ да вземе — без редовете
   * зад dead-letter на същия тикет (те чакат човек, не изпращача: това е отделна аларма).
   */
  oldestPendingAt: Date | null;
}

export interface OutboxHooks {
  onResult?(result: OutboxResult): void;
  onSnapshot?(snapshot: OutboxSnapshot): void;
}

interface SnapshotRow {
  pending: number;
  sending: number;
  dead: number;
  oldest: number | null;
}

/**
 * ЕДНА агрегатна заявка (индексите: `status, notBefore` и уникалният `ticketId, seq`). Времето е
 * Unix секунди от базата — `timestamp` без зона е в UTC (Prisma), EXTRACT го чете като UTC.
 */
export async function outboxSnapshot(db: PrismaClient): Promise<OutboxSnapshot> {
  const rows = await db.$queryRaw<SnapshotRow[]>(Prisma.sql`
    SELECT count(*) FILTER (WHERE d."status" = 'PENDING')::int AS "pending",
           count(*) FILTER (WHERE d."status" = 'SENDING')::int AS "sending",
           count(*) FILTER (WHERE d."status" = 'DEAD' AND i."enabled")::int AS "dead",
           EXTRACT(EPOCH FROM min(d."createdAt") FILTER (
             WHERE d."status" IN ('PENDING', 'SENDING') AND NOT EXISTS (
               SELECT 1 FROM "HelpdeskDelivery" p
                WHERE p."ticketId" = d."ticketId" AND p."seq" < d."seq" AND p."status" = 'DEAD')
           ))::float8 AS "oldest"
      FROM "HelpdeskDelivery" d
      JOIN "HelpdeskIntegration" i ON i."id" = d."integrationId"
     WHERE d."status" IN ('PENDING', 'SENDING', 'DEAD')`);
  const r = rows[0];
  return {
    pending: r?.pending ?? 0,
    sending: r?.sending ?? 0,
    dead: r?.dead ?? 0,
    oldestPendingAt: typeof r?.oldest === 'number' ? new Date(r.oldest * 1000) : null,
  };
}
