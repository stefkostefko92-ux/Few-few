/** Dungeons — multi-stage chained encounters that pay out big at the end. */

import { REGION_BANDS } from './monsters';

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

/* Audit balance #4: there were only 4 hand-built dungeons (max level_req
 * 18), but the realm extends to Lv 350. Past Lv 24 the only PvE was
 * hunting. We now procedurally generate one dungeon per high-tier region
 * band, mirroring the same pattern monsters use — same creatures from
 * the region's pool, energy/loot/cooldown scaled with band level. */
function generateBandDungeons(): DungeonDef[] {
  const out: DungeonDef[] = [];
  const lootBySlug = (band: string, tier: number) => {
    // Pull from the auto-generated tier-N pool by slug pattern; falls back
    // to the legendary catch-alls if the player's tier isn't seeded yet.
    const prefix = ['', '', '', '', 'elite', '', 'mythic', 'ascendant', 'cosmic', 'eldritch', 'divine'][tier];
    if (!prefix) return ['dragonbane', 'voidwhisper', 'ring_of_power'];
    return [
      `${prefix}_sword_${tier}`,
      `${prefix}_armor_${tier}`,
      `${prefix}_helm_${tier}`,
      `${prefix}_shield_${tier}`,
      `${prefix}_ring_${tier}`,
    ];
  };
  for (let i = 0; i < REGION_BANDS.length; i++) {
    const b = REGION_BANDS[i];
    const midLevel = Math.round((b.gate + b.max) / 2);
    const tier = Math.min(10, Math.max(4, Math.ceil(midLevel / 35)));
    // Pick 4 monsters from the band's procedural slug range (lvl gate+1,
    // mid-low, mid-high, max-1) so the dungeon scales from "tutorial of
    // the band" to "boss of the band".
    const lo = b.gate + 1;
    const hi = Math.max(lo + 1, b.max - 1);
    const stages: DungeonStage[] = [
      { monster_slug: `${b.region}_${lo}`,                        narration: `A scout of the ${b.name.toLowerCase()} bars your path.` },
      { monster_slug: `${b.region}_${Math.round((lo + hi) / 2)}`, narration: `Deeper in, a sworn-warrior of the realm.` },
      { monster_slug: `${b.region}_${Math.round((lo + hi*2) / 3)}`, narration: `A champion of the band, bristling with relics.` },
      { monster_slug: `${b.region}_${hi}`,                        narration: `The warlord at the heart of ${b.name}.` },
    ];
    out.push({
      slug: `${b.region}_descent`,
      name: `${b.name} — Descent`,
      region: b.region,
      level_req: b.gate,
      energy_cost: Math.min(120, 30 + Math.round((b.gate - 25) * 0.4)),
      cooldown_hours: 24,
      intro: `You stand at the threshold of ${b.name}. The air thickens; the path goes down.`,
      clear_text: `You emerge from ${b.name} with a hoard, and a story none will believe.`,
      stages,
      xp_bonus: Math.round(2000 * Math.pow(midLevel / 25, 1.3)),
      gold_bonus: Math.round(800 * Math.pow(midLevel / 25, 1.25)),
      loot_pool: lootBySlug(b.region, tier),
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
