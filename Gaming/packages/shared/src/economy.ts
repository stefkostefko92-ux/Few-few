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

/** VIP comfort perks (§11.2) — never gameplay advantage (cosmetic/comfort only). */
export interface VipPerks {
  xpMultiplier: number;
  dailyChipMultiplier: number;
  matchmakingPriority: number; // lower = matched sooner
  questSlots: number;
  /**
   * Reserved flag: there is no ad system in the product, so this is NOT a perk
   * we advertise or sell. Kept for forward-compatibility only — the shop must
   * not surface it as a benefit (would be a misleading commercial practice).
   */
  adsRemoved: boolean;
  /** Gems credited on each monthly subscription renewal (comfort/value). */
  monthlyGems: number;
  /** May purchase/equip VIP-exclusive cosmetics. */
  exclusiveCosmetics: boolean;
  /** Coloured VIP nameplate + badge in chat and at the table. */
  nameBadge: boolean;
}

/**
 * Four paid tiers, each with a distinct feature set. BRONZE (€3.99) is the
 * entry tier: a VIP badge + small comfort boosts, but no gem stipend or
 * exclusive cosmetics — those begin at SILVER. Higher tiers scale the
 * multipliers, gem stipend, and quest slots. (`adsRemoved` is a dormant flag,
 * not a sold perk — the product has no ads.)
 */
export const VIP_PERKS: Record<VipTier, VipPerks> = {
  NONE: {
    xpMultiplier: 1, dailyChipMultiplier: 1, matchmakingPriority: 0, questSlots: 3,
    adsRemoved: false, monthlyGems: 0, exclusiveCosmetics: false, nameBadge: false,
  },
  BRONZE: {
    xpMultiplier: 1.1, dailyChipMultiplier: 1.2, matchmakingPriority: 1, questSlots: 4,
    adsRemoved: true, monthlyGems: 0, exclusiveCosmetics: false, nameBadge: true,
  },
  SILVER: {
    xpMultiplier: 1.2, dailyChipMultiplier: 1.35, matchmakingPriority: 2, questSlots: 5,
    adsRemoved: true, monthlyGems: 60, exclusiveCosmetics: true, nameBadge: true,
  },
  GOLD: {
    xpMultiplier: 1.35, dailyChipMultiplier: 1.6, matchmakingPriority: 3, questSlots: 6,
    adsRemoved: true, monthlyGems: 160, exclusiveCosmetics: true, nameBadge: true,
  },
  PLATINUM: {
    xpMultiplier: 1.5, dailyChipMultiplier: 2, matchmakingPriority: 4, questSlots: 8,
    adsRemoved: true, monthlyGems: 400, exclusiveCosmetics: true, nameBadge: true,
  },
};

/** Tiers ordered weakest→strongest, for gating comparisons. */
export const VIP_RANK: Record<VipTier, number> = {
  NONE: 0, BRONZE: 1, SILVER: 2, GOLD: 3, PLATINUM: 4,
};

/** Официален фиксиран курс на превалутиране (ЗВЕРБ): 1 EUR = 1.95583 BGN. */
export const BGN_PER_EUR = 1.95583;

/** Левова равностойност в стотинки: пълният курс, закръглен до втория знак. */
export function bgnCents(priceCents: number): number {
  return Math.round(priceCents * BGN_PER_EUR);
}

/**
 * Двойно обозначаване на цена по Закона за въвеждане на еврото в Република
 * България — двете цени с еднаква видимост, левът по фиксирания курс:
 * "€3.99 / 7.80 лв.". Задължително за потребителски цени през преходния период.
 */
export function formatDualPrice(priceCents: number): string {
  return `€${(priceCents / 100).toFixed(2)} / ${(bgnCents(priceCents) / 100).toFixed(2)} лв.`;
}

export const checkoutSchema = z.object({ sku: z.string().min(1).max(64) });
export type CheckoutInput = z.infer<typeof checkoutSchema>;
