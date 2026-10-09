// backend/src/lib/game/battleOps.js
// v53 — тренировката на статистиките и битките върху базата. Правилата и
// симулаторът са в battles.js (чист модул); тук са транзакциите, охлажданията
// и дневните лимити. Всяка надпревара (двоен клик, две атаки наведнъж, двама
// срещу един) е ЕДНА транзакция със заключени редове и условни update-и.
//
// Срещу тормоз и ферми: загубилият не губи нищо; нападателят има охлаждане,
// дневен брой атаки и същия противник само веднъж на час; загубилият защита
// получава щит; наградата е с дневен таван и е нула срещу много по-слаб; всеки
// може да се махне от битките с `/companion pvp off` (но не веднага след като
// сам е нападнал).
import { randomInt } from "node:crypto";
import { prisma } from "../prisma.js";
import { companionById, publicCompanion, MAX_STAGE } from "./companions.js";
import { getCurrentSeason } from "./seasons.js";
import { ensureProgress } from "./xp.js";
import {
  STAT_KEYS, STAT_COLUMN, STAT_CAP, trainCost, statSheet, effectiveStats, levelsOf, simulateBattle, winReward,
} from "./battles.js";

export const ATTACK_COOLDOWN_MS = 5 * 60 * 1000;   // между две твои атаки
export const PAIR_COOLDOWN_MS = 60 * 60 * 1000;    // същия противник — веднъж на час
export const SHIELD_MS = 30 * 60 * 1000;           // щит след загубена защита
export const DAILY_ATTACKS = 15;                   // атаки за 24 ч
export const DAILY_REWARDED_WINS = 5;              // победи с награда за 24 ч
export const PVP_LOCK_MS = 60 * 60 * 1000;         // „pvp off“ не минава до час след твоя атака
const DAY_MS = 24 * 60 * 60 * 1000;

const ago = (now, ms) => new Date(now.getTime() - ms);
const left = (now, since, ms) => Math.max(1000, new Date(since).getTime() + ms - now.getTime());

/**
 * Тренировка: +1 ниво на една статистика срещу искри. Цената се вади условно
 * (стига ли), а нивото се вдига условно по ВИДЯНОТО ниво — двоен клик не плаща
 * два пъти за едно ниво и не прескача тавана (вторият получава BUSY и искрите
 * му се връщат с отката на транзакцията).
 */
export async function trainStat(serverId, userId, ownedId, stat) {
  if (!STAT_KEYS.includes(stat)) return { ok: false, code: "INVALID_STAT" };
  const col = STAT_COLUMN[stat];
  const season = await getCurrentSeason();
  return prisma.$transaction(async (tx) => {
    const owned = await tx.memberCompanion.findFirst({ where: { id: ownedId, serverId, userId } });
    if (!owned) return { ok: false, code: "NOT_OWNED" };
    const level = owned[col] || 0;
    const cap = STAT_CAP[owned.stage] || STAT_CAP[1];
    if (level >= cap) return { ok: false, code: owned.stage >= MAX_STAGE ? "STAT_MAXED" : "STAT_CAP", stat, cap, stage: owned.stage };
    const cost = trainCost(level);
    const dec = await tx.memberProgress.updateMany({ where: { serverId, userId, sparks: { gte: cost } }, data: { sparks: { decrement: cost } } });
    if (dec.count !== 1) {
      const p = await tx.memberProgress.findUnique({ where: { serverId_userId: { serverId, userId } }, select: { sparks: true } });
      return { ok: false, code: "NOT_ENOUGH_SPARKS", sparks: p?.sparks || 0, cost };
    }
    const up = await tx.memberCompanion.updateMany({ where: { id: owned.id, serverId, userId, [col]: level }, data: { [col]: { increment: 1 } } });
    if (up.count !== 1) throw Object.assign(new Error("TRAIN_RACE"), { code: "TRAIN_RACE" });
    const row = await tx.memberCompanion.findUnique({ where: { id: owned.id } });
    const p = await tx.memberProgress.findUnique({ where: { serverId_userId: { serverId, userId } }, select: { sparks: true } });
    return {
      ok: true, stat, level: level + 1, cost, sparksLeft: p?.sparks || 0,
      sheet: statSheet(row), companion: publicCompanion(companionById(row.companionId), row.stage, season),
    };
  }).catch((err) => (err?.code === "TRAIN_RACE" ? { ok: false, code: "BUSY" } : Promise.reject(err)));
}

