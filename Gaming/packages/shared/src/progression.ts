import { GAME_KEYS, type GameKey } from "./games.js";

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
  /** Core quests are always offered; non-core dailies rotate per day so the
   *  board stays fresh and covers the whole roster over a week (see activeQuests). */
  core?: boolean;
}

/** Full catalog of quest definitions; `activeQuests` rolls the day's subset. */
export const QUEST_DEFS: readonly QuestDef[] = [
  // Core dailies + weeklies — always on.
  { key: "play_3", period: "daily", target: 3, trigger: "play", rewardChips: 150, rewardXp: 30, core: true },
  { key: "win_1", period: "daily", target: 1, trigger: "win", rewardChips: 200, rewardXp: 40, core: true },
  { key: "weekly_play_20", period: "weekly", target: 20, trigger: "play", rewardChips: 1000, rewardXp: 200, core: true },
  { key: "weekly_win_10", period: "weekly", target: 10, trigger: "win", rewardChips: 1500, rewardXp: 300, core: true },
  // Rotating game-specific dailies — a fresh few are drawn each day.
  { key: "win_chess", period: "daily", target: 1, trigger: "win", game: "CHESS", rewardChips: 250, rewardXp: 50 },
  { key: "play_belote_2", period: "daily", target: 2, trigger: "play", game: "BELOTE", rewardChips: 200, rewardXp: 40 },
  { key: "win_santase", period: "daily", target: 1, trigger: "win", game: "SANTASE", rewardChips: 220, rewardXp: 45 },
  { key: "win_backgammon", period: "daily", target: 1, trigger: "win", game: "BACKGAMMON", rewardChips: 220, rewardXp: 45 },
  { key: "play_war_3", period: "daily", target: 3, trigger: "play", game: "WAR", rewardChips: 180, rewardXp: 35 },
  { key: "win_svara", period: "daily", target: 1, trigger: "win", game: "SVARA", rewardChips: 240, rewardXp: 48 },
  { key: "play_ludo_2", period: "daily", target: 2, trigger: "play", game: "LUDO", rewardChips: 190, rewardXp: 38 },
  { key: "win_domino", period: "daily", target: 1, trigger: "win", game: "DOMINO", rewardChips: 210, rewardXp: 42 },
  { key: "win_eightball", period: "daily", target: 1, trigger: "win", game: "EIGHTBALL", rewardChips: 230, rewardXp: 46 },
  { key: "win_dice", period: "daily", target: 1, trigger: "win", game: "DICE", rewardChips: 210, rewardXp: 42 },
] as const;

/** How many rotating game dailies to draw each day (in addition to the core). */
export const ROTATING_DAILY_COUNT = 3;

/** Deterministic string hash (stable across processes — no Math.random). */
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * The quests active for a given day: every core quest (daily + weekly) plus a
 * deterministic rotating window of game-specific dailies, so a player sees a
 * fresh mix each day and the whole roster is covered across a week. Pure and
 * deterministic — the same `dayKey` always yields the same set.
 */
export function activeQuests(dayKey: string): readonly QuestDef[] {
  const core = QUEST_DEFS.filter((q) => q.core);
  const rotating = QUEST_DEFS.filter((q) => q.period === "daily" && !q.core);
  if (rotating.length === 0) return core;
  const start = hashStr(dayKey) % rotating.length;
  const n = Math.min(ROTATING_DAILY_COUNT, rotating.length);
  const picks = Array.from({ length: n }, (_, i) => rotating[(start + i) % rotating.length]!);
  return [...core, ...picks];
}

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

/** Bulgarian display names per game (source labels; the UI may localize). */
const GAME_BG_NAME: Record<GameKey, string> = {
  CHESS: "Шах", BACKGAMMON: "Табла", BELOTE: "Белот", SANTASE: "Сантасе", SVARA: "Свара",
  WAR: "Война", GOFISH: "Бръкни в морето", KENT: "Кент Купе", DRAUGHTS: "Дама",
  LUDO: "Не се сърди човече", RUMMY: "Реми", DOMINO: "Домино", BRIDGE: "Бридж",
  BATTLESHIP: "Морски бой", DICE: "Покер на зарове", BINGO: "Бинго", WORDS: "Думи",
  EIGHTBALL: "Билярд (8 топки)", NINEBALL: "Билярд (9 топки)", SNOOKER: "Снукър", MAGNAT: "Магнат",
};

/** One bronze "win a match" badge per game — every game gets its own achievement. */
const PER_GAME_ACHIEVEMENTS: readonly AchievementDef[] = GAME_KEYS.map((game) => ({
  key: `win_${game.toLowerCase()}`,
  title: `Победа: ${GAME_BG_NAME[game]}`,
  description: `Спечели мач на ${GAME_BG_NAME[game]}.`,
  icon: "🏅",
  tier: "bronze" as AchievementTier,
  metric: "game_wins" as AchievementMetric,
  threshold: 1,
  game,
  rewardGems: 15,
}));

const BASE_ACHIEVEMENTS: readonly AchievementDef[] = [
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
  // Mastery badges (higher thresholds) for the flagship games.
  { key: "chess_master", title: "Майстор на шах", description: "Спечели 10 мача на Шах.", icon: "♟️", tier: "silver", metric: "game_wins", threshold: 10, game: "CHESS", rewardGems: 40 },
  { key: "belote_master", title: "Майстор на белот", description: "Спечели 10 мача на Белот.", icon: "🃏", tier: "silver", metric: "game_wins", threshold: 10, game: "BELOTE", rewardGems: 40 },
];

/** All achievements: the base set + one bronze "first win" badge per game. */
export const ACHIEVEMENT_DEFS: readonly AchievementDef[] = [...BASE_ACHIEVEMENTS, ...PER_GAME_ACHIEVEMENTS];

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
