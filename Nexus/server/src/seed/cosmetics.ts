/**
 * Cosmetic catalog — purely visual unlocks.
 * Free to acquire (achievement-based), never sold for premium currency.
 */

export interface AvatarDef {
  slug: string;
  name: string;
  class?: 'warrior' | 'ranger' | 'mage' | 'rogue';
  unlocked_by?: string; // achievement slug or 'default'
}

export interface FrameDef {
  slug: string;
  name: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  /** CSS color values (border + glow) */
  border: string;
  glow: string;
  /** Optional pattern: 'plain' | 'engraved' | 'runic' | 'flame' | 'cosmic' */
  pattern: string;
  unlocked_by?: string; // achievement slug or 'default'
}

export const AVATARS: AvatarDef[] = [
  { slug: 'warrior_01', name: 'Iron Sentinel',    class: 'warrior', unlocked_by: 'default' },
  { slug: 'warrior_02', name: 'Crimson Vanguard', class: 'warrior', unlocked_by: 'wins_25' },
  { slug: 'warrior_03', name: 'Citadel Marshal',  class: 'warrior', unlocked_by: 'level_15' },
  { slug: 'ranger_01',  name: 'Forest Walker',    class: 'ranger',  unlocked_by: 'default' },
  { slug: 'ranger_02',  name: 'Twilight Stalker', class: 'ranger',  unlocked_by: 'wins_25' },
  { slug: 'ranger_03',  name: 'Stormbow Archon',  class: 'ranger',  unlocked_by: 'level_15' },
  { slug: 'mage_01',    name: 'Conclave Adept',   class: 'mage',    unlocked_by: 'default' },
  { slug: 'mage_02',    name: 'Voidcaller',       class: 'mage',    unlocked_by: 'wins_25' },
  { slug: 'mage_03',    name: 'Starbound Sage',   class: 'mage',    unlocked_by: 'level_15' },
  { slug: 'rogue_01',   name: 'Shadowbound',      class: 'rogue',   unlocked_by: 'default' },
  { slug: 'rogue_02',   name: 'Veiled Blade',     class: 'rogue',   unlocked_by: 'wins_25' },
  { slug: 'rogue_03',   name: 'Nightspeaker',     class: 'rogue',   unlocked_by: 'level_15' },
];

export const FRAMES: FrameDef[] = [
  { slug: 'plain',       name: 'Plain',          rarity: 'common',    border: '#3a4460', glow: 'transparent',                    pattern: 'plain',    unlocked_by: 'default' },
  { slug: 'verdant',     name: 'Verdant Vine',   rarity: 'common',    border: '#6ad8a4', glow: 'rgba(106,216,164,.18)',           pattern: 'engraved', unlocked_by: 'first_blood' },
  { slug: 'iron',        name: 'Iron-bound',     rarity: 'uncommon',  border: '#7c7d83', glow: 'rgba(124,125,131,.25)',           pattern: 'engraved', unlocked_by: 'slayer_10' },
  { slug: 'silver',      name: 'Silvered',       rarity: 'uncommon',  border: '#c7c8d6', glow: 'rgba(199,200,214,.28)',           pattern: 'engraved', unlocked_by: 'wins_25' },
  { slug: 'sapphire',    name: 'Sapphire Sigil', rarity: 'rare',      border: '#6aa7ff', glow: 'rgba(106,167,255,.35)',           pattern: 'runic',    unlocked_by: 'arena_1100' },
  { slug: 'arcane',      name: 'Arcane Weave',   rarity: 'rare',      border: '#c294ff', glow: 'rgba(194,148,255,.4)',            pattern: 'runic',    unlocked_by: 'bestiary_10' },
  { slug: 'ember',       name: 'Ember-forged',   rarity: 'epic',      border: '#ffb159', glow: 'rgba(255,177,89,.45)',            pattern: 'flame',    unlocked_by: 'dungeon_10' },
  { slug: 'crimson',     name: 'Crimson Banner', rarity: 'epic',      border: '#e85a4f', glow: 'rgba(232,90,79,.45)',             pattern: 'flame',    unlocked_by: 'wins_100' },
  { slug: 'voidlace',    name: 'Voidlace',       rarity: 'epic',      border: '#9050d0', glow: 'rgba(144,80,208,.5)',             pattern: 'cosmic',   unlocked_by: 'arena_1300' },
  { slug: 'sunforged',   name: 'Sunforged',      rarity: 'legendary', border: '#ffd34d', glow: 'rgba(255,211,77,.55)',            pattern: 'cosmic',   unlocked_by: 'level_25' },
  { slug: 'mythwoven',   name: 'Mythwoven',      rarity: 'legendary', border: '#ffe88a', glow: 'rgba(255,232,138,.6)',            pattern: 'cosmic',   unlocked_by: 'bestiary_all' },
  { slug: 'crown_eternal', name: 'Eternal Crown', rarity: 'legendary', border: '#ffe88a', glow: 'rgba(255,232,138,.7)',           pattern: 'cosmic',   unlocked_by: 'arena_1500' },
];

export function findAvatar(slug: string): AvatarDef | undefined {
  return AVATARS.find((a) => a.slug === slug);
}
export function findFrame(slug: string): FrameDef | undefined {
  return FRAMES.find((f) => f.slug === slug);
}
