import { describe, expect, it } from "vitest";
import { cryptoRng, pickByWeight, type Rng } from "../src/domain/rng.js";

describe("rng", () => {
  it("intBetween stays within [min, max)", () => {
    for (let i = 0; i < 10_000; i++) {
      const n = cryptoRng.intBetween(3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThan(7);
    }
  });

  it("random stays within [0, 1)", () => {
    for (let i = 0; i < 10_000; i++) {
      const r = cryptoRng.random();
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(1);
    }
  });

  it("pickByWeight respects the weight distribution within tolerance", () => {
    const weights = { coin: 38, ward: 24, strike: 18, raid: 14, spirit: 6 };
    const N = 200_000;
    const counts: Record<string, number> = { coin: 0, ward: 0, strike: 0, raid: 0, spirit: 0 };
    for (let i = 0; i < N; i++) counts[pickByWeight(weights, cryptoRng)] += 1;

    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    for (const [k, w] of Object.entries(weights)) {
      const observed = counts[k] / N;
      const expected = w / total;
      // Within 1.5 percentage points — comfortably loose for 200k samples.
      expect(Math.abs(observed - expected)).toBeLessThan(0.015);
    }
  });

  it("is deterministic when given a scripted Rng (for outcome tests)", () => {
    const scripted: Rng = makeScriptedRng([0]);
    // Roll 0 always selects the first key.
    expect(pickByWeight({ a: 1, b: 1 }, scripted)).toBe("a");
  });
});

/** Test helper: an Rng whose intBetween cycles through given values (clamped). */
export function makeScriptedRng(ints: number[], floats: number[] = []): Rng {
  let i = 0;
  let f = 0;
  return {
    intBetween(min, max) {
      const v = ints.length ? ints[i++ % ints.length] : min;
      return Math.min(max - 1, Math.max(min, v));
    },
    random() {
      return floats.length ? floats[f++ % floats.length] : 0;
    },
  };
}
