/**
 * Reward-multiplier helper.
 *
 * Every route that grants gold + XP looks up the character's guild buffs
 * (Scholarship / Merchant Charter tracks) and pre-multiplies the base
 * reward before applying it. Keeping this central means the same %
 * applies whether the reward came from hunting, the tower, daily
 * tribute, camp idle tasks, or a bounty claim — no per-route divergence.
 */

import { loadGuildBuffsForCharacter } from './guild';
import { mountGoldBonusPct } from './cooldowns';

export interface AppliedReward {
  gold: number;
  xp: number;
  multipliers: { gold: number; xp: number };
}

export function applyGuildMultipliers(characterId: number, baseGold: number, baseXp: number): AppliedReward {
  const buffs = loadGuildBuffsForCharacter(characterId);
  // Mount bonus stacks multiplicatively on top of the guild's Merchant Charter.
  const mountBonus = 1 + mountGoldBonusPct(characterId) / 100;
  const goldMul = (buffs?.gold_multiplier ?? 1) * mountBonus;
  const xpMul   = buffs?.exp_multiplier ?? 1;
  return {
    gold: Math.round(baseGold * goldMul),
    xp:   Math.round(baseXp   * xpMul),
    multipliers: { gold: goldMul, xp: xpMul },
  };
}
