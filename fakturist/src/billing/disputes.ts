import { audit } from '../audit.js';
import { prisma } from '../db.js';
import { errorMessage, logger } from '../logger.js';
import { kickOutbox } from '../mail/outbox.js';
import { DAY } from '../time.js';
import { isNew, type DisputeSnapshot, type DisputeState } from './dispute-core.js';
import {
  RevolutError,
  retrieveRevolutDispute,
  type FetchLike,
  type RevolutDispute,
} from './revolut-client.js';

/**
 * Споровете за плащане с карта (chargeback; по модела на rilievi `contestazioni.ts`): известието `DISPUTE_*`
 * носи само id-то, затова спорът се чете от Revolut (`GET /api/disputes/{id}` — кое е вярно решава Revolut,
 * не известието), връзва се с плащането по `payment.order_id` (→ фирмата и планът), записва се в одита
 * (`billing.payment.disputed`, целта е спорът) и всеки активен мастър получава писмо със срока за отговор.
 * Отговаря се в Revolut Business. НИЩО не се решава автоматично: изгубен спор не пипа нито плащането, нито
 * абонамента — решава човек. Без нова таблица: последното състояние е последният запис в одита за спора.
 *
 * Повторна доставка или две известия наведнъж не дават втори запис и второ писмо за същото състояние и
 * срок (заключване по спора + `isNew` в dispute-core.ts). Ако спорът не се прочете, мастърът научава веднага
 * (веднъж за вид известие, „проверете сега в Revolut Business“), грешката продължава нагоре — webhook-ът
 * връща 4XX и Revolut праща пак (3 пъти през 10 мин) — а след това `recheckUnreadDisputes` (на 10 мин, loop.ts)
 * чете наново всеки спор, чийто последен запис е „не се прочете“.
 */
export const DISPUTE_AUDIT_ACTION = 'billing.payment.disputed';

/** Отделно пространство за заключванията по спор (двуаргументната форма — не се засича с одита). */
const DISPUTE_LOCK = 4_340_031;

export type { DisputeState };

/** Данните на писмото до мастъра — идентификатори и суми, без лични данни. */
export interface DisputeNotice {
  disputeId: string;
  event: string;
  state: DisputeState;
  substate: string | null;
  amountCents: number | null;
  currency: string | null;
  responseDueAt: string | null;
  organizationId: string | null;
  paymentId: string | null;
  planCode: string | null;
}

const isoOrNull = (value: string | undefined): string | null => {
  if (!value) return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
};

/** Без управляващи знаци — текстът е от външна система. */
const clean = (value: string | undefined): string | null =>
  value ? value.replace(/\p{Cc}+/gu, ' ').slice(0, 40) : null;

function snapshotOf(d: RevolutDispute): DisputeSnapshot {
  return {
    state: d.state,
    substate: clean(d.substate),
    responseDueAt: isoOrNull(d.response_due_date),
    updatedAt: isoOrNull(d.updated_at),
    amountCents: d.amount ?? null,
    currency: d.currency?.toUpperCase() ?? null,
    reasonCode: clean(d.reason_code),
    orderId: d.payment?.order_id ?? null,
  };
}

