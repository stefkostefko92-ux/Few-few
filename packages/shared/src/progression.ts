import type { GameKey } from "./games.js";

/**
 * Quest, season, and achievement contracts (§12). All progression is
 * non-gambling: rewards are chips/xp/cosmetics for activity, never advantage.
 */

export type QuestPeriod = "daily" | "weekly";

export interface QuestDef {
  key: string;
  period: QuestPeriod;
  target: number;
  /** Optional game filter — undefined = any game. */
  game?: GameKey;
  /** Event that advances this quest. */
  trigger: "play" | "win";
  rewardChips: number;
  rewardXp: number;
}

/** Catalog of quest definitions; the worker rolls a subset per period (§12). */
export const QUEST_DEFS: readonly QuestDef[] = [
  { key: "play_3", period: "daily", target: 3, trigger: "play", rewardChips: 150, rewardXp: 30 },
  { key: "win_1", period: "daily", target: 1, trigger: "win", rewardChips: 200, rewardXp: 40 },
  { key: "win_chess", period: "daily", target: 1, trigger: "win", game: "CHESS", rewardChips: 250, rewardXp: 50 },
  { key: "play_belote_2", period: "daily", target: 2, trigger: "play", game: "BELOTE", rewardChips: 200, rewardXp: 40 },
  { key: "weekly_play_20", period: "weekly", target: 20, trigger: "play", rewardChips: 1000, rewardXp: 200 },
  { key: "weekly_win_10", period: "weekly", target: 10, trigger: "win", rewardChips: 1500, rewardXp: 300 },
] as const;

export interface QuestView {
  key: string;
  period: QuestPeriod;
  progress: number;
  target: number;
  completed: boolean;
  rewardChips: number;
  rewardXp: number;
}

export interface SeasonView {
  index: number;
  startsAt: string;
  endsAt: string;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  rating: number;
}

/** Redis sorted-set key for a per-game leaderboard. */
export const leaderboardKey = (game: GameKey): string => `lb:${game}`;
/** Redis sorted-set key for the current season's global leaderboard. */
export const seasonLeaderboardKey = (seasonIndex: number): string => `lb:season:${seasonIndex}`;
