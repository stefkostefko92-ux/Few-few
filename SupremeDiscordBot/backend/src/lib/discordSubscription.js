// backend/src/lib/discordSubscription.js
// Статусите на Discord Premium App абонамент — ЕДНО определение.
//
// Стойностите са по ЖИВАТА документация (docs.discord.com → Resources →
// Subscription, сверено 12.09.2026):
//   ACTIVE   0  „Subscription is active and scheduled to renew."
//   INACTIVE 1  „Subscription is inactive and not being charged."
//   ENDING   2  „Subscription is active but will not renew."
//
// ВНИМАНИЕ (разминаване, измерено): discord-api-types 0.38.48 (в бота) обявява
// Ending=1 / Inactive=2 — обратно на документацията. Ние пазим СУРОВОТО число от
// жицата и го превеждаме тук, по документацията, а не през enum-а на пакета.
// Затова етикетът е информативен: ПРАВАТА никога не се извеждат от него —
// Discord изрично прави entitlement-а източник на истината, а абонаментът е
// само „защо“ и „докога“. Ако Discord някога размени числата, грешен ще е само
// етикетът в таблото, не достъпът на клиента.

export const DISCORD_SUBSCRIPTION_STATUS = Object.freeze({
  ACTIVE: 0,
  INACTIVE: 1,
  ENDING: 2,
});

const LABELS = Object.freeze({
  0: "active",
  1: "inactive",
  2: "ending",
});

/** Числов статус → етикет; непознато/null → null. */
export function discordSubscriptionLabel(status) {
  if (status === null || status === undefined) return null;
  return LABELS[Number(status)] ?? "unknown";
}

/**
 * „Отменен, но платен до края на периода“ — по документацията това е ENDING,
 * но `canceled_at` е втори, независим сигнал (Discord го попълва при отмяна).
 * Двата се сверяват: ако който и да е от тях казва „свършва“, свършва.
 */
export function isEndingSubscription({ status, canceledAt, currentPeriodEnd }, now = new Date()) {
  const periodEnd = currentPeriodEnd ? new Date(currentPeriodEnd) : null;
  const stillInPeriod = !!(periodEnd && !Number.isNaN(periodEnd.getTime()) && periodEnd > now);
  if (Number(status) === DISCORD_SUBSCRIPTION_STATUS.ENDING) return true;
  return Boolean(canceledAt) && stillInPeriod;
}
