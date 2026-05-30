/**
 * Item Sets — Nexus Dominion.
 *
 * Each set defines a themed collection of equipment pieces and the bonuses
 * a hero receives at 2 / 4 / 6 simultaneously equipped pieces. The bonus
 * tier system is a standard MMORPG progression pattern; all set names,
 * piece lists, lore, and bonus values are original designs.
 */

export interface SetBonus {
  hp_bonus?: number;
  mp_bonus?: number;
  str_bonus?: number;
  dex_bonus?: number;
  con_bonus?: number;
  int_bonus?: number;
  wis_bonus?: number;
  cha_bonus?: number;
  defense_bonus?: number;
  atk_bonus?: number;
  crit_bonus?: number;   // flat % bonus to crit chance (e.g. 0.05 = +5%)
  dodge_bonus?: number;  // flat % bonus to dodge chance
}

export interface SetDef {
  slug: string;
  name: string;
  tier: number;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  class_focus?: 'warrior' | 'ranger' | 'mage' | 'rogue';
  lore: string;
  pieces: string[];        // item slugs that belong to this set
  bonus_2?: SetBonus;
  bonus_4?: SetBonus;
  bonus_6?: SetBonus;
}

export const ITEM_SETS: SetDef[] = [
  /* ===== Tier 1 — Starter set, accessible to every class ===== */
  {
    slug: 'wayfarer',
    name: "Wayfarer's Garb",
    tier: 1,
    rarity: 'common',
    lore:
      'Boiled leather and stitched hide. Worn by every aspiring hero on their first night out of Oaken Hollow.',
    pieces: ['leather_helm', 'leather_armor', 'leather_gloves', 'leather_boots'],
    bonus_2: { hp_bonus: 8, dex_bonus: 1 },
    bonus_4: { hp_bonus: 18, dex_bonus: 2, defense_bonus: 2 },
  },

  /* ===== Tier 2 — Class-themed early sets ===== */
  {
    slug: 'ironguard',
    name: 'Ironguard Plate',
    tier: 2,
    rarity: 'uncommon',
    class_focus: 'warrior',
    lore:
      'Standard issue for the Iron Watch — the kingdom-conscripted infantry who patrol the bridges and tollroads.',
    pieces: ['chain_helm', 'chain_armor', 'chain_gloves', 'chain_boots', 'kite_shield', 'steel_longsword'],
    bonus_2: { hp_bonus: 25, str_bonus: 2 },
    bonus_4: { hp_bonus: 55, defense_bonus: 6, str_bonus: 3 },
    bonus_6: { hp_bonus: 100, defense_bonus: 12, str_bonus: 5, atk_bonus: 4 },
  },
  {
    slug: 'sylvan_marshal',
    name: 'Sylvan Marshal',
    tier: 2,
    rarity: 'uncommon',
    class_focus: 'ranger',
    lore:
      'Forest-dyed leathers worn by the marshals who walk the Whispering Woods and the high paths of Mistmoor.',
    pieces: ['leather_helm', 'leather_armor', 'leather_gloves', 'leather_boots', 'elven_bow'],
    bonus_2: { dex_bonus: 3, crit_bonus: 0.03 },
    bonus_4: { dex_bonus: 5, dodge_bonus: 0.04, atk_bonus: 3 },
  },
  {
    slug: 'arcane_conclave',
    name: 'Arcane Conclave',
    tier: 2,
    rarity: 'uncommon',
    class_focus: 'mage',
    lore:
      'Spell-thread robes and runed silks granted to junior members of the Conclave at Aedric.',
    pieces: ['cloth_hood', 'cloth_robe', 'cloth_gloves', 'cloth_shoes', 'sapphire_staff'],
    bonus_2: { mp_bonus: 25, int_bonus: 3 },
    bonus_4: { mp_bonus: 50, int_bonus: 5, wis_bonus: 3 },
  },
  {
    slug: 'nightveil',
    name: 'Nightveil',
    tier: 2,
    rarity: 'uncommon',
    class_focus: 'rogue',
    lore:
      "A killer's wardrobe. Charcoal hood, black-tinted plates, dyed leather. Made to disappear at dusk.",
    pieces: ['leather_helm', 'leather_armor', 'leather_gloves', 'leather_boots', 'rusty_dagger'],
    bonus_2: { dex_bonus: 3, dodge_bonus: 0.04 },
    bonus_4: { dex_bonus: 5, crit_bonus: 0.05, atk_bonus: 3 },
  },

  /* ===== Tier 3 — Rare adventurer sets ===== */
  {
    slug: 'sunforged',
    name: 'Sunforged Champion',
    tier: 3,
    rarity: 'rare',
    class_focus: 'warrior',
    lore:
      'Forged in the molten kilns of the Ember Spires. Armour that the Lava Titans cannot fully crush.',
    pieces: ['plate_helm', 'plate_armor', 'chain_gloves', 'chain_boots', 'flameblade'],
    bonus_2: { hp_bonus: 80, str_bonus: 4 },
    bonus_4: { hp_bonus: 180, defense_bonus: 18, str_bonus: 6, atk_bonus: 8 },
  },
  {
    slug: 'voidshard',
    name: 'Voidshard Adept',
    tier: 4,
    rarity: 'epic',
    class_focus: 'mage',
    lore:
      'Robes woven with strands of crystallised dark from the Shadowfell. Whispers of dead empires cling to the fabric.',
    pieces: ['cloth_hood', 'mage_robe', 'cloth_gloves', 'cloth_shoes', 'archmage_staff', 'amulet_of_warding'],
    bonus_2: { mp_bonus: 60, int_bonus: 6 },
    bonus_4: { mp_bonus: 120, int_bonus: 10, wis_bonus: 8, atk_bonus: 8 },
    bonus_6: { mp_bonus: 220, int_bonus: 16, wis_bonus: 14, atk_bonus: 16, crit_bonus: 0.08 },
  },

  /* ===== Tier 5 — Legendary endgame sets ===== */
  {
    slug: 'mythwoven',
    name: 'Solar Mythwoven',
    tier: 5,
    rarity: 'legendary',
    lore:
      'A regalia thought lost with the first Hero of the Realm. The fabric drinks sunlight; the steel sheds it.',
    pieces: ['plate_helm', 'plate_armor', 'chain_gloves', 'chain_boots', 'dragonbane', 'ring_of_power'],
    bonus_2: { hp_bonus: 150, str_bonus: 6 },
    bonus_4: { hp_bonus: 320, defense_bonus: 24, str_bonus: 10, atk_bonus: 14 },
    bonus_6: { hp_bonus: 600, defense_bonus: 50, str_bonus: 18, atk_bonus: 30, crit_bonus: 0.1, dodge_bonus: 0.05 },
  },
];

export function findSetForItem(slug: string): SetDef | undefined {
  return ITEM_SETS.find((s) => s.pieces.includes(slug));
}
