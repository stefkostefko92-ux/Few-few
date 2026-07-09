import { prisma } from "@aso/db";
import {
  ACHIEVEMENT_DEFS,
  QUEST_DEFS,
  achievementMet,
  dailyReward,
  leaderboardKey,
  levelFromXp,
  type AchievementStats,
  type AchievementView,
  type GameKey,
  type LeaderboardEntry,
  type QuestPeriod,
  type QuestView,
} from "@aso/shared";
import { redis } from "../redis.js";
import { logger } from "../logger.js";

const dayKey = (d = new Date()): string => d.toISOString().slice(0, 10);

/**
 * Daily-login claim: increments the streak (resets if a day was missed), grants
 * the streak reward once per UTC day. Idempotent per day via lastSeenAt marker
 * stored in Redis (`daily:<userId>` = yyyy-mm-dd).
 */
export async function claimDaily(userId: string): Promise<{
  claimed: boolean;
  streak: number;
  chips: number;
  gems: number;
}> {
  const today = dayKey();
  const streakKey = `daily:streak:${userId}`;
  const lastKey = `daily:last:${userId}`;

  // Atomic claim: only the first request for today's key wins, so concurrent
  // POSTs can't double-credit. SET NX returns null if the key already existed.
  const won = await redis.set(`daily:claim:${userId}:${today}`, "1", "EX", 60 * 60 * 48, "NX");
  if (won === null) {
    const streak = Number((await redis.get(streakKey)) ?? 1);
    return { claimed: false, streak, chips: 0, gems: 0 };
  }

  const yesterday = dayKey(new Date(Date.now() - 86_400_000));
  const last = await redis.get(lastKey);
  const prevStreak = Number((await redis.get(streakKey)) ?? 0);
  const streak = last === yesterday ? Math.min(prevStreak + 1, 7) : 1;

  const reward = dailyReward(streak);
  await prisma.user.update({
    where: { id: userId },
    data: { chips: { increment: BigInt(reward.chips) }, gems: { increment: reward.gems } },
  });
  const week = 60 * 60 * 24 * 8;
  await redis.set(lastKey, today, "EX", week);
  await redis.set(streakKey, String(streak), "EX", week);
  return { claimed: true, streak, ...reward };
}

/** Ensure today's/this-week's quest rows exist for a user, returning their views. */
export async function ensureQuests(userId: string): Promise<QuestView[]> {
  const periods: QuestPeriod[] = ["daily", "weekly"];
  const periodKey = (p: QuestPeriod): string =>
    p === "daily" ? `d:${dayKey()}` : `w:${isoWeek()}`;

  const defs = QUEST_DEFS;
  const views: QuestView[] = [];
  for (const def of defs) {
    const period = periodKey(def.period);
    // Upsert against the unique (userId,key,period) so concurrent callers can't
    // create duplicate quest rows.
    const row = await prisma.quest.upsert({
      where: { userId_key_period: { userId, key: def.key, period } },
      create: { userId, key: def.key, period, progress: 0, target: def.target },
      update: {},
    });
    views.push({
      key: def.key,
      period: def.period,
      progress: row.progress,
      target: row.target,
      completed: row.completedAt !== null,
      rewardChips: def.rewardChips,
      rewardXp: def.rewardXp,
    });
  }
  void periods;
  return views;
}

/**
 * Advance quests after a finished match. Called by the realtime server via an
 * internal endpoint. Grants rewards on completion (chips/xp), updates the
 * per-game leaderboard ZSET with the new rating.
 */
export async function recordMatchResult(opts: {
  matchId: string;
  userId: string;
  game: GameKey;
  won: boolean;
  rating: number;
  displayName: string;
}): Promise<void> {
  const { matchId, userId, game, won, rating } = opts;

  // Idempotency: process each (match, user) exactly once. A retry or a double
  // finish must not re-advance quests/streaks/achievements. SETNX returns null
  // if the key already existed.
  try {
    const first = await redis.set(`progression:done:${matchId}:${userId}`, "1", "EX", 60 * 60 * 24 * 3, "NX");
    if (first === null) return;
  } catch (err) {
    // Quest progress isn't transactionally idempotent, so without the SETNX
    // guard a retry could double-grant chips/XP. Fail CLOSED: skip progression
    // for this match rather than risk awarding it twice. (MMR + match chips are
    // separately protected by the DB endedAt claim in rating.ts.)
    logger.warn({ err, matchId, userId }, "progression idempotency store unavailable — skipping");
    return;
  }

  // Update leaderboard ZSET (rating as score).
  await redis.zadd(leaderboardKey(game), rating, userId);

  await ensureQuests(userId);
  for (const def of QUEST_DEFS) {
    if (def.trigger === "win" && !won) continue;
    if (def.game && def.game !== game) continue;
    const period = def.period === "daily" ? `d:${dayKey()}` : `w:${isoWeek()}`;
    const row = await prisma.quest.findFirst({ where: { userId, key: def.key, period } });
    if (!row || row.completedAt) continue;

    const progress = row.progress + 1;
    const completed = progress >= row.target;
    await prisma.quest.update({
      where: { id: row.id },
      data: { progress, completedAt: completed ? new Date() : null },
    });
    if (completed) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          chips: { increment: BigInt(def.rewardChips) },
          xp: { increment: def.rewardXp },
        },
      });
    }
  }

  await evaluateAchievements(userId, game, won);
}

