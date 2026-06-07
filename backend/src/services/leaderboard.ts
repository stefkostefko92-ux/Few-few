import type { Redis } from "ioredis";
import type { Player } from "../domain/types.js";

export interface LeaderboardEntry {
  playerId: string;
  name: string;
  score: number;
  rank: number;
}

/**
 * Leaderboard abstraction (GDD §7.2). Production uses Redis sorted sets for
 * O(log n) ranking across hundreds of thousands of players; tests use the no-op
 * implementation so game logic doesn't depend on Redis being up.
 */
export interface Leaderboard {
  /** Record/refresh a player's score (their coin balance). */
  report(player: Player): Promise<void>;
  /** Top N players, highest score first. */
  top(n: number): Promise<LeaderboardEntry[]>;
  /** A single player's 1-based rank, or null if not ranked. */
  rankOf(playerId: string): Promise<number | null>;
}

/** Default no-op leaderboard — used when Redis isn't configured. */
export const noopLeaderboard: Leaderboard = {
  async report() {},
  async top() {
    return [];
  },
  async rankOf() {
    return null;
  },
};

const ZSET_KEY = "lb:global:coins";
const NAME_KEY = "lb:names";

/** Redis sorted-set leaderboard. */
export class RedisLeaderboard implements Leaderboard {
  constructor(private readonly redis: Redis) {}

  async report(player: Player): Promise<void> {
    await this.redis
      .multi()
      .zadd(ZSET_KEY, player.coins, player.id)
      .hset(NAME_KEY, player.id, player.name)
      .exec();
  }

  async top(n: number): Promise<LeaderboardEntry[]> {
    // Highest score first, with scores.
    const raw = await this.redis.zrevrange(ZSET_KEY, 0, Math.max(0, n - 1), "WITHSCORES");
    const ids: string[] = [];
    const entries: { playerId: string; score: number }[] = [];
    for (let i = 0; i < raw.length; i += 2) {
      ids.push(raw[i]);
      entries.push({ playerId: raw[i], score: Number(raw[i + 1]) });
    }
    const names = ids.length ? await this.redis.hmget(NAME_KEY, ...ids) : [];
    return entries.map((e, i) => ({
      playerId: e.playerId,
      name: names[i] ?? "",
      score: e.score,
      rank: i + 1,
    }));
  }

  async rankOf(playerId: string): Promise<number | null> {
    const rank = await this.redis.zrevrank(ZSET_KEY, playerId);
    return rank === null ? null : rank + 1;
  }
}
