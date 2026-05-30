import type { CharacterClass } from '../types/domain';

/**
 * NPC training dummies that populate the arena from day one.
 * Names use a `TRAINER_<role>_<hex>` / `NPC_<role>_<hex>` pattern so it's
 * unambiguous to players that they're fighting an automated opponent and
 * not another human. is_npc = 1 is set by the seed runner, so derived
 * stats correctly skip the guild-bonus lookup for these rows.
 */

export interface DummySeed {
  name: string;
  class: CharacterClass;
  level: number;
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  skills: Partial<Record<'sword' | 'axe' | 'bow' | 'staff' | 'magic' | 'stealth', number>>;
  rating: number;
  equipment: string[]; // item slugs
}

export const DUMMY_SEED: DummySeed[] = [
  // Lv 1-3 — Oaken Hollow training partners
  {
    name: 'TRAINER_Warrior_06c5',
    class: 'warrior',
    level: 2,
    strength: 11, dexterity: 6, constitution: 9, intelligence: 3, wisdom: 4, charisma: 4,
    skills: { sword: 6, axe: 4 },
    rating: 960,
    equipment: ['iron_sword', 'leather_helm', 'leather_armor', 'leather_gloves', 'leather_boots', 'wooden_shield'],
  },
  {
    name: 'TRAINER_Conjurer_0d8a',
    class: 'mage',
    level: 2,
    strength: 3, dexterity: 5, constitution: 6, intelligence: 11, wisdom: 9, charisma: 6,
    skills: { staff: 5, magic: 6 },
    rating: 970,
    equipment: ['novice_staff', 'cloth_hood', 'cloth_robe', 'cloth_gloves', 'cloth_shoes'],
  },
  {
    name: 'TRAINER_Tracker_144f',
    class: 'ranger',
    level: 3,
    strength: 6, dexterity: 11, constitution: 7, intelligence: 4, wisdom: 6, charisma: 5,
    skills: { bow: 6, stealth: 4 },
    rating: 985,
    equipment: ['short_bow', 'leather_helm', 'leather_armor', 'leather_gloves', 'leather_boots'],
  },
  {
    name: 'TRAINER_Stalker_1b14',
    class: 'rogue',
    level: 3,
    strength: 6, dexterity: 10, constitution: 7, intelligence: 5, wisdom: 4, charisma: 7,
    skills: { sword: 4, stealth: 6 },
    rating: 990,
    equipment: ['rusty_dagger', 'leather_helm', 'leather_armor', 'leather_gloves', 'leather_boots'],
  },

  // Lv 5-7 — Mistmoor riders
  {
    name: 'NPC_Champion_21d9',
    class: 'warrior',
    level: 6,
    strength: 16, dexterity: 8, constitution: 14, intelligence: 4, wisdom: 5, charisma: 6,
    skills: { sword: 12, axe: 6 },
    rating: 1080,
    equipment: ['steel_longsword', 'chain_helm', 'chain_armor', 'chain_gloves', 'chain_boots', 'kite_shield'],
  },
  {
    name: 'NPC_Arcanist_289e',
    class: 'mage',
    level: 7,
    strength: 4, dexterity: 7, constitution: 8, intelligence: 17, wisdom: 14, charisma: 7,
    skills: { staff: 9, magic: 12 },
    rating: 1100,
    equipment: ['sapphire_staff', 'cloth_hood', 'cloth_robe', 'cloth_gloves', 'cloth_shoes'],
  },
  {
    name: 'NPC_Ranger_2f63',
    class: 'ranger',
    level: 7,
    strength: 8, dexterity: 17, constitution: 10, intelligence: 6, wisdom: 8, charisma: 6,
    skills: { bow: 12, stealth: 8 },
    rating: 1115,
    equipment: ['elven_bow', 'leather_helm', 'leather_armor', 'leather_gloves', 'leather_boots'],
  },

  // Lv 10-13 — Caverns delvers
  {
    name: 'NPC_Sentinel_3628',
    class: 'warrior',
    level: 11,
    strength: 22, dexterity: 10, constitution: 20, intelligence: 5, wisdom: 6, charisma: 8,
    skills: { sword: 18, axe: 12 },
    rating: 1220,
    equipment: ['flameblade', 'plate_helm', 'plate_armor', 'chain_gloves', 'chain_boots', 'kite_shield', 'silver_ring'],
  },
  {
    name: 'NPC_Lorekeeper_3ced',
    class: 'mage',
    level: 12,
    strength: 5, dexterity: 9, constitution: 11, intelligence: 24, wisdom: 20, charisma: 9,
    skills: { staff: 14, magic: 18 },
    rating: 1250,
    equipment: ['archmage_staff', 'cloth_hood', 'mage_robe', 'cloth_gloves', 'cloth_shoes', 'amulet_of_warding'],
  },
  {
    name: 'NPC_Stalker_43b2',
    class: 'rogue',
    level: 12,
    strength: 10, dexterity: 22, constitution: 12, intelligence: 8, wisdom: 7, charisma: 10,
    skills: { sword: 14, stealth: 18 },
    rating: 1240,
    equipment: ['flameblade', 'leather_helm', 'leather_armor', 'leather_gloves', 'leather_boots', 'silver_ring'],
  },

  // Lv 15-18 — Wasteland veterans
  {
    name: 'NPC_Champion_4a77',
    class: 'warrior',
    level: 16,
    strength: 30, dexterity: 12, constitution: 28, intelligence: 6, wisdom: 8, charisma: 12,
    skills: { sword: 24, axe: 18 },
    rating: 1360,
    equipment: ['flameblade', 'plate_helm', 'plate_armor', 'chain_gloves', 'chain_boots', 'kite_shield', 'silver_ring', 'amulet_of_warding'],
  },
  {
    name: 'NPC_Arcanist_513c',
    class: 'mage',
    level: 18,
    strength: 6, dexterity: 11, constitution: 14, intelligence: 32, wisdom: 27, charisma: 11,
    skills: { staff: 20, magic: 25 },
    rating: 1420,
    equipment: ['archmage_staff', 'cloth_hood', 'mage_robe', 'cloth_gloves', 'cloth_shoes', 'amulet_of_warding'],
  },
  {
    name: 'NPC_Ranger_5801',
    class: 'ranger',
    level: 17,
    strength: 11, dexterity: 30, constitution: 14, intelligence: 8, wisdom: 12, charisma: 8,
    skills: { bow: 24, stealth: 18 },
    rating: 1400,
    equipment: ['shadowfang_bow', 'leather_helm', 'leather_armor', 'leather_gloves', 'leather_boots', 'amulet_of_warding'],
  },

  // Lv 22+ — Endgame champions
  {
    name: 'NPC_Sentinel_5ec6',
    class: 'warrior',
    level: 22,
    strength: 38, dexterity: 14, constitution: 36, intelligence: 7, wisdom: 9, charisma: 14,
    skills: { sword: 32, axe: 24 },
    rating: 1560,
    equipment: ['dragonbane', 'plate_helm', 'plate_armor', 'chain_gloves', 'chain_boots', 'kite_shield', 'ring_of_power', 'amulet_of_warding'],
  },
  {
    name: 'NPC_Lorekeeper_658b',
    class: 'mage',
    level: 24,
    strength: 7, dexterity: 13, constitution: 16, intelligence: 40, wisdom: 34, charisma: 12,
    skills: { staff: 28, magic: 34 },
    rating: 1620,
    equipment: ['voidwhisper', 'cloth_hood', 'mage_robe', 'cloth_gloves', 'cloth_shoes', 'ring_of_power', 'amulet_of_warding'],
  },
];
