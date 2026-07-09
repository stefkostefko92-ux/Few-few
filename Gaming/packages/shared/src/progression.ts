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

// ── Achievements (§12) ───────────────────────────────────────────────────────
// One-time badges awarded automatically from cumulative play. Rewards are gems
// (cosmetic currency) — never gameplay advantage.

export type AchievementMetric = "total_wins" | "total_games" | "win_streak" | "level" | "game_wins";
export type AchievementTier = "bronze" | "silver" | "gold";

export interface AchievementDef {
  key: string;
  title: string; // bg display label
  description: string; // bg
  icon: string;
  tier: AchievementTier;
  metric: AchievementMetric;
  threshold: number;
  game?: GameKey; // for metric "game_wins"
  rewardGems: number;
}

export const ACHIEVEMENT_DEFS: readonly AchievementDef[] = [
  { key: "first_win", title: "Първа победа", description: "Спечели първия си мач.", icon: "🥇", tier: "bronze", metric: "total_wins", threshold: 1, rewardGems: 10 },
  { key: "wins_10", title: "Десетка", description: "Спечели 10 мача.", icon: "🏆", tier: "bronze", metric: "total_wins", threshold: 10, rewardGems: 20 },
  { key: "wins_50", title: "Ветеран", description: "Спечели 50 мача.", icon: "🏆", tier: "silver", metric: "total_wins", threshold: 50, rewardGems: 50 },
  { key: "wins_100", title: "Шампион", description: "Спечели 100 мача.", icon: "🏆", tier: "gold", metric: "total_wins", threshold: 100, rewardGems: 100 },
  { key: "games_10", title: "Начинаещ", description: "Изиграй 10 мача.", icon: "🎲", tier: "bronze", metric: "total_games", threshold: 10, rewardGems: 10 },
  { key: "games_50", title: "Редовен играч", description: "Изиграй 50 мача.", icon: "🎲", tier: "silver", metric: "total_games", threshold: 50, rewardGems: 30 },
  { key: "games_100", title: "Постоянен играч", description: "Изиграй 100 мача.", icon: "🎲", tier: "gold", metric: "total_games", threshold: 100, rewardGems: 60 },
  { key: "streak_3", title: "Серия от 3", description: "Спечели 3 поредни мача.", icon: "🔥", tier: "bronze", metric: "win_streak", threshold: 3, rewardGems: 20 },
  { key: "streak_5", title: "Серия от 5", description: "Спечели 5 поредни мача.", icon: "🔥", tier: "silver", metric: "win_streak", threshold: 5, rewardGems: 40 },
  { key: "streak_10", title: "Непобедим", description: "Спечели 10 поредни мача.", icon: "🔥", tier: "gold", metric: "win_streak", threshold: 10, rewardGems: 100 },
  { key: "level_5", title: "Ниво 5", description: "Достигни ниво 5.", icon: "⭐", tier: "bronze", metric: "level", threshold: 5, rewardGems: 20 },
  { key: "level_10", title: "Ниво 10", description: "Достигни ниво 10.", icon: "⭐", tier: "silver", metric: "level", threshold: 10, rewardGems: 40 },
  { key: "level_25", title: "Ниво 25", description: "Достигни ниво 25.", icon: "⭐", tier: "gold", metric: "level", threshold: 25, rewardGems: 100 },
  { key: "chess_win", title: "Шахматист", description: "Спечели мач на Шах.", icon: "♟️", tier: "bronze", metric: "game_wins", threshold: 1, game: "CHESS", rewardGems: 15 },
  { key: "belote_master", title: "Майстор на белот", description: "Спечели 10 мача на Белот.", icon: "🃏", tier: "silver", metric: "game_wins", threshold: 10, game: "BELOTE", rewardGems: 40 },
] as const;

export interface AchievementStats {
  totalWins: number;
  totalGames: number;
  winStreak: number;
  level: number;
  gameWins: Partial<Record<GameKey, number>>;
}

export interface AchievementView {
  key: string;
  title: string;
  description: string;
  icon: string;
  tier: AchievementTier;
  rewardGems: number;
  unlocked: boolean;
  unlockedAt: string | null;
}

/** Whether the cumulative stats satisfy an achievement's condition. */
export function achievementMet(def: AchievementDef, s: AchievementStats): boolean {
  switch (def.metric) {
    case "total_wins":
      return s.totalWins >= def.threshold;
    case "total_games":
      return s.totalGames >= def.threshold;
    case "win_streak":
      return s.winStreak >= def.threshold;
    case "level":
      return s.level >= def.threshold;
    case "game_wins":
      return def.game ? (s.gameWins[def.game] ?? 0) >= def.threshold : false;
  }
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
