import { z } from "zod";

/**
 * LiveOps configuration — the single tunable source of truth for the economy.
 *
 * GDD §6.2: "Всичко (тегла, цени, payouts, drop rates) е в LiveOps конфиг, не
 * hard-coded → тунинг без release." In production this lives in Postgres and is
 * edited from the admin dashboard; here it is a zod-validated object so every
 * load is schema-checked and the game logic stays declarative.
 */

export const reelSymbols = ["coin", "ward", "strike", "raid", "spirit"] as const;
export type ReelSymbol = (typeof reelSymbols)[number];

const reelWeightsSchema = z
  .object({
    coin: z.number().int().positive(),
    ward: z.number().int().positive(),
    strike: z.number().int().positive(),
    raid: z.number().int().positive(),
    spirit: z.number().int().positive(),
  })
  .strict();

export const liveOpsSchema = z
  .object({
    // 5.1 Духовното колело — weighted reel
    reelWeights: reelWeightsSchema,

    // Base payout values (per spin at bet=1, before village multiplier)
    payouts: z
      .object({
        baseCoinValue: z.number().int().positive(), // per coin symbol in a mixed result
        jackpotMultiplier: z.number().int().positive(), // 3× coin multiplier on baseCoinValue
        strikeBonusCoins: z.number().int().nonnegative(), // bonus coins on 3× strike
        spiritTokensOnTriple: z.number().int().positive(), // 3× spirit
        wardShieldsOnTriple: z.number().int().positive(), // 3× ward
        shieldCap: z.number().int().positive(),
      })
      .strict(),

    // 5.2 Spins като енергия
    spins: z
      .object({
        cap: z.number().int().positive(),
        regenPerHour: z.number().int().positive(),
        startingBonus: z.number().int().positive(),
        maxBet: z.number().int().positive(),
      })
      .strict(),

    // 5.5 Прогрес на острови (build loop)
    islands: z
      .object({
        buildingsPerIsland: z.number().int().positive(),
        levelsPerBuilding: z.number().int().positive(),
        baseCost: z.number().int().positive(),
        costGrowth: z.number().positive(), // ≈ 1.18–1.25
        villageMultiplierGrowth: z.number().positive(), // geometric per island
      })
      .strict(),

    // 5.3 Attack
    attack: z
      .object({
        baseAttack: z.number().int().positive(),
      })
      .strict(),

    // 5.4 Raid
    raid: z
      .object({
        totalSpots: z.number().int().positive(),
        picks: z.number().int().positive(),
        loyaltyCapPct: z.number().min(0).max(1), // max % of victim coins a raid can take
      })
      .strict(),

    // 5.6 Companions (gacha) — PUBLISHED rates, §12.2 regulatory requirement
    gacha: z
      .object({
        costSpiritTokens: z.number().int().positive(),
        rates: z
          .object({
            mythic: z.number().min(0).max(1), // ★6
            epic: z.number().min(0).max(1), // ★5
            rare: z.number().min(0).max(1), // ★4
            // common is the remainder
          })
          .strict(),
        epicPity: z.number().int().positive(), // guaranteed ★5 within N pulls
        mythicPity: z.number().int().positive(), // guaranteed ★6 within N pulls
      })
      .strict(),
  })
  .strict()
  .superRefine((cfg, ctx) => {
    if (cfg.raid.picks > cfg.raid.totalSpots) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "raid.picks cannot exceed raid.totalSpots",
        path: ["raid", "picks"],
      });
    }
    if (cfg.gacha.rates.mythic + cfg.gacha.rates.epic + cfg.gacha.rates.rare > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "gacha rarity rates must sum to <= 1 (common is the remainder)",
        path: ["gacha", "rates"],
      });
    }
    if (cfg.spins.startingBonus > cfg.spins.cap) {
      // allowed (overflow above cap is fine on grant) — no-op, documented intent
    }
  });

export type LiveOpsConfig = z.infer<typeof liveOpsSchema>;

/** Default config — values transcribed from GDD §5 tables. */
export const defaultLiveOps: LiveOpsConfig = liveOpsSchema.parse({
  reelWeights: { coin: 38, ward: 24, strike: 18, raid: 14, spirit: 6 },
  payouts: {
    baseCoinValue: 100,
    jackpotMultiplier: 30,
    strikeBonusCoins: 250,
    spiritTokensOnTriple: 10,
    wardShieldsOnTriple: 3,
    shieldCap: 5,
  },
  spins: {
    cap: 50,
    regenPerHour: 5,
    startingBonus: 75,
    maxBet: 50,
  },
  islands: {
    buildingsPerIsland: 5,
    levelsPerBuilding: 5,
    baseCost: 240,
    costGrowth: 1.2,
    villageMultiplierGrowth: 1.55,
  },
  attack: {
    baseAttack: 120,
  },
  raid: {
    totalSpots: 4,
    picks: 3,
    loyaltyCapPct: 0.4,
  },
  gacha: {
    costSpiritTokens: 10,
    rates: { mythic: 0.005, epic: 0.035, rare: 0.18 },
    epicPity: 50,
    mythicPity: 90,
  },
});

/** Parse/validate an arbitrary config payload (e.g. from the admin dashboard). */
export function loadLiveOps(raw: unknown): LiveOpsConfig {
  return liveOpsSchema.parse(raw);
}
