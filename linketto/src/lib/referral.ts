import { randomBytes } from 'node:crypto';

// Реферална програма: „Покани приятел“. Реферерът получава бонус кредит,
// когато поканеният си купи платен план. Кредитът се натрупва в
// User.referralCreditCents и се вижда в дашборда (изплаща се/приспада от
// собственика — вж. админ панела).

/** Процент от плащането на поканения, който отива като бонус за реферера. */
export const REFERRAL_PERCENT = 25;

/** Бонус (евроцентове) = процент от реалната сума, платена от поканения. */
export function referralRewardCents(amountCents: number): number {
  if (!Number.isInteger(amountCents) || amountCents <= 0) return 0;
  return Math.round((amountCents * REFERRAL_PERCENT) / 100);
}

/** Кратък, четим реферален код (8 hex знака, без двусмислени символи). */
export function generateReferralCode(): string {
  return randomBytes(4).toString('hex');
}

/** Публичният реферален линк за даден код. */
export function referralLink(baseUrl: string, locale: string, code: string) {
  return `${baseUrl}/${locale}/register?ref=${code}`;
}
