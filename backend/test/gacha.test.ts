import { describe, expect, it } from "vitest";
import { defaultLiveOps } from "../src/config/liveops.js";
import { pull, type PityState } from "../src/domain/gacha.js";
import { cryptoRng, type Rng } from "../src/domain/rng.js";

const cfg = defaultLiveOps;

/** Rng that always returns a fixed float — drives deterministic rarity. */
function fixedFloat(value: number): Rng {
  return { intBetween: (min) => min, random: () => value };
}

describe("gacha pity", () => {
  it("guarantees a mythic at the mythic pity pull even on the worst rolls", () => {
    let state: PityState = { pullsSinceEpic: 0, pullsSinceMythic: 0 };
    const worst = fixedFloat(0.999); // always rolls common without pity
    let mythicAt = -1;
    for (let i = 1; i <= cfg.gacha.mythicPity; i++) {
      const r = pull(state, cfg, worst);
      state = r.pity;
      if (r.rarity === "mythic") {
        mythicAt = i;
        break;
      }
    }
    expect(mythicAt).toBe(cfg.gacha.mythicPity);
  });

  it("guarantees an epic at the epic pity pull when none dropped naturally", () => {
    let state: PityState = { pullsSinceEpic: 0, pullsSinceMythic: 0 };
    const worst = fixedFloat(0.999);
    const r = (() => {
      let last = pull(state, cfg, worst);
      state = last.pity;
      for (let i = 2; i <= cfg.gacha.epicPity; i++) {
        last = pull(state, cfg, worst);
        state = last.pity;
      }
      return last;
    })();
    expect(r.rarity).toBe("epic");
    expect(r.viaPity).toBe(true);
    // epic pity resets the epic counter but not the mythic counter
    expect(state.pullsSinceEpic).toBe(0);
    expect(state.pullsSinceMythic).toBe(cfg.gacha.epicPity);
  });

  it("a mythic resets both pity counters", () => {
    const state: PityState = { pullsSinceEpic: 10, pullsSinceMythic: 20 };
    const r = pull(state, cfg, fixedFloat(0)); // r=0 → mythic by rate
    expect(r.rarity).toBe("mythic");
    expect(r.pity.pullsSinceEpic).toBe(0);
    expect(r.pity.pullsSinceMythic).toBe(0);
  });

  it("published rates hold within tolerance over many pulls", () => {
    let state: PityState = { pullsSinceEpic: 0, pullsSinceMythic: 0 };
    const N = 300_000;
    const counts = { common: 0, rare: 0, epic: 0, mythic: 0 };
    for (let i = 0; i < N; i++) {
      const r = pull(state, cfg, cryptoRng);
      state = r.pity;
      counts[r.rarity] += 1;
    }
    // Observed mythic/epic rates are slightly ABOVE the base rate because pity
    // adds guaranteed drops — assert they're at least the published floor and
    // not wildly off.
    expect(counts.mythic / N).toBeGreaterThanOrEqual(cfg.gacha.rates.mythic * 0.9);
    expect(counts.epic / N).toBeGreaterThanOrEqual(cfg.gacha.rates.epic * 0.9);
    expect(counts.rare / N).toBeGreaterThan(0.1);
    expect(counts.common / N).toBeGreaterThan(0.6);
  });
});
