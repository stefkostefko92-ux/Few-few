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

  it("128-битово състояние: различни seed-ове не съвпадат в потока (при 32-битово има колизии)", () => {
    // Birthday: при 32-битов seed 200 000 различни низа дават ≈ 4–5 двойки с
    // ИДЕНТИЧЕН поток; при 128 бита — нито една (първите 3 стойности като ключ).
    const seen = new Set<string>();
    let collisions = 0;
    for (let i = 0; i < 200_000; i++) {
      const r = new SeededRng(`s${i}`);
      const key = `${r.next()}:${r.next()}:${r.next()}`;
      if (seen.has(key)) collisions++;
      seen.add(key);
    }
    expect(collisions).toBe(0);
  });

  it("равномерно: средното на 20 000 числа е близо до 0,5 и всички са в [0,1)", () => {
    const r = new SeededRng("uniform");
    let sum = 0;
    for (let i = 0; i < 20_000; i++) {
      const x = r.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      sum += x;
    }
    expect(Math.abs(sum / 20_000 - 0.5)).toBeLessThan(0.01);
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
