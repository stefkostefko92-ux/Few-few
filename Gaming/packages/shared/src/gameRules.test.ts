import { describe, expect, it } from "vitest";
import { GAME_RULES, rulesForGame, GAME_KEYS } from "./index.js";

describe("game rules", () => {
  it("covers every game with a non-empty objective and steps", () => {
    for (const g of GAME_KEYS) {
      const r = rulesForGame(g);
      expect(r).toBeDefined();
      expect(r.objective.length).toBeGreaterThan(0);
      expect(r.steps.length).toBeGreaterThanOrEqual(3);
      expect(r.steps.every((s) => s.trim().length > 0)).toBe(true);
    }
    expect(Object.keys(GAME_RULES)).toHaveLength(GAME_KEYS.length);
  });
});
