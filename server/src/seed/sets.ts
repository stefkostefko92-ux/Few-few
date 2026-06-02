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

  // ====== AUTO-GENERATED TIER SETS for the T4 / T6 / T7 / T8 / T9 / T10
  // generated equipment. Each set assembles the matching prefix items so
  // wearing 4+ pieces from the same tier unlocks scaling bonuses.
  {
    slug: 'elite',
    name: 'Elite Vanguard',
    tier: 4,
    rarity: 'uncommon',
    lore: 'Issued to the kingdom\'s standing legion. Solid, dependable, never glamorous.',
    pieces: ['elite_armor_4','elite_helm_4','elite_boots_4','elite_gloves_4','elite_shield_4','elite_cloak_4'],
    bonus_2: { hp_bonus: 60, defense_bonus: 6 },
    bonus_4: { hp_bonus: 160, defense_bonus: 18, str_bonus: 4 },
    bonus_6: { hp_bonus: 300, defense_bonus: 36, str_bonus: 8, atk_bonus: 8 },
  },
  {
    slug: 'mythic',
    name: 'Mythic Regalia',
    tier: 6,
    rarity: 'rare',
    lore: 'Pieces forged from a single meteor. They warm the wearer faintly, even at rest.',
    pieces: ['mythic_armor_6','mythic_helm_6','mythic_boots_6','mythic_gloves_6','mythic_shield_6','mythic_cloak_6'],
    bonus_2: { hp_bonus: 220, defense_bonus: 14 },
    bonus_4: { hp_bonus: 500, defense_bonus: 40, str_bonus: 10, atk_bonus: 14 },
    bonus_6: { hp_bonus: 900, defense_bonus: 80, str_bonus: 22, atk_bonus: 30, crit_bonus: 0.04 },
  },
  {
    slug: 'ascendant',
    name: 'Ascendant Garb',
    tier: 7,
    rarity: 'rare',
    lore: 'Etched with runes that drift across the surface in moonlight.',
    pieces: ['ascendant_armor_7','ascendant_helm_7','ascendant_boots_7','ascendant_gloves_7','ascendant_shield_7','ascendant_cloak_7'],
    bonus_2: { hp_bonus: 380, defense_bonus: 22 },
    bonus_4: { hp_bonus: 780, defense_bonus: 64, str_bonus: 14, atk_bonus: 22 },
    bonus_6: { hp_bonus: 1400, defense_bonus: 130, str_bonus: 32, atk_bonus: 48, crit_bonus: 0.06 },
  },
  {
    slug: 'cosmic',
    name: 'Cosmic Vestments',
    tier: 8,
    rarity: 'epic',
    lore: 'When the stars align, the wearer briefly feels themselves elsewhere.',
    pieces: ['cosmic_armor_8','cosmic_helm_8','cosmic_boots_8','cosmic_gloves_8','cosmic_shield_8','cosmic_cloak_8'],
    bonus_2: { hp_bonus: 600, defense_bonus: 36 },
    bonus_4: { hp_bonus: 1200, defense_bonus: 100, str_bonus: 22, atk_bonus: 36 },
    bonus_6: { hp_bonus: 2200, defense_bonus: 210, str_bonus: 48, atk_bonus: 75, crit_bonus: 0.08, dodge_bonus: 0.04 },
  },
  {
    slug: 'eldritch',
    name: 'Eldritch Mantle',
    tier: 9,
    rarity: 'epic',
    lore: 'Older than language. The metal remembers what it used to be.',
    pieces: ['eldritch_armor_9','eldritch_helm_9','eldritch_boots_9','eldritch_gloves_9','eldritch_shield_9','eldritch_cloak_9'],
    bonus_2: { hp_bonus: 900, defense_bonus: 52 },
    bonus_4: { hp_bonus: 1800, defense_bonus: 150, str_bonus: 32, atk_bonus: 54 },
    bonus_6: { hp_bonus: 3300, defense_bonus: 320, str_bonus: 70, atk_bonus: 115, crit_bonus: 0.1, dodge_bonus: 0.06 },
  },
  {
    slug: 'divine',
    name: 'Divine Apotheosis',
    tier: 10,
    rarity: 'legendary',
    lore: 'Touched by a god in passing — and never quite the same again.',
    pieces: ['divine_armor_10','divine_helm_10','divine_boots_10','divine_gloves_10','divine_shield_10','divine_cloak_10'],
    bonus_2: { hp_bonus: 1400, defense_bonus: 80 },
    bonus_4: { hp_bonus: 2800, defense_bonus: 230, str_bonus: 48, atk_bonus: 86 },
    bonus_6: { hp_bonus: 5200, defense_bonus: 500, str_bonus: 110, atk_bonus: 180, crit_bonus: 0.15, dodge_bonus: 0.08 },
  },
];

export function findSetForItem(slug: string): SetDef | undefined {
  return ITEM_SETS.find((s) => s.pieces.includes(slug));
}
