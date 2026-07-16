import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENT_DEFS,
  QUEST_DEFS,
  achievementMet,
  activeQuests,
  GAME_KEYS,
  type AchievementStats,
} from "./index.js";

const base: AchievementStats = { totalWins: 0, totalGames: 0, winStreak: 0, level: 1, gameWins: {} };
const def = (key: string) => ACHIEVEMENT_DEFS.find((d) => d.key === key)!;

describe("achievements coverage", () => {
  it("every game has its own win achievement", () => {
    for (const g of GAME_KEYS) {
      expect(ACHIEVEMENT_DEFS.some((d) => d.metric === "game_wins" && d.game === g)).toBe(true);
    }
  });
});

describe("quest rotation (activeQuests)", () => {
  it("is deterministic per day and always includes core quests", () => {
    const core = QUEST_DEFS.filter((q) => q.core);
    const a = activeQuests("2026-07-16");
    const b = activeQuests("2026-07-16");
    expect(a.map((q) => q.key)).toEqual(b.map((q) => q.key));
    for (const c of core) expect(a.some((q) => q.key === c.key)).toBe(true);
    // core + a rotating window (bounded), never the whole catalog.
    expect(a.length).toBeGreaterThan(core.length);
    expect(a.length).toBeLessThanOrEqual(QUEST_DEFS.length);
  });

  it("rotates the game dailies across days", () => {
    const days = ["2026-07-16", "2026-07-17", "2026-07-18", "2026-07-19", "2026-07-20"];
    const sets = days.map((d) => activeQuests(d).map((q) => q.key).join(","));
    expect(new Set(sets).size).toBeGreaterThan(1); // not identical every day
  });
});

describe("achievements", () => {
  it("has unique keys and positive thresholds/rewards", () => {
    const keys = new Set(ACHIEVEMENT_DEFS.map((d) => d.key));
    expect(keys.size).toBe(ACHIEVEMENT_DEFS.length);
    for (const d of ACHIEVEMENT_DEFS) {
      expect(d.threshold).toBeGreaterThan(0);
      expect(d.rewardGems).toBeGreaterThan(0);
      if (d.metric === "game_wins") expect(d.game).toBeTruthy();
    }
  });

  it("evaluates each metric against the threshold", () => {
    expect(achievementMet(def("first_win"), base)).toBe(false);
    expect(achievementMet(def("first_win"), { ...base, totalWins: 1 })).toBe(true);
    expect(achievementMet(def("streak_5"), { ...base, winStreak: 4 })).toBe(false);
    expect(achievementMet(def("streak_5"), { ...base, winStreak: 5 })).toBe(true);
    expect(achievementMet(def("level_10"), { ...base, level: 10 })).toBe(true);
    expect(achievementMet(def("games_50"), { ...base, totalGames: 50 })).toBe(true);
  });

  it("game-specific achievements only count the named game", () => {
    expect(achievementMet(def("win_chess"), { ...base, gameWins: { BELOTE: 5 } })).toBe(false);
    expect(achievementMet(def("win_chess"), { ...base, gameWins: { CHESS: 1 } })).toBe(true);
    expect(achievementMet(def("belote_master"), { ...base, gameWins: { BELOTE: 10 } })).toBe(true);
  });
});
