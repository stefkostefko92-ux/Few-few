// backend/src/lib/game/companionOps.js
// v50 — Server Season, етап 2: операциите със спътници върху базата. Всяка
// „надпревара" (улавяне, размяна, хранене) е ЕДНА транзакция с условен
// update — двама членове не могат да уловят една поява, а искрите не се вадят
// два пъти при двоен клик.
import { prisma } from "../prisma.js";
import { getServerTier } from "../premium.js";
import {
  companionById, pickSpawn, publicCompanion, stageForFed, STAGE_THRESHOLDS, MAX_STAGE, SPAWN_TTL_MS, SPAWN_MIN_INTERVAL_MS,
} from "./companions.js";

export const TRADE_TTL_MS = 10 * 60 * 1000;

/** Създава поява за канал, ако няма жива и е минал минималният интервал. */
export async function createSpawn(serverId, channelId, { now = new Date(), rand } = {}) {
  const tier = await getServerTier(serverId);
  const last = await prisma.companionSpawn.findFirst({ where: { serverId }, orderBy: { createdAt: "desc" } });
  if (last) {
    const alive = !last.caughtById && new Date(last.expiresAt) > now;
    if (alive) return { ok: false, code: "SPAWN_ACTIVE" };
    if (now.getTime() - new Date(last.createdAt).getTime() < SPAWN_MIN_INTERVAL_MS) return { ok: false, code: "SPAWN_TOO_SOON" };
  }
  const c = pickSpawn({ isPremium: !!tier.isPremium, now, rand });
  const spawn = await prisma.companionSpawn.create({
    data: { serverId, channelId, companionId: c.id, expiresAt: new Date(now.getTime() + SPAWN_TTL_MS) },
  });
  return { ok: true, spawn, companion: publicCompanion(c, 1) };
}

/**
 * Улавяне: първият печели. Условен update (caughtById IS NULL и не е изтекла)
 * → при count 0 някой е бил по-бърз или е изтекла. Лимитът на колекцията се
 * проверява ПРЕДИ да се маркира появата, за да не „изгори" появата за всички.
 */
export async function catchSpawn(spawnId, userId, { now = new Date() } = {}) {
  const spawn = await prisma.companionSpawn.findUnique({ where: { id: spawnId } });
  if (!spawn) return { ok: false, code: "SPAWN_NOT_FOUND" };
  if (spawn.caughtById) return { ok: false, code: "ALREADY_CAUGHT", by: spawn.caughtById };
  if (new Date(spawn.expiresAt) <= now) return { ok: false, code: "SPAWN_EXPIRED" };
  const tier = await getServerTier(spawn.serverId);
  const owned = await prisma.memberCompanion.count({ where: { serverId: spawn.serverId, userId } });
  if (owned >= tier.limits.companionSlots) return { ok: false, code: "COLLECTION_FULL", limit: tier.limits.companionSlots };
  return prisma.$transaction(async (tx) => {
    const r = await tx.companionSpawn.updateMany({
      where: { id: spawnId, caughtById: null, expiresAt: { gt: now } },
      data: { caughtById: userId, caughtAt: now },
    });
    if (r.count !== 1) return { ok: false, code: "ALREADY_CAUGHT" };
    const c = companionById(spawn.companionId);
    const owned = await tx.memberCompanion.create({
      data: { serverId: spawn.serverId, userId, companionId: spawn.companionId, seasonId: c?.seasonId || null },
    });
    // Първият уловен става активен автоматично.
    await tx.memberProgress.upsert({
      where: { serverId_userId: { serverId: spawn.serverId, userId } },
      update: {},
      create: { serverId: spawn.serverId, userId, activeCompanionId: owned.id },
    });
    await tx.memberProgress.updateMany({ where: { serverId: spawn.serverId, userId, activeCompanionId: null }, data: { activeCompanionId: owned.id } });
    return { ok: true, owned, companion: publicCompanion(c, 1) };
  });
}

/** Списъкът на член с публичните метаданни. */
export async function listOwned(serverId, userId) {
  const [rows, progress] = await Promise.all([
    prisma.memberCompanion.findMany({ where: { serverId, userId }, orderBy: { caughtAt: "asc" } }),
    prisma.memberProgress.findUnique({ where: { serverId_userId: { serverId, userId } }, select: { activeCompanionId: true, sparks: true } }),
  ]);
  return {
    sparks: progress?.sparks || 0,
    activeId: progress?.activeCompanionId || null,
    companions: rows.map((r, i) => ({ index: i + 1, ...r, ...publicCompanion(companionById(r.companionId), r.stage), nextStageAt: r.stage < MAX_STAGE ? STAGE_THRESHOLDS[r.stage] : null })),
  };
}

/** Хранене: вади искри условно, качва fed и формата. */
export async function feedCompanion(serverId, userId, ownedId, sparks) {
  const amount = Math.floor(Number(sparks));
  if (!(amount > 0)) return { ok: false, code: "INVALID_AMOUNT" };
  return prisma.$transaction(async (tx) => {
    const owned = await tx.memberCompanion.findFirst({ where: { id: ownedId, serverId, userId } });
    if (!owned) return { ok: false, code: "NOT_OWNED" };
    if (owned.stage >= MAX_STAGE) return { ok: false, code: "MAX_STAGE" };
    const dec = await tx.memberProgress.updateMany({ where: { serverId, userId, sparks: { gte: amount } }, data: { sparks: { decrement: amount } } });
    if (dec.count !== 1) {
      const p = await tx.memberProgress.findUnique({ where: { serverId_userId: { serverId, userId } }, select: { sparks: true } });
      return { ok: false, code: "NOT_ENOUGH_SPARKS", sparks: p?.sparks || 0 };
    }
    const fed = owned.fed + amount;
    const stage = stageForFed(fed);
    const updated = await tx.memberCompanion.update({ where: { id: owned.id }, data: { fed, stage } });
    const p = await tx.memberProgress.findUnique({ where: { serverId_userId: { serverId, userId } }, select: { sparks: true } });
    return { ok: true, owned: updated, evolved: stage > owned.stage, stage, sparksLeft: p?.sparks || 0, companion: publicCompanion(companionById(owned.companionId), stage) };
  });
}

