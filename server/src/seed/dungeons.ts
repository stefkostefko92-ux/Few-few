/** Dungeons — multi-stage chained encounters that pay out big at the end. */

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
];

export function findDungeon(slug: string): DungeonDef | undefined {
  return DUNGEONS.find((d) => d.slug === slug);
}
