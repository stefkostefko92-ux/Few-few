import type { ReelSymbol } from "../config/liveops.js";

export type Currency = "spins" | "coins" | "spiritTokens" | "gems";

/** A single building on an island: a level from 0..levelsPerBuilding. */
export interface Building {
  level: number;
}

export interface Island {
  index: number;
  buildings: Building[];
  /** True once every building is maxed; unlocks the next island. */
  completed: boolean;
}

export type Rarity = "common" | "rare" | "epic" | "mythic";

export interface Companion {
  id: string;
  rarity: Rarity;
  summonedAt: number;
}

export interface RevengeTarget {
  attackerId: string;
  expiresAt: number;
}

/**
 * Server-authoritative grant created when a spin rolls 3× Strike. The client
 * may follow up with exactly one attack before it expires; it cannot fabricate
 * an attack it never rolled.
 */
export interface PendingAttack {
  bet: number;
  grantedAt: number;
  expiresAt: number;
}

/**
 * Server-authoritative grant created when a spin rolls 3× Raid. The hidden coin
 * amounts behind each dig spot are predetermined here so the client cannot
 * probe/retry to discover them (§5.4).
 */
export interface PendingRaid {
  targetId: string;
  /** Predetermined coins behind each of the totalSpots dig spots. */
  spots: number[];
  picks: number;
  grantedAt: number;
  expiresAt: number;
}

export interface Player {
  id: string;
  name: string;
  createdAt: number;

  // Currencies
  spins: number;
  coins: number;
  spiritTokens: number;
  gems: number;

  // Spin energy regen bookkeeping
  spinsUpdatedAt: number;

  // Defense
  shields: number;

  // Progression
  currentIsland: number;
  islands: Island[];

  // Gacha pity counters (§5.6)
  pullsSinceEpic: number;
  pullsSinceMythic: number;
  companions: Companion[];

  // Social / retention
  revengeTargets: RevengeTarget[];

  // Open server-authoritative action grants from the most recent spin
  pendingAttack: PendingAttack | null;
  pendingRaid: PendingRaid | null;
}

export type SpinOutcomeType =
  | "JACKPOT"
  | "SHIELDS"
  | "ATTACK"
  | "RAID"
  | "SPIRIT"
  | "MIX";

export interface SpinOutcome {
  type: SpinOutcomeType;
  reels: [ReelSymbol, ReelSymbol, ReelSymbol];
  coins: number;
  shields: number;
  spiritTokens: number;
  /** Present when type === "ATTACK" or "RAID": the action the client must follow up on. */
  action?: "ATTACK" | "RAID";
}