/** Track the live win streak in Redis (resets on a loss, expires after a month). */
async function updateWinStreak(userId: string, won: boolean): Promise<number> {
  const key = `winstreak:${userId}`;
  let streak = 0;
  try {
    if (won) {
      streak = await redis.incr(key);
    } else {
      await redis.set(key, "0");
    }
    await redis.expire(key, 60 * 60 * 24 * 30);
  } catch {
    /* presence/streak is best-effort */
  }
  return streak;
}

/**
 * Award any newly-earned achievements after a match. Cumulative stats come from
 * RatingPerGame (already updated for this match by the realtime finalizer) plus
 * the live win streak. Each unlock grants gems and drops an in-app notification.
 */
async function evaluateAchievements(userId: string, _game: GameKey, won: boolean): Promise<void> {
  const winStreak = await updateWinStreak(userId, won);

  const [ratings, user, owned] = await Promise.all([
    prisma.ratingPerGame.findMany({ where: { userId } }),
    prisma.user.findUnique({ where: { id: userId }, select: { xp: true } }),
    prisma.achievement.findMany({ where: { userId }, select: { key: true } }),
  ]);

  const gameWins: Partial<Record<GameKey, number>> = {};
  let totalWins = 0;
  let totalGames = 0;
  for (const r of ratings) {
    totalWins += r.wins;
    totalGames += r.games;
    gameWins[r.game] = r.wins;
  }
  const stats: AchievementStats = {
    totalWins,
    totalGames,
    winStreak,
    level: levelFromXp(user?.xp ?? 0).level,
    gameWins,
  };

  const have = new Set(owned.map((a) => a.key));
  for (const def of ACHIEVEMENT_DEFS) {
    if (have.has(def.key) || !achievementMet(def, stats)) continue;
    try {
      // Unlock, gem grant, and notification are one atomic unit; the unique
      // (userId,key) makes the whole thing idempotent (a re-run throws on
      // create and rolls back, so gems are never double-granted).
      await prisma.$transaction(async (tx) => {
        await tx.achievement.create({ data: { userId, key: def.key } });
        if (def.rewardGems > 0) {
          await tx.user.update({ where: { id: userId }, data: { gems: { increment: def.rewardGems } } });
        }
        await tx.notification.create({
          data: { userId, type: "achievement", data: JSON.stringify({ key: def.key, title: def.title }) },
        });
      });
    } catch {
      continue; // unique race — already unlocked
    }
  }
}

/** All achievements with the user's unlock status (for the profile). */
export async function getAchievements(userId: string): Promise<AchievementView[]> {
  const rows = await prisma.achievement.findMany({ where: { userId } });
  const at = new Map(rows.map((r) => [r.key, r.unlockedAt]));
  return ACHIEVEMENT_DEFS.map((d) => ({
    key: d.key,
    title: d.title,
    description: d.description,
    icon: d.icon,
    tier: d.tier,
    rewardGems: d.rewardGems,
    unlocked: at.has(d.key),
    unlockedAt: at.get(d.key)?.toISOString() ?? null,
  }));
}

/** Top-N leaderboard for a game, resolved against display names. */
export async function leaderboard(game: GameKey, limit = 20): Promise<LeaderboardEntry[]> {
  const raw = await redis.zrevrange(leaderboardKey(game), 0, limit - 1, "WITHSCORES");
  const ids: string[] = [];
  const scores: number[] = [];
  for (let i = 0; i < raw.length; i += 2) {
    ids.push(raw[i] as string);
    scores.push(Number(raw[i + 1]));
  }
  if (ids.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, displayName: true },
  });
  const nameById = new Map(users.map((u) => [u.id, u.displayName]));
  return ids.map((id, i) => ({
    rank: i + 1,
    userId: id,
    displayName: nameById.get(id) ?? "—",
    rating: scores[i] ?? 0,
  }));
}

export function profileProgress(xp: number): ReturnType<typeof levelFromXp> {
  return levelFromXp(xp);
}

function isoWeek(d = new Date()): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((date.getTime() - firstThursday.getTime()) / 86_400_000 -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7,
    );
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
