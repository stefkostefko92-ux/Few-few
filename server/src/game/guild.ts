/** Guild progression — level → bonuses + member slots */

export interface GuildBonus {
  member_slots: number;
  xp_multiplier: number;
  gold_multiplier: number;
  crit_bonus: number;     // additive % (e.g. 0.05 = +5%)
  dodge_bonus: number;
  hp_multiplier: number;  // 1.0 = no change, 1.1 = +10% hp max
}

export const GUILD_BONUSES: Record<number, GuildBonus> = {
  1: { member_slots: 10, xp_multiplier: 1.05, gold_multiplier: 1.05, crit_bonus: 0,     dodge_bonus: 0,    hp_multiplier: 1.0  },
  2: { member_slots: 15, xp_multiplier: 1.10, gold_multiplier: 1.10, crit_bonus: 0.03,  dodge_bonus: 0,    hp_multiplier: 1.02 },
  3: { member_slots: 20, xp_multiplier: 1.15, gold_multiplier: 1.15, crit_bonus: 0.05,  dodge_bonus: 0.03, hp_multiplier: 1.05 },
  4: { member_slots: 25, xp_multiplier: 1.20, gold_multiplier: 1.20, crit_bonus: 0.08,  dodge_bonus: 0.05, hp_multiplier: 1.08 },
  5: { member_slots: 30, xp_multiplier: 1.25, gold_multiplier: 1.25, crit_bonus: 0.10,  dodge_bonus: 0.10, hp_multiplier: 1.10 },
};

export const GUILD_LEVEL_XP: Record<number, number> = {
  2:   5_000,
  3:  25_000,
  4: 100_000,
  5: 350_000,
};

export function getGuildBonus(level: number): GuildBonus {
  return GUILD_BONUSES[Math.min(5, Math.max(1, level))];
}

export const GUILD_CREATE_COST = 1000;
export const GUILD_CREATE_LEVEL_REQ = 5;
