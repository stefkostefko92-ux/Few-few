import { z } from "zod";
import type { VipTier } from "./constants.js";

/**
 * Economy + shop contracts (§11). Chips & gems are virtual; chips are NEVER
 * cashed out or transferred between players (regulatory line, §11.4). Money buys
 * only cosmetics, VIP comfort, gems, and chip packs.
 */

export const PRODUCT_KINDS = ["GEMS", "COSMETIC", "VIP_SUB", "CHIP_PACK"] as const;
export type ProductKind = (typeof PRODUCT_KINDS)[number];

export interface ProductView {
  sku: string;
  kind: ProductKind;
  title: string;
  priceCents: number;
  /** Gems granted (GEMS packs) or chips granted (CHIP_PACK). */
  grantGems?: number;
  grantChips?: number;
  /** VIP tier conferred (VIP_SUB). */
  vipTier?: VipTier;
  cosmeticId?: string;
}

/** XP curve: XP required to advance FROM `level` to the next. */
export function xpForLevel(level: number): number {
  return 100 + (level - 1) * 50;
}

/** Resolve a total-XP value into a level + progress within that level. */
export function levelFromXp(totalXp: number): {
  level: number;
  intoLevel: number;
  needed: number;
} {
  let level = 1;
  let remaining = Math.max(0, Math.floor(totalXp));
  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level);
    level += 1;
  }
  return { level, intoLevel: remaining, needed: xpForLevel(level) };
}

/** Daily login reward by streak day (1..7), capped at day 7. */
export function dailyReward(streakDay: number): { chips: number; gems: number } {
  const day = Math.min(Math.max(streakDay, 1), 7);
  return { chips: 100 * day, gems: day === 7 ? 5 : 0 };
}

/** VIP comfort perks (§11.2) — never gameplay advantage. */
export interface VipPerks {
  xpMultiplier: number;
  dailyChipMultiplier: number;
  matchmakingPriority: number; // lower = matched sooner
  questSlots: number;
  adsRemoved: boolean;
}

export const VIP_PERKS: Record<VipTier, VipPerks> = {
  NONE: { xpMultiplier: 1, dailyChipMultiplier: 1, matchmakingPriority: 0, questSlots: 3, adsRemoved: false },
  SILVER: { xpMultiplier: 1.1, dailyChipMultiplier: 1.25, matchmakingPriority: 1, questSlots: 4, adsRemoved: true },
  GOLD: { xpMultiplier: 1.25, dailyChipMultiplier: 1.5, matchmakingPriority: 2, questSlots: 5, adsRemoved: true },
  PLATINUM: { xpMultiplier: 1.5, dailyChipMultiplier: 2, matchmakingPriority: 3, questSlots: 6, adsRemoved: true },
};

export const checkoutSchema = z.object({ sku: z.string().min(1).max(64) });
export type CheckoutInput = z.infer<typeof checkoutSchema>;
