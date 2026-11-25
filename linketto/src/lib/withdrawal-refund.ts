// Пропорционално плащане при отказ (чл. 14(3) Дир. 2011/83; abuse-money-spec Б3) —
// чисто, тества се. Смята се ВЕДНЪЖ — при изявлението за отказ — и се пази
// (PlanOrder.refundCents …), за да е същата сума при всеки повтор към Revolut.

import { addMonthsUtc } from '@/lib/plan-orders';
import { intervalFor, type BillingIntervalId } from '@/lib/plans';

const DAY_MS = 24 * 60 * 60 * 1000;
/** „Завинаги“ (FOUNDER) — референтен период 365 дни (решение на собственика, оповестено в ОУ). */
const FOUNDER_REFERENCE_MS = 365 * DAY_MS;

export interface WithdrawalRefundInput {
  amountCents: number;
  vatCents: number;
  plan: string;
  interval: string;
  prevPlan: string | null;
  prevExpiresAt: Date | null;
  completedAt: Date;
  requestedAt: Date;
  /** Изричното искане за ранно начало (отметката при поръчката); без него — пълна сума. */
  immediateStartAt: Date | null;
  /** Неприложена (conflict) поръчка — нищо не е предоставено. */
  applied: boolean;
}

export function withdrawalRefund(input: WithdrawalRefundInput): {
  refundCents: number;
  refundVatCents: number;
  usedSec: number;
} {
  const full = { refundCents: input.amountCents, refundVatCents: input.vatCents, usedSec: 0 };
  if (!input.applied || !input.immediateStartAt || input.amountCents <= 0) return full;

  const founder = input.plan === 'FOUNDER' || input.interval === 'lifetime';
  // Удължаване на СЪЩИЯ план: новият период започва от края на стария (applyPaidOrder).
  const sameExtension =
    !founder &&
    input.prevPlan === input.plan &&
    input.prevExpiresAt !== null &&
    input.prevExpiresAt.getTime() > input.completedAt.getTime();
  const start = sameExtension ? (input.prevExpiresAt as Date) : input.completedAt;
  const periodMs = founder
    ? FOUNDER_REFERENCE_MS
    : addMonthsUtc(start, intervalFor(input.interval as BillingIntervalId).months).getTime() - start.getTime();
  const usedMs = Math.min(Math.max(input.requestedAt.getTime() - start.getTime(), 0), periodMs);
  // Ползваното — закръглено надолу (в полза на потребителя).
  const usedCents = Math.floor((input.amountCents * usedMs) / periodMs);
  const refundCents = input.amountCents - usedCents;
  return {
    refundCents,
    refundVatCents: Math.round((input.vatCents * refundCents) / input.amountCents),
    usedSec: Math.floor(usedMs / 1000),
  };
}
