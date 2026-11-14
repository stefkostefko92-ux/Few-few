import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { errorMessage, logger } from '../logger.js';
import { kickOutbox } from '../mail/outbox.js';
import { activatePayment } from './orders.js';
import { BillingError } from './billing-core.js';
import {
  createRevolutOrder,
  findRevolutOrderByReference,
  retrieveRevolutOrder,
  RevolutError,
  type FetchLike,
  type RevolutOrder,
} from './revolut-client.js';

/**
 * Плащане на план с карта през Revolut (SPEC 49). Пренасочването след плащането само показва
 * „обработва се“ — права дават САМО `settleRevolutOrder` (от проверения webhook, от проверката на
 * висящите или от бутона в мастър панела), след повторно четене на поръчката и сверка на сума, валута,
 * основание и остатък.
 */

/** Страницата за плащане на чакаща поръчка с карта; втори клик връща същата. */
export async function startCardCheckout(
  input: { paymentId: string; organizationId: string; redirectUrl: string },
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  const payment = await prisma.payment.findFirst({
    where: {
      id: input.paymentId,
      organizationId: input.organizationId,
      provider: 'REVOLUT',
      status: 'PENDING',
      planCode: { not: null },
    },
  });
  if (!payment || !payment.reference) throw new BillingError('notPending');
  // Поръчката при Revolut живее 24 ч от създаването (то е веднага след нашата поръчка); след това —
  // нова поръчка от страницата „План“, а проверката на висящите покрива целия живот на страницата.
  if (Date.now() - payment.createdAt.getTime() > CHECKOUT_TTL_MS) throw new BillingError('expired');
  if (payment.checkoutUrl) return payment.checkoutUrl;
  const plan = await prisma.plan.findUnique({
    where: { code: payment.planCode ?? '' },
    select: { nameBg: true },
  });
  let order: RevolutOrder;
  try {
    order = await createRevolutOrder(
      {
        amountCents: payment.amountCents,
        reference: payment.reference,
        description: `Фактурист — план „${plan?.nameBg ?? payment.planCode}“ (${payment.reference})`,
        redirectUrl: input.redirectUrl,
      },
      fetchImpl,
    );
  } catch (error) {
    // Без Idempotency-Key: при прекъсната връзка поръчката може да е създадена — търси се по основанието.
    if (!(error instanceof RevolutError) || error.code !== 'network') throw error;
    const found = await findRevolutOrderByReference(payment.reference, fetchImpl);
    if (!found) throw error;
    order = found;
  }
  if (
    order.amount !== payment.amountCents ||
    order.currency !== payment.currency ||
    order.reference !== payment.reference ||
    !order.checkoutUrl
  ) {
    throw new RevolutError('invalidResponse');
  }
  const updated = await prisma.payment.updateMany({
    where: { id: payment.id, providerOrderId: null },
    data: { providerOrderId: order.id, checkoutUrl: order.checkoutUrl },
  });
  if (updated.count === 1) return order.checkoutUrl;
  // Двоен клик: другата заявка е записала своята поръчка — връща се нейната страница.
  const current = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
  if (!current.checkoutUrl) throw new BillingError('notPending');
  return current.checkoutUrl;
}

/** Колко време страницата за плащане е годна (Revolut я проваля след 24 ч — малко по-рано при нас). */
export const CHECKOUT_TTL_MS = 23 * 60 * 60 * 1000;

export type SettleOutcome =
  'activated' | 'already' | 'notFound' | 'notPaid' | 'mismatch' | 'review';

/** Сверката преди права: поръчката при Revolut срещу нашия запис. */
function matches(
  order: RevolutOrder,
  payment: {
    providerOrderId: string | null;
    amountCents: number;
    currency: string;
    reference: string | null;
  },
): boolean {
  return (
    order.id === payment.providerOrderId &&
    order.amount === payment.amountCents &&
    order.currency === payment.currency &&
    order.reference === payment.reference &&
    (order.outstandingAmount === null || order.outstandingAmount === 0)
  );
}

/**
 * Поръчката при Revolut е платена → активиране + фактура (orders.ts). Идемпотентно: повторен webhook,
 * проверката на висящите и бутонът в панела не правят второ активиране.
 */
