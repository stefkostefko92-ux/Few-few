import { prisma } from "@aso/db";
import {
  QUEST_DEFS,
  dailyReward,
  leaderboardKey,
  levelFromXp,
  type GameKey,
  type LeaderboardEntry,
  type QuestPeriod,
  type QuestView,
} from "@aso/shared";
import { redis } from "../redis.js";

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
  const markerKey = `daily:${userId}`;
  const streakKey = `daily:streak:${userId}`;
  const last = await redis.get(markerKey);
  if (last === today) {
    const streak = Number((await redis.get(streakKey)) ?? 1);
    return { claimed: false, streak, chips: 0, gems: 0 };
  }

  const yesterday = dayKey(new Date(Date.now() - 86_400_000));
  const prevStreak = Number((await redis.get(streakKey)) ?? 0);
  const streak = last === yesterday ? Math.min(prevStreak + 1, 7) : 1;

  const reward = dailyReward(streak);
  await prisma.user.update({
    where: { id: userId },
    data: { chips: { increment: BigInt(reward.chips) }, gems: { increment: reward.gems } },
  });
  await redis.set(markerKey, today, "EX", 60 * 60 * 48);
  await redis.set(streakKey, String(streak), "EX", 60 * 60 * 48);
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
    const existing = await prisma.quest.findFirst({
      where: { userId, key: def.key, period },
    });
    const row =
      existing ??
      (await prisma.quest.create({
        data: { userId, key: def.key, period, progress: 0, target: def.target },
      }));
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
  userId: string;
  game: GameKey;
  won: boolean;
  rating: number;
  displayName: string;
}): Promise<void> {
  const { userId, game, won, rating } = opts;

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
