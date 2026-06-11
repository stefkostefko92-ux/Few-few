import { describe, expect, it } from "vitest";
import { SeededRng } from "./rng.js";
import { commitment, generateSeed, verifySeed } from "./commit.js";

describe("SeededRng", () => {
  it("is deterministic for the same seed", () => {
    const a = new SeededRng("abc");
    const b = new SeededRng("abc");
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("differs across seeds", () => {
    const a = new SeededRng("abc");
    const b = new SeededRng("xyz");
    expect(a.next()).not.toEqual(b.next());
  });

  it("dice are in [1,6] and shuffle is a permutation", () => {
    const rng = new SeededRng("dice");
    for (let i = 0; i < 200; i++) {
      const d = rng.die();
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(6);
    }
    const input = [1, 2, 3, 4, 5];
    const out = new SeededRng("s").shuffle(input);
    expect(out).toHaveLength(5);
    expect([...out].sort()).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5]); // not mutated
  });
});

describe("commit-reveal", () => {
  it("verifies a revealed seed against its commitment", async () => {
    const seed = generateSeed();
    const c = await commitment(seed);
    expect(c).toHaveLength(64); // sha-256 hex
    expect(await verifySeed(seed, c)).toBe(true);
    expect(await verifySeed("tampered", c)).toBe(false);
  });
});
