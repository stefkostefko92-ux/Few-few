import type { Plan } from '@prisma/client';
import { BAN_RULE_TERMS, TERMS_NOTICE_DAYS } from '../company.js';
import { DAY } from '../time.js';
import { sofiaDay } from './bg-calendar.js';
import { addMonths } from './plan.js';
import { LIFETIME_BASIS_MONTHS } from './pricing.js';

/**
 * Блокирането по общите условия (раздел „Блокиране“). Сроковете не са законови — наш избор; текстът на
 * условията и писмото при блокиране ги взимат оттук, затова се сменят на всички езици наведнъж.
 */

/** Наш избор: толкова дни най-малко даваме след предупреждението за нарушение, което може да се поправи. */
export const BAN_WARNING_DAYS = 7;

/** Наш избор: до толкова дни отговаряме с мотивирано решение на възражение срещу блокирането. */
export const BAN_REPLY_DAYS = 14;

/**
 * Новият край на плана, когато блокирането е вдигнато с отметката „Блокирането беше грешка“: тестовият
 * или платеният период се удължава точно с времето на блокирането (`liftedAt − bannedAt`). Така човекът
 * получава обратно точно времето, което му е оставало в момента на блокирането.
 *
 * null — няма какво да се удължи:
 * - Lifetime няма край. За него основата е отметката `AccountBan.mistake`: първите LIFETIME_BASIS_MONTHS
 *   месеца от плащането (активирането на Lifetime в историята на плана) се удължават със сбора от
 *   `liftedAt − createdAt` на всичките му блокирания с `mistake = true` след плащането. Смята го екипът,
 *   когато трябва част от цената — отказ с ранно начало, спиране на Korpora, промяна във вреда на клиента
 *   (общите условия, „Планове и цени“);
 * - периодът още не е започнал (непотвърден имейл — `planExpiresAt` е null);
 * - периодът е свършил преди блокирането: не е загубено нищо, а новата дата пак би била в миналото.
 */
export function extendedAfterMistake(
  user: { plan: Plan; planExpiresAt: Date | null },
  bannedAt: Date,
  liftedAt: Date,
): Date | null {
  if (user.plan === 'LIFETIME' || !user.planExpiresAt) return null;
  if (user.planExpiresAt.getTime() <= bannedAt.getTime()) return null;
  const lasted = liftedAt.getTime() - bannedAt.getTime();
  if (lasted <= 0) return null;
  return new Date(user.planExpiresAt.getTime() + lasted);
}

/**
 * Денят на версията на общите условия с правилото „при блокиране заради нарушение платеното не се връща“ и
 * денят, от който то важи и за поръчките отпреди нея (TERMS_NOTICE_DAYS по-късно) — като UTC полунощ на
 * датата. Един източник за датите в преходното изречение на условията (services/legal-numbers.ts) и за
 * писмото при блокиране (refundsUnderOldTerms).
 */
export function banRuleDays(): { since: number; oldOrders: number } {
  const since = Date.parse(`${BAN_RULE_TERMS}T00:00:00Z`);
  return { since, oldOrders: since + TERMS_NOTICE_DAYS * DAY };
}

/** Платеният период на изпълнена поръчка — активирането ѝ в историята на плана (PlanChange). */
export interface OrderedPeriod {
  toPlan: Plan;
  toExpiresAt: Date | null;
  createdAt: Date;
  /** Версията на общите условия, приети с поръчката; null — заявка отпреди поръчките. */
  termsVersion: string | null;
}

/**
 * Блокиране в преходния период (общите условия, „Блокиране“, последното изречение): за поръчка по версия на
 * условията отпреди BAN_RULE_TERMS правилото за невръщане важи едва от banRuleDays().oldOrders, а дотогава
 * клиентът може да прекрати безплатно и да получи неизползваната част от цената. Блокирането в този
 * прозорец не му я взема — писмото казва това, не „не се връща“.
 *
 * true, когато денят на блокирането по София е преди прехода, планът на човека е платен и още тече и има
 * изпълнена поръчка по стара версия, чийто период не е изтекъл: Premium — до края, който тя е дала
 * (toExpiresAt); Lifetime — първите LIFETIME_BASIS_MONTHS месеца от активирането (след тях е изцяло използван,
 * „Планове и цени“). Поръчката е стара по приетата с нея версия, не по датата: поръчка след BAN_RULE_TERMS на
 * сървър, на който новата версия още не е публикувана, е приела старите условия.
 */
export function refundsUnderOldTerms(
  user: { plan: Plan; planExpiresAt: Date | null },
  periods: readonly OrderedPeriod[],
  now: Date,
): boolean {
  if (sofiaDay(now) >= banRuleDays().oldOrders) return false;
  const runs = (end: Date | null) => end !== null && end.getTime() > now.getTime();
  if (user.plan === 'TRIAL' || (user.plan === 'PREMIUM' && !runs(user.planExpiresAt))) return false;
  return periods.some((period) => {
    if (period.termsVersion !== null && period.termsVersion >= BAN_RULE_TERMS) return false;
    if (period.toPlan === 'LIFETIME')
      return runs(addMonths(period.createdAt, LIFETIME_BASIS_MONTHS));
    return period.toPlan === 'PREMIUM' && runs(period.toExpiresAt);
  });
}
