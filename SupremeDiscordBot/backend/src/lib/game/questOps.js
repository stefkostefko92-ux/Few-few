// backend/src/lib/game/questOps.js
// v50 — Server Season, етап 3: куестовете в базата. Принос → напредък →
// завършване като НАДПРЕВАРА (условен updateMany ACTIVE→COMPLETED — само
// един принос „затваря“), награди в транзакция, изтичане от scheduler-а.
// Ботът се известява през notifyBot("GAME_QUEST", { event, … }) — динамичен
// import, за да не се тегли botNotifier в чистите тестове.
import { prisma } from "../prisma.js";
import { getServerTier } from "../premium.js";
import { createWithinLimit } from "../withinLimit.js";
import { getGameSettings } from "./xp.js";
import { pickSpawn, publicCompanion } from "./companions.js";
import { getCurrentSeason } from "./seasons.js";
import { QUEST_TYPES, QUEST_DURATION_MS, questTypeForWeek, targetFor, splitRewards, publicQuest } from "./quests.js";

async function notify(event, payload) {
  try {
    const { notifyBot } = await import("../../services/botNotifier.js");
    return await notifyBot("GAME_QUEST", { event, ...payload });
  } catch { return null; }
}

/**
 * Гарантира седмичен куест за сървъра: само когато играта и куестовете са
 * включени и НЯМА жив куест (ръчните от таблото също броят — не трупаме).
 */
export async function ensureWeeklyQuest(serverId, now = new Date()) {
  const settings = await getGameSettings(serverId);
  if (!settings.enabled || !settings.questEnabled) return { ok: false, code: "QUESTS_DISABLED" };
  const active = await prisma.serverQuest.count({ where: { serverId, status: "ACTIVE", endsAt: { gt: now } } });
  if (active > 0) return { ok: false, code: "QUEST_ACTIVE" };
  const players = await prisma.memberProgress.count({ where: { serverId } });
  const type = questTypeForWeek(now);
  const quest = await prisma.serverQuest.create({
    data: {
      serverId, type, target: targetFor(type, players), rewardSparks: QUEST_TYPES[type].reward, status: "ACTIVE",
      startsAt: now, endsAt: new Date(now.getTime() + QUEST_DURATION_MS), channelId: settings.questChannelId || null,
    },
  });
  await notify("STARTED", { serverId, quest: publicQuest(quest) });
  return { ok: true, quest, created: true };
}

/** Ръчен куест от таблото — в лимита activeQuests на tier-а (Free 1 · Premium 3). */
export async function createQuest(serverId, { type, target, rewardSparks, days }, now = new Date()) {
  if (!QUEST_TYPES[type]) return { ok: false, code: "INVALID_TYPE" };
  const settings = await getGameSettings(serverId);
  const tier = await getServerTier(serverId);
  const result = await createWithinLimit({
    model: "serverQuest",
    where: { serverId, status: "ACTIVE", endsAt: { gt: now } },
    limit: tier.limits.activeQuests,
    create: (tx) => tx.serverQuest.create({
      data: {
        serverId, type, target, rewardSparks: rewardSparks ?? QUEST_TYPES[type].reward, status: "ACTIVE",
        startsAt: now, endsAt: new Date(now.getTime() + Math.max(1, days) * 86_400_000), channelId: settings.questChannelId || null,
      },
    }),
  });
  if (!result.ok) return { ok: false, code: "LIMIT_REACHED", limit: tier.limits.activeQuests, count: result.count };
  await notify("STARTED", { serverId, quest: publicQuest(result.row) });
  return { ok: true, quest: result.row };
}

/**
 * Принос към всички живи куестове от този тип в сървъра.
 * @param {{userId:string, amount:number}[]} entries — партида (xp-batch дава много потребители наведнъж)
 * @returns {Promise<{ updated: object[], completed: object[] }>}
 */
export async function contribute(serverId, type, entries, now = new Date()) {
  const list = (entries || []).filter((e) => e && /^\d{17,20}$/.test(String(e.userId)) && Math.floor(e.amount) > 0);
  const out = { updated: [], completed: [] };
  if (!list.length || !QUEST_TYPES[type]) return out;
  const quests = (await prisma.serverQuest.findMany({ where: { serverId, type, status: "ACTIVE", endsAt: { gt: now } } })) || [];
  for (const q of quests) {
    let total = 0;
    for (const e of list) {
      const amount = Math.floor(e.amount);
      total += amount;
      await prisma.questContribution.upsert({
        where: { questId_userId: { questId: q.id, userId: String(e.userId) } },
        update: { amount: { increment: amount } },
        create: { questId: q.id, userId: String(e.userId), amount },
      });
    }
    await prisma.serverQuest.updateMany({ where: { id: q.id, status: "ACTIVE" }, data: { progress: { increment: total } } });
    const fresh = await prisma.serverQuest.findUnique({ where: { id: q.id } });
    if (!fresh) continue;
    if (fresh.progress >= fresh.target) {
      // Надпревара: само една партида затваря куеста и раздава наградите.
      const won = await prisma.serverQuest.updateMany({ where: { id: q.id, status: "ACTIVE" }, data: { status: "COMPLETED" } });
      if (won.count === 1) {
        const reward = await rewardQuest({ ...fresh, status: "COMPLETED" });
        const pq = publicQuest({ ...fresh, status: "COMPLETED" });
        out.completed.push({ quest: pq, ...reward });
        await notify("COMPLETED", { serverId, quest: pq, ...reward });
        continue;
      }
    }
    out.updated.push(publicQuest(fresh));
  }
  if (out.updated.length) await notify("PROGRESS", { serverId, quests: out.updated });
  return out;
}

