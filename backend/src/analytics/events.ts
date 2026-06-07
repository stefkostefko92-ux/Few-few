import type { Rarity, SpinOutcomeType } from "../domain/types.js";

/**
 * Analytics event taxonomy (GDD §14.2). Every value/engagement action emits a
 * typed event with a common envelope `{ type, playerId, at }`. These feed the
 * funnels, cohort retention, and economy/anti-fraud metrics in §14.1.
 */

interface Base {
  playerId: string;
  at: number;
}

export type AnalyticsEvent =
  | (Base & { type: "REGISTER"; name: string })
  | (Base & { type: "SPIN"; bet: number; outcome: SpinOutcomeType; coins: number })
  | (Base & { type: "BUILD"; buildingIndex: number; newLevel: number; cost: number; unlockedIsland: number | null })
  | (Base & { type: "ATTACK"; targetId: string; blocked: boolean; reward: number })
  | (Base & { type: "RAID"; targetId: string; reward: number })
  | (Base & { type: "SUMMON"; rarity: Rarity; viaPity: boolean })
  | (Base & { type: "PURCHASE"; productId: string; transactionId: string; granted: boolean });

export type AnalyticsEventType = AnalyticsEvent["type"];
