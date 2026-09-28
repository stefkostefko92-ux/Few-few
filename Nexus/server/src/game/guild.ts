/**
 * Guild progression — multi-track upgrade system.
 *
 * Each guild has SIX independent upgrade tracks, each leveling 0 → 100:
 *
 *   attr_level         — +0.5% to every attribute (str/dex/con/int/wis/cha)
 *   power_level        — +0.5% to attack damage
 *   defence_level      — +1.0% to defense
 *   exp_bonus_level    — +2.0% XP gained
 *   gold_bonus_level   — +2.0% gold earned
 *   gold_level         — +500 protected gold per level (anti-PvP-loss reserve)
 *
 * Member slots remain on a SEPARATE 5-tier track (member_slots_level 1..5)
 * because uncapped player counts trivialise raids and chat.
 *
 * Track upgrades consume guild XP:
 *   cost(next) = 100 × next_level (linear)
 *
 * So leveling one track to 100 takes 100×(1+2+...+100) = 505,000 guild XP.
 * Players accumulate that XP by donating gold (1:1) or gems (10:1).
 *
 * Bonuses apply automatically to every member through deriveStats() and the
 * reward-multiplier helper used by hunting/tower/arena/etc.
 */

import { getDb } from '../db';

export type TrackKey =
  | 'attr' | 'power' | 'defence' | 'exp_bonus' | 'gold_bonus' | 'gold_protected';

export const GUILD_TRACKS: { key: TrackKey; column: string; label: string; description: string; max: number }[] = [
  { key: 'attr',           column: 'attr_level',         label: 'Bloodlines',      description: '+0.5% to every attribute per level (str / dex / con / int / wis / cha).', max: 100 },
  { key: 'power',          column: 'power_level',        label: 'Guild Power',      description: '+0.5% attack damage per level.', max: 100 },
  { key: 'defence',        column: 'defence_level',      label: 'Guild Defence',    description: '+1.0% defense per level.', max: 100 },
  { key: 'exp_bonus',      column: 'exp_bonus_level',    label: 'Scholarship',      description: '+2% XP gained per level — applies to every reward.', max: 100 },
  { key: 'gold_bonus',     column: 'gold_bonus_level',   label: 'Merchant Charter', description: '+2% gold earned per level — applies to every reward.', max: 100 },
  { key: 'gold_protected', column: 'gold_level',         label: 'Strongroom',       description: '+500 protected gold per level. Gold under this cap cannot be lost in PvP.', max: 100 },
];

export interface GuildLevels {
  member_slots_level: number;
  attr: number;
  power: number;
  defence: number;
  exp_bonus: number;
  gold_bonus: number;
  gold_protected: number;
}

export interface GuildBuffs {
  member_slots: number;
  attr_multiplier: number;
  power_multiplier: number;
  defence_multiplier: number;
  exp_multiplier: number;
  gold_multiplier: number;
  protected_gold: number;
}

export const MEMBER_SLOTS_BY_LEVEL: Record<number, number> = {
  1: 10, 2: 15, 3: 20, 4: 25, 5: 30,
};

export function computeBuffs(lv: GuildLevels): GuildBuffs {
  // Balance: these multipliers stack MULTIPLICATIVELY on every member and,
  // pre-tuning, a maxed guild handed out gold ×3.0 · xp ×3.0 · attr ×1.5 ·
  // power ×1.5 · defence ×2.0. Layered on the reward faucets that fix
  // followed, this printed ~1M gold/xp per hour and was a gem-funded
  // pay-to-win ramp. The gold/xp lines are pulled to a max of +75% and
  // defence to +50%; a hard cap guards against a track climbing past tier.
  const cap = (n: number) => Math.min(100, Math.max(0, n));
  return {
    member_slots:        MEMBER_SLOTS_BY_LEVEL[Math.min(5, Math.max(1, lv.member_slots_level))],
    attr_multiplier:     1 + cap(lv.attr) * 0.005,        // max ×1.5
    power_multiplier:    1 + cap(lv.power) * 0.005,       // max ×1.5
    defence_multiplier:  1 + cap(lv.defence) * 0.005,     // max ×1.5 (was ×2.0)
    exp_multiplier:      1 + cap(lv.exp_bonus) * 0.0075,  // max ×1.75 (was ×3.0)
    gold_multiplier:     1 + cap(lv.gold_bonus) * 0.0075, // max ×1.75 (was ×3.0)
    protected_gold:      lv.gold_protected * 500,
  };
}

/** XP cost to advance a track from `current` to `current + 1`. */
export function trackUpgradeCost(current: number): number {
  return 100 * (current + 1);
}

/** Load (and zero-fill) the six track levels for a guild. */
export function loadGuildLevels(guildId: number): GuildLevels {
  const row = getDb()
    .prepare(
      `SELECT level AS member_slots_level,
              COALESCE(attr_level, 0)         AS attr,
              COALESCE(power_level, 0)        AS power,
              COALESCE(defence_level, 0)      AS defence,
              COALESCE(exp_bonus_level, 0)    AS exp_bonus,
              COALESCE(gold_bonus_level, 0)   AS gold_bonus,
              COALESCE(gold_level, 0)         AS gold_protected
       FROM guilds WHERE id = ?`,
    )
    .get(guildId) as GuildLevels | undefined;
  return row || {
    member_slots_level: 1, attr: 0, power: 0, defence: 0,
    exp_bonus: 0, gold_bonus: 0, gold_protected: 0,
  };
}

/** Convenience for the deriveStats / reward-multiplier paths. */
export function loadGuildBuffsForCharacter(characterId: number): GuildBuffs | null {
  const row = getDb()
    .prepare('SELECT guild_id FROM guild_members WHERE character_id = ?')
    .get(characterId) as { guild_id: number } | undefined;
  if (!row) return null;
  return computeBuffs(loadGuildLevels(row.guild_id));
}

/* ───────── Legacy guild-create constants the rest of the code already uses ─ */

export const GUILD_CREATE_COST = 1000;
export const GUILD_CREATE_LEVEL_REQ = 5;

/** Member-slot tier XP gates (kept for the existing member-slots upgrade). */
export const MEMBER_SLOT_TIER_XP: Record<number, number> = {
  2: 5_000, 3: 25_000, 4: 100_000, 5: 350_000,
};
export const MEMBER_SLOT_TIER_GEMS: Record<number, number> = {
  2: 0, 3: 0, 4: 200, 5: 600,
};
