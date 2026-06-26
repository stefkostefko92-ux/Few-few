import { prisma, type GameKey } from "@aso/db";
import { logger } from "../logger.js";

/**
 * Collusion heuristics (§13.5). We look for account PAIRS that meet often in the
 * same matches with a suspiciously skewed head-to-head outcome — a signature of
 * one account dumping chips/rating to another. We only WRITE FLAGS for a
 * moderator to review; never an automatic ban (§13.5).
 *
 * Heuristic: among pairs with >= MIN_GAMES shared matches, flag those where one
 * side wins a fraction outside [0.5 - SKEW, 0.5 + SKEW]. Severity scales with
 * how extreme the skew is and how many games were played.
 */

export const MIN_GAMES = 8;
export const SKEW = 0.3; // flag if winrate <20% or >80%
const LOOKBACK_DAYS = 14;

/** Pure: should a head-to-head record be flagged, and at what severity? */
export function assessPair(total: number, aWins: number): { flag: boolean; score: number } {
  if (total < MIN_GAMES) return { flag: false, score: 0 };
  const aRate = aWins / total;
  const skew = Math.abs(aRate - 0.5);
  if (skew < SKEW) return { flag: false, score: 0 };
  const score = Math.min(1, (skew / 0.5) * Math.min(total / 30, 1) + 0.2);
  return { flag: true, score };
}

interface PairStat {
  a: string;
  b: string;
  game: GameKey;
  total: number;
  aWins: number;
}

export async function detectCollusion(): Promise<number> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  // Pull recent finished matches with their human players + results.
  const matches = await prisma.match.findMany({
    where: { endedAt: { not: null, gte: since } },
    select: {
      game: true,
      players: { select: { userId: true, result: true } },
    },
  });

  // Accumulate per-pair, per-game head-to-head stats (2-player matches only,
  // where "win/loss" is unambiguous between exactly two humans).
  const pairs = new Map<string, PairStat>();
  for (const m of matches) {
    const humans = m.players.filter((p) => p.userId);
    if (humans.length !== 2) continue;
    const [p0, p1] = humans as [(typeof humans)[number], (typeof humans)[number]];
    if (!p0.result || !p1.result) continue;

    // Order the pair deterministically so A/B is stable.
    const [a, b] = p0.userId! < p1.userId! ? [p0, p1] : [p1, p0];
    const key = `${m.game}:${a.userId}:${b.userId}`;
    const stat = pairs.get(key) ?? { a: a.userId!, b: b.userId!, game: m.game, total: 0, aWins: 0 };
    stat.total += 1;
    if (a.result === "win") stat.aWins += 1;
    pairs.set(key, stat);
  }

  let flagged = 0;
  for (const stat of pairs.values()) {
    const { flag, score } = assessPair(stat.total, stat.aWins);
    if (!flag) continue;
    const details = JSON.stringify({
      total: stat.total,
      aWins: stat.aWins,
      aRate: stat.aWins / stat.total,
    });

    // Upsert-style: skip if an OPEN flag for this pair+game already exists.
    const existing = await prisma.collusionFlag.findFirst({
      where: { game: stat.game, userAId: stat.a, userBId: stat.b, status: "OPEN" },
    });
    if (existing) {
      await prisma.collusionFlag.update({ where: { id: existing.id }, data: { score, details } });
    } else {
      await prisma.collusionFlag.create({
        data: {
          game: stat.game,
          userAId: stat.a,
          userBId: stat.b,
          reason: "skewed_h2h",
          score,
          details,
        },
      });
      flagged += 1;
    }
  }

  if (flagged > 0) logger.info({ flagged }, "collusion: new flags raised");
  return flagged;
}
