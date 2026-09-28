/** Dungeons — multi-stage chained encounters that pay out big at the end. */

import { MONSTER_SEED } from './monsters';
import { tierForEffectiveLevel } from '../game/drops';

export interface DungeonStage {
  monster_slug: string;
  narration: string;
}

export interface DungeonDef {
  slug: string;
  name: string;
  region: string;
  level_req: number;
  energy_cost: number; // paid to enter
  stages: DungeonStage[];
  xp_bonus: number;
  gold_bonus: number;
  loot_pool: string[]; // possible item rewards on clear
  intro: string;
  clear_text: string;
  cooldown_hours: number;
}

/* One dungeon per expansion region, generated from the region's ACTUAL
 * hand-built monster roster rather than slug-pattern guessing. The four
 * stages are picked by level: the region's lowest monster (scout), two
 * mid-band picks, and the region cap-boss (APEX). Loot pools map the
 * region's mid-level to the matching shop-tier gear set.
 *
 * Reading from MONSTER_SEED keeps this generator correct by
 * construction — a stage can only reference a monster that exists,
 * which scripts/verify-content.ts asserts at build time. */
const EXPANSION_REGIONS: Array<{ region: string; name: string; gate: number }> = [
  { region: 'emberreach',       name: 'Emberreach',         gate: 26 },
  { region: 'hammerhand_pass',  name: 'Hammerhand Pass',    gate: 50 },
  { region: 'conclave_aedric',  name: 'Conclave of Aedric', gate: 75 },
  { region: 'saltmarsh',        name: 'Saltmarsh',          gate: 105 },
  { region: 'frostvale',        name: 'Frostvale',          gate: 140 },
  { region: 'black_spire',      name: 'Black Spire',        gate: 175 },
  { region: 'stormpeaks',       name: 'The Stormpeaks',     gate: 201 },
  { region: 'voidshade_hollow', name: 'Voidshade Hollow',   gate: 231 },
  { region: 'mooncradle',       name: 'Mooncradle',         gate: 261 },
  { region: 'worldspine',       name: 'The Worldspine',     gate: 291 },
  { region: 'eternal_throne',   name: 'The Eternal Throne', gate: 321 },
];

function generateBandDungeons(): DungeonDef[] {
  const out: DungeonDef[] = [];
  const lootByTier = (tier: number) => {
    const prefix = ['', '', '', '', 'elite', 'adept', 'mythic', 'ascendant', 'cosmic', 'eldritch', 'divine'][tier];
    if (!prefix) return ['dragonbane', 'voidwhisper', 'ring_of_power'];
    return [
      `${prefix}_sword_${tier}`,
      `${prefix}_armor_${tier}`,
      `${prefix}_helm_${tier}`,
      `${prefix}_shield_${tier}`,
      `${prefix}_ring_${tier}`,
    ];
  };
  for (const b of EXPANSION_REGIONS) {
    const roster = MONSTER_SEED
      .filter((m) => m.region === b.region)
      .sort((x, y) => x.level - y.level);
    if (roster.length < 4) continue; // defensive — verify-content flags this
    const pick = (frac: number) => roster[Math.min(roster.length - 1, Math.round(frac * (roster.length - 1)))];
    const s1 = pick(0), s2 = pick(0.4), s3 = pick(0.7), s4 = roster[roster.length - 1];
    const midLevel = s2.level;
    // Unified tier mapping (game/drops.ts) so dungeon loot tiers line
    // up with hunt/tower/arena drops at the same level. Floor at T4 —
    // the prefixed gear sets start there.
    const tier = Math.max(4, tierForEffectiveLevel(midLevel));
    out.push({
      slug: `${b.region}_descent`,
      name: `${b.name} — Descent`,
      region: b.region,
      level_req: b.gate,
      energy_cost: Math.min(120, 30 + Math.round((b.gate - 25) * 0.4)),
      cooldown_hours: 24,
      intro: `You stand at the threshold of ${b.name}. The air thickens; the path goes down.`,
      clear_text: `You emerge from ${b.name} with a hoard, and a story none will believe.`,
      stages: [
        { monster_slug: s1.slug, narration: `${s1.name} bars the entrance.` },
        { monster_slug: s2.slug, narration: `Deeper in: ${s2.name}.` },
        { monster_slug: s3.slug, narration: `${s3.name} guards the inner hall.` },
        { monster_slug: s4.slug, narration: `${s4.name} waits at the heart of ${b.name}.` },
      ],
      xp_bonus: Math.round(2000 * Math.pow(midLevel / 25, 1.3)),
      gold_bonus: Math.round(800 * Math.pow(midLevel / 25, 1.25)),
      loot_pool: lootByTier(tier),
    });
  }
  return out;
}

