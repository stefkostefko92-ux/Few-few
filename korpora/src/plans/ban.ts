import type { Plan } from '@prisma/client';

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