export async function settleRevolutOrder(
  orderId: string,
  fetchImpl: FetchLike = fetch,
): Promise<SettleOutcome> {
  const payment = await prisma.payment.findUnique({ where: { providerOrderId: orderId } });
  if (!payment) return 'notFound';
  if (payment.status === 'COMPLETED' || payment.status === 'REFUNDED') return 'already';
  const order = await retrieveRevolutOrder(orderId, fetchImpl);
  if (order.state !== 'completed') return 'notPaid';
  // Часът е на Revolut; ако го няма или е „в бъдещето“ (разминаване на часовниците) — сега.
  const now = new Date();
  const paidAt = order.paidAt && order.paidAt <= now ? order.paidAt : now;
  if (!matches(order, payment)) {
    await markForReview(payment, paidAt, 'mismatch', {
      expectedCents: payment.amountCents,
      orderCents: order.amount,
      currency: order.currency,
      referenceMatches: order.reference === payment.reference,
    });
    return 'mismatch';
  }
  if (!payment.planCode) {
    const done = await prisma.payment.updateMany({
      where: { id: payment.id, status: { in: ['PENDING', 'CANCELLED'] } },
      data: { status: 'COMPLETED', paidAt },
    });
    return done.count === 1 ? 'activated' : 'already';
  }
  let result: { activated: boolean };
  try {
    result = await activatePayment({
      paymentId: payment.id,
      paidAt,
      expectedAmountCents: order.amount,
    });
  } catch (error) {
    if (
      !(error instanceof BillingError) ||
      (error.code !== 'needsReview' && error.code !== 'creditStale')
    )
      throw error;
    await markForReview(
      payment,
      paidAt,
      error.code === 'creditStale' ? 'creditStale' : 'superseded',
      { planCode: payment.planCode },
    );
    return 'review';
  }
  if (result.activated) kickOutbox();
  return result.activated ? 'activated' : 'already';
}

/**
 * Платено, но не за активиране (несъвпадение, заменена поръчка при по-нов платен план или прихващане
 * от абонамент, който вече не е действащият): FAILED с
 * датата на плащането — излиза от проверката на висящите (без шум в одита на 10 мин) и чака мастъра
 * (връщане на парите през Revolut). Записва се веднъж — условно по статуса.
 */
async function markForReview(
  payment: { id: string; organizationId: string },
  paidAt: Date,
  reason: 'mismatch' | 'superseded' | 'creditStale',
  details: Record<string, string | number | boolean | null>,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const marked = await tx.payment.updateMany({
      where: { id: payment.id, status: { in: ['PENDING', 'CANCELLED'] } },
      data: { status: 'FAILED', paidAt },
    });
    if (marked.count !== 1) return;
    await audit(tx, {
      actorId: null,
      organizationId: payment.organizationId,
      action: 'billing.payment.review',
      targetType: 'Payment',
      targetId: payment.id,
      details: { reason, ...details },
    });
  });
  logger.warn({ paymentId: payment.id, reason }, 'плащане с карта чака решение на мастъра');
}

/** Висящите плащания с карта от последните 48 часа (поръчката при Revolut живее 24). */
export const RECONCILE_WINDOW_MS = 48 * 60 * 60 * 1000;
/** По-младите от това чакат webhook-а — проверката не се надпреварва с него. */
export const RECONCILE_GRACE_MS = 5 * 60 * 1000;

/**
 * Проверката на висящите: Revolut праща webhook-а само 4 пъти за ~30 минути; ако сме били недостъпни,
 * плащането се намира оттук. Връща колко са активирани.
 */
export async function reconcileCardPayments(
  fetchImpl: FetchLike = fetch,
  now = new Date(),
): Promise<number> {
  const pending = await prisma.payment.findMany({
    where: {
      provider: 'REVOLUT',
      status: { in: ['PENDING', 'CANCELLED'] },
      providerOrderId: { not: null },
      createdAt: {
        gt: new Date(now.getTime() - RECONCILE_WINDOW_MS),
        lt: new Date(now.getTime() - RECONCILE_GRACE_MS),
      },
    },
    select: { id: true, providerOrderId: true },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });
  let activated = 0;
  for (const payment of pending) {
    try {
      if ((await settleRevolutOrder(payment.providerOrderId!, fetchImpl)) === 'activated') {
        activated += 1;
      }
    } catch (error) {
      if (error instanceof RevolutError && error.code === 'notConfigured') break;
      logger.warn(
        { paymentId: payment.id, err: errorMessage(error) },
        'проверката на плащане с карта не мина',
      );
    }
  }
  return activated;
}