/**
 * „Не ме нападай“ (`enabled: false`) и обратно. Изключване не минава до час
 * след собствена атака — иначе нападаш и веднага се скриваш от отговора.
 * В транзакция със заключен ред, за да не се разминава с атака в същия миг.
 */
export async function setPvp(serverId, userId, enabled, { now = new Date() } = {}) {
  if (typeof enabled !== "boolean") return { ok: false, code: "INVALID" };
  return prisma.$transaction(async (tx) => {
    await ensureProgress(tx, serverId, userId);
    await tx.memberProgress.update({ where: { serverId_userId: { serverId, userId } }, data: { updatedAt: now } }); // заключва реда
    if (!enabled) {
      const recent = await tx.companionBattle.findFirst({
        where: { serverId, attackerId: userId, createdAt: { gt: ago(now, PVP_LOCK_MS) } },
        orderBy: { createdAt: "desc" }, select: { createdAt: true },
      });
      if (recent) return { ok: false, code: "PVP_LOCKED", retryInMs: left(now, recent.createdAt, PVP_LOCK_MS) };
    }
    await tx.memberProgress.update({ where: { serverId_userId: { serverId, userId } }, data: { pvpOptOut: !enabled } });
    return { ok: true, enabled };
  });
}

/**
 * Атака: активният спътник на нападателя срещу активния на защитника.
 * Двата реда с напредъка се заключват в стабилен ред (по userId) — две атаки
 * наведнъж минават една след друга и втората вижда охлаждането/щита на
 * първата, без deadlock. Ред за защитник, който не играе, НЕ се създава.
 * `seed` е само за тестовете — маршрутът никога не го приема от клиента.
 */