/**
 * Наградите: искри на всеки принесъл (топ ×2) + спътник за топа, ако има
 * свободен слот. Идемпотентно по rewardedAt (условен updateMany).
 */
export async function rewardQuest(quest) {
  const claim = await prisma.serverQuest.updateMany({ where: { id: quest.id, rewardedAt: null }, data: { rewardedAt: new Date() } });
  if (claim.count !== 1) return { rewards: [], chest: null, alreadyRewarded: true };
  const contributions = (await prisma.questContribution.findMany({ where: { questId: quest.id }, orderBy: { amount: "desc" } })) || [];
  const { rewards, topUserId } = splitRewards(contributions, quest.rewardSparks);
  for (const r of rewards) {
    await prisma.memberProgress.upsert({
      where: { serverId_userId: { serverId: quest.serverId, userId: r.userId } },
      update: { sparks: { increment: r.sparks } },
      create: { serverId: quest.serverId, userId: r.userId, sparks: r.sparks },
    });
  }
  let chest = null;
  if (topUserId) {
    const tier = await getServerTier(quest.serverId);
    const owned = await prisma.memberCompanion.count({ where: { serverId: quest.serverId, userId: topUserId } });
    let companion = null;
    if (owned < tier.limits.companionSlots) {
      const season = await getCurrentSeason();
      const c = pickSpawn({ isPremium: !!tier.isPremium, season });
      const pc = publicCompanion(c, 1, season);
      await prisma.memberCompanion.create({ data: { serverId: quest.serverId, userId: topUserId, companionId: c.id, seasonId: pc.seasonId } });
      companion = pc;
    }
    chest = { userId: topUserId, sparks: rewards.find((r) => r.userId === topUserId)?.sparks || 0, companion };
  }
  return { rewards, chest };
}

/** Живите куестове на сървър с приносa на един член (за /quest). */
export async function activeQuests(serverId, userId = null, now = new Date()) {
  const quests = (await prisma.serverQuest.findMany({ where: { serverId, status: "ACTIVE", endsAt: { gt: now } }, orderBy: { endsAt: "asc" } })) || [];
  const out = [];
  for (const q of quests) {
    let mine = 0;
    if (userId) {
      const c = await prisma.questContribution.findUnique({ where: { questId_userId: { questId: q.id, userId } } }).catch(() => null);
      mine = c?.amount || 0;
    }
    out.push(publicQuest(q, { mine }));
  }
  return out;
}

/** Изтекли живи куестове → FAILED (или COMPLETED, ако целта е стигната без затваряне). */
export async function expireQuests(now = new Date()) {
  const due = (await prisma.serverQuest.findMany({ where: { status: "ACTIVE", endsAt: { lte: now } }, take: 200 })) || [];
  let failed = 0, completed = 0;
  for (const q of due) {
    if (q.progress >= q.target) {
      const won = await prisma.serverQuest.updateMany({ where: { id: q.id, status: "ACTIVE" }, data: { status: "COMPLETED" } });
      if (won.count !== 1) continue;
      const reward = await rewardQuest({ ...q, status: "COMPLETED" });
      await notify("COMPLETED", { serverId: q.serverId, quest: publicQuest({ ...q, status: "COMPLETED" }), ...reward });
      completed++;
      continue;
    }
    const lost = await prisma.serverQuest.updateMany({ where: { id: q.id, status: "ACTIVE" }, data: { status: "FAILED" } });
    if (lost.count !== 1) continue;
    await notify("FAILED", { serverId: q.serverId, quest: publicQuest({ ...q, status: "FAILED" }) });
    failed++;
  }
  return { failed, completed };
}

/** Отказ от таблото — куестът спира без награди. */
export async function cancelQuest(serverId, questId) {
  const q = await prisma.serverQuest.findFirst({ where: { id: questId, serverId } });
  if (!q) return { ok: false, code: "NOT_FOUND" };
  if (q.status !== "ACTIVE") return { ok: false, code: "NOT_ACTIVE" };
  const r = await prisma.serverQuest.updateMany({ where: { id: q.id, status: "ACTIVE" }, data: { status: "FAILED" } });
  if (r.count !== 1) return { ok: false, code: "NOT_ACTIVE" };
  await notify("FAILED", { serverId, quest: publicQuest({ ...q, status: "FAILED" }), cancelled: true });
  return { ok: true };
}