export const DUNGEONS: DungeonDef[] = [
  {
    slug: 'forgotten_crypt',
    name: 'The Forgotten Crypt',
    region: 'whispering_woods',
    level_req: 4,
    energy_cost: 15,
    cooldown_hours: 8,
    intro: 'A cracked mausoleum yawns open. Cold air, the smell of rot.',
    clear_text: 'You climb out into daylight, a sack of relics over your shoulder.',
    stages: [
      { monster_slug: 'forest_rat',    narration: 'Rats scatter across the broken stones.' },
      { monster_slug: 'forest_wolf',   narration: 'A wolf has made its den in the antechamber.' },
      { monster_slug: 'goblin_scout',  narration: 'A goblin scout has marked the crypt for its kin.' },
      { monster_slug: 'bandit',        narration: 'A hooded grave-robber bars your way.' },
    ],
    xp_bonus: 200,
    gold_bonus: 120,
    loot_pool: ['silver_ring', 'chain_helm', 'health_potion'],
  },
  {
    slug: 'orc_warcamp',
    name: 'Orc Warcamp',
    region: 'mistmoor_hills',
    level_req: 8,
    energy_cost: 25,
    cooldown_hours: 12,
    intro: 'Smoke and the smell of burnt meat. An orcish encampment.',
    clear_text: 'The chieftain falls; the camp scatters into the hills.',
    stages: [
      { monster_slug: 'orc_raider',  narration: 'A picket guard challenges you.' },
      { monster_slug: 'orc_raider',  narration: 'A second raider rises from a bonfire pit.' },
      { monster_slug: 'hill_troll',  narration: 'A troll lumbers from behind a longhouse.' },
      { monster_slug: 'mistmoor_witch', narration: 'The shaman-witch of the camp comes for your soul.' },
    ],
    xp_bonus: 600,
    gold_bonus: 400,
    loot_pool: ['steel_longsword', 'amulet_of_warding', 'kite_shield', 'chain_armor'],
  },
  {
    slug: 'caverns_descent',
    name: 'Caverns Descent',
    region: 'crystal_caverns',
    level_req: 13,
    energy_cost: 35,
    cooldown_hours: 16,
    intro: 'Crystalline depths. The air hums with old magic.',
    clear_text: 'You ascend with a hoard of glittering shards and a relic of the deep.',
    stages: [
      { monster_slug: 'cave_spider',     narration: 'Webs grasp at you in the dark.' },
      { monster_slug: 'crystal_serpent', narration: 'A serpent of living crystal coils to strike.' },
      { monster_slug: 'rock_golem',      narration: 'A golem of polished granite blocks the corridor.' },
      { monster_slug: 'caverns_overlord', narration: 'The Overlord himself, on his glittering throne.' },
    ],
    xp_bonus: 1400,
    gold_bonus: 900,
    loot_pool: ['plate_helm', 'plate_armor', 'mage_robe', 'flameblade'],
  },
  {
    slug: 'wastes_pilgrimage',
    name: 'Pilgrimage of Ash',
    region: 'ashen_wastes',
    level_req: 18,
    energy_cost: 50,
    cooldown_hours: 20,
    intro: 'The wastes go on forever. Wind, ash, and the cry of distant wings.',
    clear_text: 'You return from the wastes hardened, bearing relics of fire.',
    stages: [
      { monster_slug: 'ash_revenant',  narration: 'Revenants shamble from a dustpit.' },
      { monster_slug: 'ash_revenant',  narration: 'More rise — a captain among them.' },
      { monster_slug: 'fire_drake',    narration: 'A drake banks low overhead, then dives.' },
      { monster_slug: 'lava_titan',    narration: 'A titan of molten stone hauls itself upward.' },
    ],
    xp_bonus: 3000,
    gold_bonus: 2000,
    loot_pool: ['shadowfang_bow', 'archmage_staff', 'ring_of_power'],
  },
  ...generateBandDungeons(),
];

export function findDungeon(slug: string): DungeonDef | undefined {
  return DUNGEONS.find((d) => d.slug === slug);
}
