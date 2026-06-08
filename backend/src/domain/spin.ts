import type { LiveOpsConfig, ReelSymbol } from "../config/liveops.js";
import { pickByWeight, type Rng } from "./rng.js";
import type { SpinOutcome, SpinOutcomeType } from "./types.js";

export function drawReel(cfg: LiveOpsConfig, rng: Rng): ReelSymbol {
  return pickByWeight(cfg.reelWeights, rng);
}

type Counts = Record<ReelSymbol, number>;

function tally(reels: ReelSymbol[]): { counts: Counts; triple: ReelSymbol | null; pair: ReelSymbol | null } {
  const counts = { coin: 0, ward: 0, strike: 0, raid: 0, spirit: 0 } as Counts;
  for (const r of reels) counts[r] += 1;
  let triple: ReelSymbol | null = null;
  let pair: ReelSymbol | null = null;
  for (const sym of Object.keys(counts) as ReelSymbol[]) {
    if (counts[sym] === 3) triple = sym;
    else if (counts[sym] === 2) pair = sym;
  }
  return { counts, triple, pair };
}

/**
 * Resolve a spin into rewards. Pure and deterministic given its inputs.
 *
 * Mirrors the GDD §5.1 payout table:
 *  - triple → full effect of that symbol
 *  - pair (2× any) → "½ от 3×, scaled" consolation (actions don't fire on pairs)
 *  - mixed → small coins = (#coin symbols) × baseCoinValue
 * All coin rewards scale by bet and the player's village multiplier.
 */
export function resolveSpin(
  reels: [ReelSymbol, ReelSymbol, ReelSymbol],
  bet: number,
  villageMultiplier: number,
  cfg: LiveOpsConfig,
): SpinOutcome {
  const { counts, triple, pair } = tally(reels);
  const p = cfg.payouts;
  const scale = bet * villageMultiplier;

  const base = (): SpinOutcome => ({
    type: "MIX" as SpinOutcomeType,
    reels,
    coins: 0,
    shields: 0,
    spiritTokens: 0,
  });

  if (triple) {
    const out = base();
    switch (triple) {
      case "coin":
        out.type = "JACKPOT";
        out.coins = Math.round(p.baseCoinValue * p.jackpotMultiplier * scale);
        return out;
      case "ward":
        out.type = "SHIELDS";
        out.shields = p.wardShieldsOnTriple;
        return out;
      case "strike":
        out.type = "ATTACK";
        out.action = "ATTACK";
        out.coins = Math.round(p.strikeBonusCoins * scale);
        return out;
      case "raid":
        out.type = "RAID";
        out.action = "RAID";
        return out;
      case "spirit":
        out.type = "SPIRIT";
        out.spiritTokens = p.spiritTokensOnTriple;
        return out;
    }
  }

  if (pair) {
    // Half of the triple effect, rounded down — actions never fire on a pair.
    const out = base();
    switch (pair) {
      case "coin":
        out.type = "JACKPOT";
        out.coins = Math.floor((p.baseCoinValue * p.jackpotMultiplier * scale) / 2);
        return out;
      case "ward":
        out.type = "SHIELDS";
        out.shields = Math.max(1, Math.floor(p.wardShieldsOnTriple / 2));
        return out;
      case "strike":
        out.coins = Math.floor((p.strikeBonusCoins * scale) / 2);
        return out;
      case "raid":
        out.coins = Math.floor(p.baseCoinValue * scale); // small consolation
        return out;
      case "spirit":
        out.spiritTokens = Math.max(1, Math.floor(p.spiritTokensOnTriple / 2));
        return out;
    }
  }

  // All distinct → small coins per coin symbol present.
  const out = base();
  out.coins = Math.round(counts.coin * p.baseCoinValue * scale);
  return out;
}
