// backend/src/lib/game/privacy.js
// Личните данни на Server Season — ЕДНО място за чл. 15/20 (експорт) и чл. 17
// (изтриване). Преди имаше два пътя: dsr.js (бот /privacy + админ) знаеше за
// играта, а routes/gdpr.js (експорт и изтриване от таблото) — не. Човек,
// изтрил акаунта си от таблото, оставаше с цял профил в играта, а експортът
// „всички лични данни“ пропускаше седем таблици (одит на Кодаджията и
// Правния Разбирач, 25.09.2026). Нов модел с Discord ID влиза ТУК.
import { prisma } from "../prisma.js";

const safe = (fn) => Promise.resolve().then(fn).catch(() => []);

/** Чл. 15/20: всичко от играта за този Discord ID, с изрични полета. */
export async function gameDataFor(userId) {
  const uid = String(userId);
  const [progress, xpGrants, companions, purchases, questContributions, triviaAnswers, trades] = await Promise.all([
    safe(() => prisma.memberProgress.findMany({ where: { userId: uid }, select: {
      serverId: true, xp: true, level: true, seasonXp: true, sparks: true, streak: true, lastDailyAt: true,
      lastMessageXpAt: true, messages: true, voiceMinutes: true, activeCompanionId: true, createdAt: true, updatedAt: true } })),
    safe(() => prisma.gameXpGrant.findMany({ where: { userId: uid }, select: { serverId: true, key: true, amount: true, createdAt: true } })),
    safe(() => prisma.memberCompanion.findMany({ where: { userId: uid }, select: {
      id: true, serverId: true, companionId: true, stage: true, fed: true, nickname: true, seasonId: true, caughtAt: true } })),
    safe(() => prisma.shopPurchase.findMany({ where: { userId: uid }, select: {
      serverId: true, itemName: true, itemType: true, roleId: true, priceSparks: true, expiresAt: true, revokedAt: true, createdAt: true } })),
    safe(() => prisma.questContribution.findMany({ where: { userId: uid }, select: { questId: true, amount: true } })),
    safe(() => prisma.triviaAnswer.findMany({ where: { userId: uid }, select: { roundId: true, option: true, correct: true, createdAt: true } })),
    safe(() => prisma.companionTrade.findMany({ where: { OR: [{ fromUserId: uid }, { toUserId: uid }] }, select: {
      serverId: true, fromUserId: true, toUserId: true, fromCompanionId: true, toCompanionId: true, status: true, createdAt: true, resolvedAt: true } })),
  ]);
  return { progress, xp_grants: xpGrants, companions, shop_purchases: purchases, quest_contributions: questContributions, trivia_answers: triviaAnswers, companion_trades: trades };
}

/**
 * Чл. 17: стъпките за изтриване на данните от играта, в транзакция `tx`.
 * Уловените появи, спечелените trivia рундове и последният брояч остават като
 * събитие на сървъра, но без идентификатора.
 * @returns {Array<[string, () => Promise<unknown>]>}
 */
export function gameEraseSteps(tx, userId) {
  const uid = String(userId);
  return [
    ["gameProfiles", () => tx.memberProgress.deleteMany({ where: { userId: uid } })],
    ["gameXpGrants", () => tx.gameXpGrant.deleteMany({ where: { userId: uid } })],
    ["companions", () => tx.memberCompanion.deleteMany({ where: { userId: uid } })],
    ["purchases", () => tx.shopPurchase.deleteMany({ where: { userId: uid } })],
    ["questContributions", () => tx.questContribution.deleteMany({ where: { userId: uid } })],
    ["triviaAnswers", () => tx.triviaAnswer.deleteMany({ where: { userId: uid } })],
    ["triviaWinsAnonymized", () => tx.triviaRound.updateMany({ where: { winnerId: uid }, data: { winnerId: null } })],
    ["countingLastAnonymized", () => tx.gameSettings.updateMany({ where: { countingLastUserId: uid }, data: { countingLastUserId: null } })],
    ["trades", () => tx.companionTrade.deleteMany({ where: { OR: [{ fromUserId: uid }, { toUserId: uid }] } })],
    ["spawnsAnonymized", () => tx.companionSpawn.updateMany({ where: { caughtById: uid }, data: { caughtById: null } })],
  ];
}
