import { describe, expect, it } from "vitest";
import { ACHIEVEMENT_DEFS, achievementMet, type AchievementStats } from "./index.js";

const base: AchievementStats = { totalWins: 0, totalGames: 0, winStreak: 0, level: 1, gameWins: {} };
const def = (key: string) => ACHIEVEMENT_DEFS.find((d) => d.key === key)!;

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
    expect(achievementMet(def("chess_win"), { ...base, gameWins: { BELOTE: 5 } })).toBe(false);
    expect(achievementMet(def("chess_win"), { ...base, gameWins: { CHESS: 1 } })).toBe(true);
    expect(achievementMet(def("belote_master"), { ...base, gameWins: { BELOTE: 10 } })).toBe(true);
  });
});
