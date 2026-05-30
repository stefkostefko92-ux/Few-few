import { describe, expect, it } from "vitest";
import { assessPair, MIN_GAMES } from "./collusion.js";

describe("collusion heuristic", () => {
  it("does not flag below the minimum sample size", () => {
    expect(assessPair(MIN_GAMES - 1, MIN_GAMES - 1).flag).toBe(false);
  });

  it("does not flag a balanced head-to-head", () => {
    expect(assessPair(20, 10).flag).toBe(false);
    expect(assessPair(20, 11).flag).toBe(false);
  });

  it("flags a heavily skewed head-to-head with positive severity", () => {
    const r = assessPair(20, 19); // 95% winrate
    expect(r.flag).toBe(true);
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThanOrEqual(1);
  });

  it("severity grows with sample size for the same skew", () => {
    const small = assessPair(10, 10);
    const large = assessPair(40, 40);
    expect(large.score).toBeGreaterThanOrEqual(small.score);
  });

  it("is symmetric in skew direction (all wins vs all losses)", () => {
    expect(assessPair(20, 20).flag).toBe(true);
    expect(assessPair(20, 0).flag).toBe(true);
  });
});
