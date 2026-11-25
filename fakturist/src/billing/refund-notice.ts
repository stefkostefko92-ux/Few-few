import type { Prisma } from '@prisma/client';
import { DAY } from '../time.js';
import { prorationCredit } from './proration.js';

/**
 * Пари, които трябва да се върнат — писмо до мастърите (Продавача и Правният Разбирач, 25.11.2026: всеки срок
 * и обещание в общите условия има изпълнител в кода). Самото връщане е ръчно — през Revolut Business или с
 * превод; писмото казва колко, на кого и до кога.
 *
 * - `mismatch` / `superseded` / `creditStale` — платено, но не активира план (т. 6): връщаме до 14 дни.
 * - `legalRefused` — собственикът прекрати, без да приеме новата версия на условията (т. 11 и 15): връщаме
 *   платеното за неизползвания период. Сумата е ориентировъчна — пропорционално на оставащото време от
 *   последното платено плащане по действащия абонамент; мастърът я сверява.
 */
export type RefundReason = 'mismatch' | 'superseded' | 'creditStale' | 'legalRefused';

/** Срокът за връщане на плащане, което не активира план (общите условия, т. 6). */
export const REFUND_DUE_MS = 14 * DAY;

export interface RefundNotice {
  reason: RefundReason;
  organizationId: string;
  legalName: string;
  paymentId: string | null;
  /** Колко да се върне (евроцентове). */
  amountCents: number;
  /** Колко е платено по плащането (евроцентове). */
  paidCents: number;
  currency: string;
  paidAt: string | null;
  /** До кога (ISO) — само при плащане, което не активира план. */
  dueBy: string | null;
}

/** Писмо до всеки действащ мастър. Без organizationId — прекратяването на фирмата не го трие. */
export async function queueRefundNotice(
  tx: Prisma.TransactionClient,
  notice: RefundNotice,
): Promise<number> {
  if (notice.amountCents <= 0) return 0;
  const masters = await tx.user.findMany({
    where: { platformRole: 'MASTER', disabledAt: null },
    select: { email: true },
  });
  if (masters.length === 0) return 0;
  await tx.notification.createMany({
    data: masters.map((m) => ({
      kind: 'master.refund',
      toEmail: m.email,
      payload: { ...notice },
    })),
  });
  return masters.length;
}

/**
 * Неизползваното от платеното по действащия платен абонамент на фирмата към `now` — пропорционално на
 * оставащото време, от платената сума с ДДС, в цели центове надолу. `null` — няма какво да се връща
 * (безплатен, даден от мастъра или изтекъл период).
 */
export async function unusedPaid(
  tx: Prisma.TransactionClient,
  organizationId: string,
  now: Date,
): Promise<{
  amountCents: number;
  paidCents: number;
  currency: string;
  paymentId: string;
  paidAt: Date;
} | null> {
  const subscription = await tx.subscription.findFirst({
    where: { organizationId, status: 'ACTIVE', currentPeriodEnd: { gt: now } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, currentPeriodStart: true, currentPeriodEnd: true },
  });
  if (!subscription) return null;
  // Като `subscriptionCredit`: последното плащане върху периода на абонамента. Удължаването (същият план)
  // създава нов абонамент от края на стария, затова при `now` преди началото делът е над 100 % и покрива и
  // остатъка от предишния период (при еднаква цена — точно).
  const last = await tx.payment.findFirst({
    where: { subscriptionId: subscription.id, status: 'COMPLETED', paidAt: { not: null } },
    orderBy: { paidAt: 'desc' },
    select: { id: true, amountCents: true, currency: true, paidAt: true },
  });
  if (!last?.paidAt || last.amountCents <= 0) return null;
  const amountCents = prorationCredit({
    paidNetCents: last.amountCents,
    start: subscription.currentPeriodStart,
    end: subscription.currentPeriodEnd,
    now,
  });
  if (amountCents <= 0) return null;
  return {
    amountCents,
    paidCents: last.amountCents,
    currency: last.currency,
    paymentId: last.id,
    paidAt: last.paidAt,
  };
}