export async function attack(serverId, attackerId, defenderId, { now = new Date(), seed } = {}) {
  if (attackerId === defenderId) return { ok: false, code: "SELF" };
  const season = await getCurrentSeason();
  return prisma.$transaction(async (tx) => {
    const defExists = await tx.memberProgress.findUnique({ where: { serverId_userId: { serverId, userId: defenderId } }, select: { id: true } });
    if (!defExists) return { ok: false, code: "TARGET_NO_COMPANION" };
    await ensureProgress(tx, serverId, attackerId);
    for (const uid of [attackerId, defenderId].sort()) {
      await tx.memberProgress.update({ where: { serverId_userId: { serverId, userId: uid } }, data: { updatedAt: now } }); // заключва реда
    }
    const atkP = await tx.memberProgress.findUnique({ where: { serverId_userId: { serverId, userId: attackerId } } });
    const defP = await tx.memberProgress.findUnique({ where: { serverId_userId: { serverId, userId: defenderId } } });
    if (atkP.pvpOptOut) return { ok: false, code: "PVP_OFF_SELF" };
    if (defP.pvpOptOut) return { ok: false, code: "TARGET_PVP_OFF" };
    const mine = atkP.activeCompanionId
      ? await tx.memberCompanion.findFirst({ where: { id: atkP.activeCompanionId, serverId, userId: attackerId } }) : null;
    if (!mine) return { ok: false, code: "NO_ACTIVE" };
    const theirs = defP.activeCompanionId
      ? await tx.memberCompanion.findFirst({ where: { id: defP.activeCompanionId, serverId, userId: defenderId } }) : null;
    if (!theirs) return { ok: false, code: "TARGET_NO_COMPANION" };

    // Охлаждания и лимити — от записите на битките за последните 24 ч (най-много DAILY_ATTACKS реда).
    const recent = await tx.companionBattle.findMany({
      where: { serverId, attackerId, createdAt: { gt: ago(now, DAY_MS) } },
      orderBy: { createdAt: "desc" }, select: { defenderId: true, createdAt: true, rewardSparks: true },
    });
    if (recent[0] && now - new Date(recent[0].createdAt) < ATTACK_COOLDOWN_MS) {
      return { ok: false, code: "COOLDOWN", retryInMs: left(now, recent[0].createdAt, ATTACK_COOLDOWN_MS) };
    }
    if (recent.length >= DAILY_ATTACKS) {
      return { ok: false, code: "DAILY_LIMIT", limit: DAILY_ATTACKS, retryInMs: left(now, recent[DAILY_ATTACKS - 1].createdAt, DAY_MS) };
    }
    const pair = recent.find((b) => b.defenderId === defenderId && now - new Date(b.createdAt) < PAIR_COOLDOWN_MS);
    if (pair) return { ok: false, code: "PAIR_COOLDOWN", retryInMs: left(now, pair.createdAt, PAIR_COOLDOWN_MS) };
    const lost = await tx.companionBattle.findFirst({
      where: { serverId, defenderId, attackerWon: true, createdAt: { gt: ago(now, SHIELD_MS) } },
      orderBy: { createdAt: "desc" }, select: { createdAt: true },
    });
    if (lost) return { ok: false, code: "SHIELD", retryInMs: left(now, lost.createdAt, SHIELD_MS) };

    const a = effectiveStats(mine.companionId, mine.stage, levelsOf(mine));
    const d = effectiveStats(theirs.companionId, theirs.stage, levelsOf(theirs));
    if (!a || !d) return { ok: false, code: "UNKNOWN_COMPANION" };
    const battleSeed = Number.isInteger(seed) ? seed : randomInt(0, 2 ** 31 - 1);
    const fight = simulateBattle(a, d, battleSeed);
    const attackerWon = fight.winner === "attacker";

    let reward = { tier: null, sparks: 0, capped: false };
    if (attackerWon) {
      const r = winReward(a.power, d.power);
      const rewardedToday = recent.filter((b) => b.rewardSparks > 0).length;
      const capped = r.sparks > 0 && rewardedToday >= DAILY_REWARDED_WINS;
      reward = { tier: r.tier, sparks: capped ? 0 : r.sparks, capped };
    }

    const battle = await tx.companionBattle.create({
      data: {
        serverId, attackerId, defenderId,
        attackerOwnedId: mine.id, defenderOwnedId: theirs.id,
        attackerCompanionId: mine.companionId, defenderCompanionId: theirs.companionId,
        attackerStats: a, defenderStats: d, attackerWon, turns: fight.turns, seed: battleSeed, rewardSparks: reward.sparks,
      },
    });
    await tx.memberCompanion.update({ where: { id: mine.id }, data: attackerWon ? { wins: { increment: 1 } } : { losses: { increment: 1 } } });
    await tx.memberCompanion.update({ where: { id: theirs.id }, data: attackerWon ? { losses: { increment: 1 } } : { wins: { increment: 1 } } });
    let sparksLeft = atkP.sparks;
    if (reward.sparks > 0) {
      const p = await tx.memberProgress.update({ where: { serverId_userId: { serverId, userId: attackerId } }, data: { sparks: { increment: reward.sparks } } });
      sparksLeft = p.sparks;
    }
    return {
      ok: true,
      battleId: battle.id,
      seed: battleSeed,
      winner: fight.winner,
      turns: fight.turns,
      events: fight.events,
      reward,
      rewardLimit: DAILY_REWARDED_WINS,
      sparksLeft,
      attacksLeft: Math.max(0, DAILY_ATTACKS - recent.length - 1),
      attacker: { userId: attackerId, ownedId: mine.id, stage: mine.stage, stats: a, hpLeft: fight.hpA, companion: publicCompanion(companionById(mine.companionId), mine.stage, season) },
      defender: { userId: defenderId, ownedId: theirs.id, stage: theirs.stage, stats: d, hpLeft: fight.hpB, companion: publicCompanion(companionById(theirs.companionId), theirs.stage, season) },
    };
  });
}