const UNREAD: Omit<DisputeSnapshot, 'state'> = {
  substate: null,
  responseDueAt: null,
  updatedAt: null,
  amountCents: null,
  currency: null,
  reasonCode: null,
  orderId: null,
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export async function recordRevolutDispute(
  disputeId: string,
  event: string,
  fetchImpl: FetchLike = fetch,
): Promise<'recorded' | 'unchanged'> {
  let snap: DisputeSnapshot;
  let failure: unknown = null;
  try {
    snap = snapshotOf(await retrieveRevolutDispute(disputeId, fetchImpl));
  } catch (error) {
    // Без лог тук: уебхукът (webhooks.ts) и работникът (recheckUnreadDisputes) го записват веднъж.
    failure = error;
    snap = { state: 'unread', ...UNREAD };
  }
  const recorded = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${DISPUTE_LOCK}::int, hashtext(${disputeId}))`;
    // Решението е под заключването: GET-ът е преди него, затова сравнението е тук, с последните записи.
    const target = {
      action: DISPUTE_AUDIT_ACTION,
      targetType: 'RevolutDispute',
      targetId: disputeId,
    } as const;
    const [last, lastRead] = await Promise.all([
      tx.auditLog.findFirst({ where: target, orderBy: { id: 'desc' }, select: { details: true } }),
      tx.auditLog.findFirst({
        where: { ...target, NOT: { details: { path: ['state'], equals: 'unread' } } },
        orderBy: { id: 'desc' },
        select: { details: true },
      }),
    ]);
    if (
      !isNew({
        last: asRecord(last?.details),
        lastRead: asRecord(lastRead?.details),
        event,
        snap,
      })
    )
      return false;
    const payment = snap.orderId
      ? await tx.payment.findUnique({
          where: { providerOrderId: snap.orderId },
          select: { id: true, organizationId: true, planCode: true, subscriptionId: true },
        })
      : null;
    await audit(tx, {
      actorId: null,
      organizationId: payment?.organizationId ?? null,
      action: DISPUTE_AUDIT_ACTION,
      targetType: 'RevolutDispute',
      targetId: disputeId,
      details: {
        event,
        ...snap,
        paymentId: payment?.id ?? null,
        planCode: payment?.planCode ?? null,
        subscriptionId: payment?.subscriptionId ?? null,
      },
    });
    const masters = await tx.user.findMany({
      where: { platformRole: 'MASTER', disabledAt: null },
      select: { email: true },
    });
    const notice: DisputeNotice = {
      disputeId,
      event,
      state: snap.state,
      substate: snap.substate,
      amountCents: snap.amountCents,
      currency: snap.currency,
      responseDueAt: snap.responseDueAt,
      organizationId: payment?.organizationId ?? null,
      paymentId: payment?.id ?? null,
      planCode: payment?.planCode ?? null,
    };
    // Писмо на мастъра, не на фирмата: без organizationId (прекратяването на фирмата не го трие).
    if (masters.length > 0) {
      await tx.notification.createMany({
        data: masters.map((m) => ({
          kind: 'master.dispute',
          toEmail: m.email,
          payload: { ...notice },
        })),
      });
    }
    return true;
  });
  if (recorded) kickOutbox();
  if (failure) throw failure;
  return recorded ? 'recorded' : 'unchanged';
}

/** Колко назад се гледат непрочетените спорове (сроковете за отговор са седмици, не месеци). */
export const DISPUTE_RECHECK_WINDOW_MS = 30 * DAY;
/** Най-много толкова спора на обиколка (всеки е заявка към Revolut). */
const DISPUTE_RECHECK_BATCH = 20;

/**
 * Кога спорът е опитан за последно в този процес. Подреждането по него не дава на трайно непрочетени
 * спорове да запушат останалите: неопитаните са първи, после по-отдавна опитаните (при равенство — по-старият
 * запис). Само в паметта — след рестарт всички започват наравно; без база и без нова таблица.
 */
const lastTried = new Map<string, number>();

/**
 * Работникът на плащанията (на 10 мин): споровете, чийто последен запис е „не се прочете“, се четат наново —
 * уебхукът опитва само 3 пъти за ~30 мин, а срокът за отговор тече. Прочетеният спор дава запис и писмо с
 * подробностите (`isNew`); още непрочетеният не праща второ писмо. Предупреждение в лога — при първия
 * неуспешен опит на спора в процеса, после само debug (иначе по едно на 10 мин за всеки). Връща колко спора
 * е опитал.
 */
export async function recheckUnreadDisputes(
  fetchImpl: FetchLike = fetch,
  now = new Date(),
  batch = DISPUTE_RECHECK_BATCH,
): Promise<number> {
  const rows = await prisma.auditLog.findMany({
    where: {
      action: DISPUTE_AUDIT_ACTION,
      targetType: 'RevolutDispute',
      at: { gte: new Date(now.getTime() - DISPUTE_RECHECK_WINDOW_MS) },
    },
    orderBy: { id: 'desc' },
    select: { id: true, targetId: true, details: true },
    take: 500,
  });
  const latest = new Map<string, { id: bigint; details: Record<string, unknown> | null }>();
  for (const row of rows) {
    if (row.targetId && !latest.has(row.targetId)) {
      latest.set(row.targetId, { id: row.id, details: asRecord(row.details) });
    }
  }
  const unread = [...latest]
    .filter(([, last]) => last.details?.['state'] === 'unread')
    .sort(([a, x], [b, y]) => {
      const tried = (lastTried.get(a) ?? 0) - (lastTried.get(b) ?? 0);
      return tried !== 0 ? tried : x.id < y.id ? -1 : x.id > y.id ? 1 : 0;
    });
  for (const id of lastTried.keys()) {
    if (!unread.some(([disputeId]) => disputeId === id)) lastTried.delete(id);
  }
  let tried = 0;
  for (const [disputeId, last] of unread.slice(0, batch)) {
    tried += 1;
    const seenBefore = lastTried.has(disputeId);
    lastTried.set(disputeId, Date.now());
    const event =
      typeof last.details?.['event'] === 'string'
        ? last.details['event']
        : 'DISPUTE_ACTION_REQUIRED';
    try {
      await recordRevolutDispute(disputeId, event, fetchImpl);
      lastTried.delete(disputeId);
    } catch (error) {
      if (error instanceof RevolutError && error.code === 'notConfigured') break;
      logger[seenBefore ? 'debug' : 'warn'](
        { err: errorMessage(error) },
        'спорът още не се чете от Revolut',
      );
    }
  }
  return tried;
}
