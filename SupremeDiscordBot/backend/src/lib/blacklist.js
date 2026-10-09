// backend/src/lib/blacklist.js
// v51 — ЕДНО определение за „в черния списък ли е потребителят“. Досега бяха
// три проверки на един булев флаг (middleware, входът, ботът); със срока
// (blacklistedUntil) три копия биха дрейфнали — изтекъл срок трябва да пуска
// човека навсякъде едновременно.

/** Активен ли е черният списък: флагът е вдигнат и срокът (ако има) не е изтекъл. */
export function isBlacklistActive(user, now = new Date()) {
  if (!user?.isBlacklisted) return false;
  if (!user.blacklistedUntil) return true;
  return new Date(user.blacklistedUntil) > now;
}

/** Полетата, които isBlacklistActive чете — за изричен Prisma select. */
export const BLACKLIST_SELECT = Object.freeze({ isBlacklisted: true, blacklistedUntil: true });