export async function activateCompanion(serverId, userId, ownedId) {
  const owned = await prisma.memberCompanion.findFirst({ where: { id: ownedId, serverId, userId } });
  if (!owned) return { ok: false, code: "NOT_OWNED" };
  await prisma.memberProgress.upsert({
    where: { serverId_userId: { serverId, userId } },
    update: { activeCompanionId: owned.id },
    create: { serverId, userId, activeCompanionId: owned.id },
  });
  return { ok: true, owned, companion: publicCompanion(companionById(owned.companionId), owned.stage) };
}

export async function releaseCompanion(serverId, userId, ownedId) {
  const owned = await prisma.memberCompanion.findFirst({ where: { id: ownedId, serverId, userId } });
  if (!owned) return { ok: false, code: "NOT_OWNED" };
  await prisma.$transaction([
    prisma.memberCompanion.delete({ where: { id: owned.id } }),
    prisma.memberProgress.updateMany({ where: { serverId, userId, activeCompanionId: owned.id }, data: { activeCompanionId: null } }),
  ]);
  return { ok: true, companion: publicCompanion(companionById(owned.companionId), owned.stage) };
}

/** Предложение за размяна (10 min). Двете страни трябва да притежават посочените. */
export async function proposeTrade(serverId, fromUserId, toUserId, fromOwnedId, toOwnedId, { now = new Date() } = {}) {
  if (fromUserId === toUserId) return { ok: false, code: "SELF_TRADE" };
  const [mine, theirs] = await Promise.all([
    prisma.memberCompanion.findFirst({ where: { id: fromOwnedId, serverId, userId: fromUserId } }),
    prisma.memberCompanion.findFirst({ where: { id: toOwnedId, serverId, userId: toUserId } }),
  ]);
  if (!mine || !theirs) return { ok: false, code: "NOT_OWNED" };
  const pending = await prisma.companionTrade.count({ where: { serverId, status: "PENDING", expiresAt: { gt: now }, OR: [{ fromUserId }, { toUserId: fromUserId }] } });
  if (pending > 0) return { ok: false, code: "TRADE_PENDING" };
  const trade = await prisma.companionTrade.create({
    data: { serverId, fromUserId, toUserId, fromCompanionId: mine.id, toCompanionId: theirs.id, expiresAt: new Date(now.getTime() + TRADE_TTL_MS) },
  });
  return { ok: true, trade, mine: publicCompanion(companionById(mine.companionId), mine.stage), theirs: publicCompanion(companionById(theirs.companionId), theirs.stage) };
}

/** Приемане: само получателят; размяната на собствеността е в една транзакция с условни update-и. */
export async function resolveTrade(tradeId, userId, accept, { now = new Date() } = {}) {
  return prisma.$transaction(async (tx) => {
    const trade = await tx.companionTrade.findUnique({ where: { id: tradeId } });
    if (!trade) return { ok: false, code: "TRADE_NOT_FOUND" };
    if (trade.status !== "PENDING") return { ok: false, code: "TRADE_CLOSED", status: trade.status };
    if (new Date(trade.expiresAt) <= now) {
      await tx.companionTrade.update({ where: { id: trade.id }, data: { status: "EXPIRED", resolvedAt: now } });
      return { ok: false, code: "TRADE_EXPIRED" };
    }
    if (trade.toUserId !== userId) return { ok: false, code: "NOT_RECIPIENT" };
    if (!accept) {
      await tx.companionTrade.update({ where: { id: trade.id }, data: { status: "DECLINED", resolvedAt: now } });
      return { ok: true, status: "DECLINED" };
    }
    // Условно: спътниците трябва още да са при първоначалните собственици.
    const a = await tx.memberCompanion.updateMany({ where: { id: trade.fromCompanionId, userId: trade.fromUserId, serverId: trade.serverId }, data: { userId: trade.toUserId } });
    const b = await tx.memberCompanion.updateMany({ where: { id: trade.toCompanionId, userId: trade.toUserId, serverId: trade.serverId }, data: { userId: trade.fromUserId } });
    if (a.count !== 1 || b.count !== 1) throw Object.assign(new Error("TRADE_STALE"), { code: "TRADE_STALE" });
    // Активният спътник не пътува със собственика.
    await tx.memberProgress.updateMany({ where: { serverId: trade.serverId, userId: trade.fromUserId, activeCompanionId: trade.fromCompanionId }, data: { activeCompanionId: null } });
    await tx.memberProgress.updateMany({ where: { serverId: trade.serverId, userId: trade.toUserId, activeCompanionId: trade.toCompanionId }, data: { activeCompanionId: null } });
    await tx.companionTrade.update({ where: { id: trade.id }, data: { status: "ACCEPTED", resolvedAt: now } });
    return { ok: true, status: "ACCEPTED", trade };
  }).catch((err) => (err?.code === "TRADE_STALE" ? { ok: false, code: "TRADE_STALE" } : Promise.reject(err)));
}
