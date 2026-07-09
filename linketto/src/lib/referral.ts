import { randomBytes } from 'node:crypto';
import type { PlanId } from '@/lib/plans';

// Реферална програма: „Покани приятел“. Реферерът получава бонус кредит,
// когато поканеният си купи платен план. Кредитът се натрупва в
// User.referralCreditCents и се вижда в дашборда (изплаща се/приспада от
// собственика — вж. админ панела).

// Бонус за успешен реферал по плана, който поканеният е взел (в евроцентове).
const REWARD_BY_PLAN: Record<PlanId, number> = {
  FREE: 0, // безплатният план не носи бонус
  PRO: 300, // €3
  BUSINESS: 500, // €5
  FOUNDER: 1000, // €10 (еднократен, по-голяма стойност)
};

export function referralRewardCents(plan: PlanId): number {
  return REWARD_BY_PLAN[plan] ?? 0;
}

/** Кратък, четим реферален код (8 hex знака, без двусмислени символи). */
export function generateReferralCode(): string {
  return randomBytes(4).toString('hex');
}

/** Публичният реферален линк за даден код. */
export function referralLink(baseUrl: string, locale: string, code: string) {
  return `${baseUrl}/${locale}/register?ref=${code}`;
}
