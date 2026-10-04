import type { BuyerType, RequestStatus } from '@prisma/client';
import { DAY, isBgWorkingDay, sofiaDay } from './bg-calendar.js';

/**
 * Правото на отказ от договор от разстояние (чл. 9 и 11а от Директива 2011/83; чл. 50 и 52а ЗЗП):
 * 14 дни след деня на сключването. Договорът се сключва с потвърждението по имейл веднага след
 * поръчката — затова началото е моментът на поръчката. Сроковете се броят по Регламент 1182/71:
 * денят на сключването не влиза, срокът изтича в края на последния ден, а ако той е неработен —
 * в края на следващия работен ден.
 */
export const WITHDRAWAL_DAYS = 14;

/** Последният ден на срока (по София), като 12:00 UTC — по София и в целия ЕС е същата дата. */
export function withdrawalLastDay(concludedAt: Date): Date {
  let day = sofiaDay(concludedAt) + WITHDRAWAL_DAYS * DAY;
  while (!isBgWorkingDay(day)) day += DAY;
  return new Date(day + 12 * 3_600_000);
}

/**
 * Докога функцията за отказ е отворена: краят на последния ден и в най-западната часова зона на ЕС
 * (UTC−4, Гваделупа и Мартиника) — никой потребител не губи част от последния си ден заради часа.
 */
export function withdrawalOpenUntil(concludedAt: Date): Date {
  const last = withdrawalLastDay(concludedAt);
  return new Date(last.getTime() - 12 * 3_600_000 + DAY + 4 * 3_600_000);
}

/** Толкова дни имаме да върнем парите след отказа (чл. 13 от Директивата; чл. 54 ЗЗП). */
export const REFUND_DAYS = 14;

/**
 * Последният ден за връщане на парите (по София), като 12:00 UTC: календарни дни от деня на отказа,
 * който не се брои — като срока за отказ, не 14 × 24 часа (през смяната на часа излиза друга дата).
 * Не се мести за неработни дни. Едно правило за писмото до клиента, известието до екипа и панела.
 */
export function refundDeadline(withdrawnAt: Date): Date {
  return new Date(sofiaDay(withdrawnAt) + REFUND_DAYS * DAY + 12 * 3_600_000);
}

/** Какво стана с плана при отказа: поръчката не е активирана, планът е върнат или го оправя екипът. */
export const PLAN_OUTCOMES = ['open', 'reverted', 'manual'] as const;
export type PlanOutcome = (typeof PLAN_OUTCOMES)[number];

const isPlanOutcome = (value: unknown): value is PlanOutcome =>
  typeof value === 'string' && (PLAN_OUTCOMES as readonly string[]).includes(value);

/**
 * Изходът на отказа — записаният при самия отказ. Само за откази отпреди записа (null) се извежда както
 * тогава: върнатият план личи по промяната с бележката за отказ, активираната поръчка без нея е за екипа.
 */
export function withdrawalOutcomeOf(order: {
  withdrawalOutcome: string | null;
  handledAt: Date | null;
  /** промените на плана с бележката за отказ (LABEL.withdrawal) */
  planChanges: readonly unknown[];
}): PlanOutcome {
  if (isPlanOutcome(order.withdrawalOutcome)) return order.withdrawalOutcome;
  return order.planChanges.length ? 'reverted' : order.handledAt ? 'manual' : 'open';
}

export interface OrderTerms {
  buyerType: BuyerType;
  status: RequestStatus;
  createdAt: Date;
  earlyStartRequestedAt: Date | null;
  withdrawnAt: Date | null;
  /** null = заявка отпреди поръчките (без договор по тези правила): нито бутон за отказ, нито изчакване. */
  termsVersion: string | null;
}

/** Може ли потребителят да се откаже сега: поръчка на потребител по тези правила, жива, в срока. */
export function canWithdraw(order: OrderTerms, now: Date = new Date()): boolean {
  return (
    order.termsVersion !== null &&
    order.buyerType === 'CONSUMER' &&
    (order.status === 'OPEN' || order.status === 'DONE') &&
    order.withdrawnAt === null &&
    now.getTime() < withdrawalOpenUntil(order.createdAt).getTime()
  );
}

/**
 * От кога платеното може да започне. Без изрично искане на потребителя — след срока за отказ:
 * иначе при отказ той не дължи нищо за вече даденото (чл. 14, пар. 4 от Директивата).
 */
export function paidStartAllowedFrom(order: OrderTerms): Date {
  return order.termsVersion !== null &&
    order.buyerType === 'CONSUMER' &&
    !order.earlyStartRequestedAt
    ? withdrawalOpenUntil(order.createdAt)
    : order.createdAt;
}
