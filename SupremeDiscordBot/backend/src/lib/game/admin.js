// backend/src/lib/game/admin.js
// v51 — операциите на платформения админ върху играта на един сървър:
// корекция на XP/искри, даване/отнемане на спътник, нулиране. Маршрутите са в
// routes/adminManage.js (MFA + step-up + одит); тук е само логиката.
//
// Същите правила като в играта: всяка корекция е ЕДНА транзакция върху
// заключения ред на играча (ensureProgress + update), числата не падат под 0,
// нивото се извежда от XP-то (levelFromXp), не се пише на ръка.
import { prisma } from "../prisma.js";
import { ensureProgress, levelFromXp } from "./xp.js";
import { companionById, isSeasonal, MAX_STAGE, publicCompanion } from "./companions.js";
import { getCurrentSeason } from "./seasons.js";

export const MAX_ADJUST = 10_000_000;

/**
 * Корекция на XP и/или искри с делта (±). Сезонното XP следва общото, за да
 * не се разминат класацията на сезона и нивото. Нивото се преизчислява; роли
 * за ниво НЕ се сменят и няма обява — това е ръчна поправка, не игра.
 */
export async function adjustMember(serverId, userId, { xpDelta = 0, sparksDelta = 0 } = {}) {
  if (!Number.isInteger(xpDelta) || !Number.isInteger(sparksDelta)) return { ok: false, code: "INVALID_AMOUNT" };
  if (Math.abs(xpDelta) > MAX_ADJUST || Math.abs(sparksDelta) > MAX_ADJUST) return { ok: false, code: "INVALID_AMOUNT" };
  if (!xpDelta && !sparksDelta) return { ok: false, code: "NOTHING_TO_DO" };
  return prisma.$transaction(async (tx) => {
    const before = await ensureProgress(tx, serverId, userId);
    const xp = Math.max(0, before.xp + xpDelta);
    const seasonXp = Math.max(0, before.seasonXp + xpDelta);
    const sparks = Math.max(0, before.sparks + sparksDelta);
    const level = levelFromXp(xp);
    const after = await tx.memberProgress.update({
      where: { serverId_userId: { serverId, userId } },
      data: { xp, seasonXp, sparks, level },
    });
    return {
      ok: true,
      before: { xp: before.xp, sparks: before.sparks, level: before.level },
      after: { xp: after.xp, sparks: after.sparks, level: after.level },
    };
  });
}

/**
 * Дава спътник на член. Админът може да надхвърли лимита на колекцията и
 * плана (това е целта — компенсация, награда от събитие); сезонността се
 * записва по текущия сезон както при улавяне. Първият спътник става активен.
 */
export async function grantCompanion(serverId, userId, companionId, { stage = 1, now = new Date() } = {}) {
  const c = companionById(companionId);
  if (!c) return { ok: false, code: "UNKNOWN_COMPANION" };
  if (!Number.isInteger(stage) || stage < 1 || stage > MAX_STAGE) return { ok: false, code: "INVALID_STAGE" };
  const season = await getCurrentSeason({ now });
  return prisma.$transaction(async (tx) => {
    await ensureProgress(tx, serverId, userId);
    const owned = await tx.memberCompanion.create({
      data: { serverId, userId, companionId: c.id, stage, seasonId: isSeasonal(c.id, season) ? season.code : null },
    });
    await tx.memberProgress.updateMany({ where: { serverId, userId, activeCompanionId: null }, data: { activeCompanionId: owned.id } });
    return { ok: true, owned, companion: publicCompanion(c, stage, season) };
  });
}

/**
 * Нулиране на играта на сървър.
 *  • "progress" — нива, XP, искри, спътници, размени и появи; настройките,
 *    магазинът и куестовете остават.
 *  • "all"      — и магазинът, куестовете, trivia и настройките (играта
 *    изключена, по подразбиране).
 * Покупките от магазина НЕ се трият в нито един режим: заданието за изтичане
 * чете снимката на ролята от тях и маха временните роли навреме. Изтрити, те
 * биха оставили ролите завинаги (FK към артикула е SET NULL — покупката оцелява).
 */
export async function resetServerGame(serverId, scope) {
  if (!["progress", "all"].includes(scope)) return { ok: false, code: "INVALID_SCOPE" };
  const ops = [
    prisma.companionTrade.deleteMany({ where: { serverId } }),
    prisma.companionSpawn.deleteMany({ where: { serverId } }),
    prisma.memberCompanion.deleteMany({ where: { serverId } }),
    prisma.gameXpGrant.deleteMany({ where: { serverId } }),
    prisma.memberProgress.deleteMany({ where: { serverId } }),
  ];
  if (scope === "all") {
    ops.push(
      prisma.triviaRound.deleteMany({ where: { serverId } }),       // отговорите падат с каскада
      prisma.serverQuest.deleteMany({ where: { serverId } }),       // приносите падат с каскада
      prisma.shopItem.deleteMany({ where: { serverId } }),          // покупките остават (SET NULL)
      prisma.gameSettings.deleteMany({ where: { serverId } }),
    );
  }
  const results = await prisma.$transaction(ops);
  const names = ["trades", "spawns", "companions", "xpGrants", "members", "triviaRounds", "quests", "shopItems", "settings"];
  const counts = Object.fromEntries(results.map((r, i) => [names[i], r.count]));
  return { ok: true, scope, counts };
}
