import { randomBytes } from 'node:crypto';

// Реферална програма: „Покани приятел“. Реферерът получава бонус кредит,
// когато поканеният си купи платен план. Кредитът се натрупва в
// User.referralCreditCents и се вижда в дашборда (изплаща се/приспада от
// собственика — вж. админ панела).

/** Процент от плащането на поканения, който отива като бонус за реферера. */
export const REFERRAL_PERCENT = 15;

/** Минимален праг за изплащане на натрупания бонус (евроцентове) = €100. */
export const REFERRAL_MIN_PAYOUT_CENTS = 10000;

/** Бонус (евроцентове) = процент от реалната сума, платена от поканения. */
export function referralRewardCents(amountCents: number): number {
  if (!Number.isInteger(amountCents) || amountCents <= 0) return 0;
  return Math.round((amountCents * REFERRAL_PERCENT) / 100);
}

/**
 * Процент към прага за теглене, ограничен в [0, 100]. Сторниран бонус прави баланса отрицателен, а
 * отрицателна ширина е невалиден CSS — лентата падаше на auto и се рисуваше пълна (02.11.2026).
 */
export function payoutProgressPercent(creditCents: number): number {
  if (!Number.isFinite(creditCents) || creditCents <= 0) return 0;
  return Math.min(100, Math.round((creditCents / REFERRAL_MIN_PAYOUT_CENTS) * 100));
}

/** Достигнат ли е прагът за теглене на натрупания кредит? */
export function canWithdraw(creditCents: number): boolean {
  return creditCents >= REFERRAL_MIN_PAYOUT_CENTS;
}

/** Кратък, четим реферален код (8 hex знака, без двусмислени символи). */
export function generateReferralCode(): string {
  return randomBytes(4).toString('hex');
}

/** Публичният реферален линк за даден код. */
export function referralLink(baseUrl: string, locale: string, code: string) {
  return `${baseUrl}/${locale}/register?ref=${code}`;
}

/**
 * Задържане на бонуса (abuse-money-spec А2): 14 дни за отказ + буфер за спор и бавно
 * връщане. Дотогава бонусът е „задържан“ и не влиза в баланса за изплащане.
 */
export const REFERRAL_HOLD_DAYS = 30;

export function referralReleaseDue(input: {
  completedAt: Date | null;
  orderState: string;
  withdrawalRequestedAt: Date | null;
  disputed: boolean;
  releasedAt: Date | null;
  reversedAt: Date | null;
  now: Date;
}): boolean {
  if (input.releasedAt || input.reversedAt || input.disputed || input.withdrawalRequestedAt) return false;
  if (input.orderState !== 'completed' || !input.completedAt) return false;
  return input.now.getTime() - input.completedAt.getTime() > REFERRAL_HOLD_DAYS * 24 * 60 * 60 * 1000;
}
