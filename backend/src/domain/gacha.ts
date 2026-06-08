import type { LiveOpsConfig } from "../config/liveops.js";
import type { Rng } from "./rng.js";
import type { Rarity } from "./types.js";

export interface PityState {
  pullsSinceEpic: number;
  pullsSinceMythic: number;
}

export interface PullResult {
  rarity: Rarity;
  /** True when the rarity was forced by a pity counter rather than the roll. */
  viaPity: boolean;
  pity: PityState;
}

/**
 * Single gacha pull, server-authoritative (§5.6).
 *
 * Implements BOTH published guarantees from the rarity table:
 *  - ★6 Mythic guaranteed within `mythicPity` pulls (default 90)
 *  - ★5 Epic guaranteed within `epicPity` pulls (default 50)
 * Pity counters reset when a result of that tier (or higher) lands. Rates are
 * published (§12.2) and read from LiveOps so they can be tuned per banner.
 */
export function pull(state: PityState, cfg: LiveOpsConfig, rng: Rng): PullResult {
  const pullsSinceEpic = state.pullsSinceEpic + 1;
  const pullsSinceMythic = state.pullsSinceMythic + 1;
  const g = cfg.gacha;

  const land = (rarity: Rarity, viaPity: boolean): PullResult => {
    const pity: PityState = { pullsSinceEpic, pullsSinceMythic };
    // A mythic resets both counters; an epic resets the epic counter.
    if (rarity === "mythic") {
      pity.pullsSinceMythic = 0;
      pity.pullsSinceEpic = 0;
    } else if (rarity === "epic") {
      pity.pullsSinceEpic = 0;
    }
    return { rarity, viaPity, pity };
  };

  // Hard pity takes precedence.
  if (pullsSinceMythic >= g.mythicPity) return land("mythic", true);
  if (pullsSinceEpic >= g.epicPity) return land("epic", true);

  const r = rng.random();
  if (r < g.rates.mythic) return land("mythic", false);
  if (r < g.rates.mythic + g.rates.epic) return land("epic", false);
  if (r < g.rates.mythic + g.rates.epic + g.rates.rare) return land("rare", false);
  return land("common", false);
}
