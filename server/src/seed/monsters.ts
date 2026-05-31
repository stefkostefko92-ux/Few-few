export const MONSTER_SEED = [
  // Whispering Woods (lvl 1-5)
  { slug: 'forest_rat', name: 'Forest Rat', level: 1, hp: 18, atk_min: 2, atk_max: 4, defense: 0, speed: 6, xp_reward: 4, gold_min: 1, gold_max: 3, sprite: 'rat', family: 'beast', region: 'whispering_woods' },
  { slug: 'wild_boar', name: 'Wild Boar', level: 2, hp: 30, atk_min: 3, atk_max: 6, defense: 1, speed: 5, xp_reward: 8, gold_min: 2, gold_max: 5, sprite: 'boar', family: 'beast', region: 'whispering_woods' },
  { slug: 'goblin_scout', name: 'Goblin Scout', level: 3, hp: 40, atk_min: 4, atk_max: 8, defense: 1, speed: 6, xp_reward: 12, gold_min: 3, gold_max: 7, sprite: 'goblin', family: 'humanoid', region: 'whispering_woods' },
  { slug: 'forest_wolf', name: 'Forest Wolf', level: 4, hp: 55, atk_min: 6, atk_max: 11, defense: 2, speed: 7, xp_reward: 18, gold_min: 4, gold_max: 8, sprite: 'wolf', family: 'beast', region: 'whispering_woods' },
  { slug: 'bandit', name: 'Hooded Bandit', level: 5, hp: 75, atk_min: 8, atk_max: 14, defense: 3, speed: 6, xp_reward: 24, gold_min: 6, gold_max: 12, sprite: 'bandit', family: 'humanoid', region: 'whispering_woods' },

  // Mistmoor Hills (lvl 5-10)
  { slug: 'hill_troll', name: 'Hill Troll', level: 7, hp: 130, atk_min: 12, atk_max: 20, defense: 5, speed: 4, xp_reward: 50, gold_min: 10, gold_max: 18, sprite: 'troll', family: 'giant', region: 'mistmoor_hills' },
  { slug: 'orc_raider', name: 'Orc Raider', level: 8, hp: 150, atk_min: 14, atk_max: 22, defense: 6, speed: 5, xp_reward: 60, gold_min: 12, gold_max: 22, sprite: 'orc', family: 'humanoid', region: 'mistmoor_hills' },
  { slug: 'dire_wolf', name: 'Dire Wolf', level: 9, hp: 175, atk_min: 16, atk_max: 26, defense: 6, speed: 8, xp_reward: 75, gold_min: 14, gold_max: 25, sprite: 'wolf', family: 'beast', region: 'mistmoor_hills' },
  { slug: 'mistmoor_witch', name: 'Mistmoor Witch', level: 10, hp: 180, atk_min: 18, atk_max: 30, defense: 4, speed: 7, xp_reward: 90, gold_min: 18, gold_max: 32, sprite: 'witch', family: 'magic', region: 'mistmoor_hills' },

  // Crystal Caverns (lvl 10-15)
  { slug: 'cave_spider', name: 'Cave Spider', level: 11, hp: 200, atk_min: 18, atk_max: 32, defense: 7, speed: 8, xp_reward: 100, gold_min: 18, gold_max: 30, sprite: 'spider', family: 'beast', region: 'crystal_caverns' },
  { slug: 'rock_golem', name: 'Rock Golem', level: 13, hp: 320, atk_min: 22, atk_max: 38, defense: 14, speed: 3, xp_reward: 140, gold_min: 28, gold_max: 48, sprite: 'golem', family: 'construct', region: 'crystal_caverns' },
  { slug: 'crystal_serpent', name: 'Crystal Serpent', level: 14, hp: 300, atk_min: 26, atk_max: 42, defense: 8, speed: 8, xp_reward: 160, gold_min: 32, gold_max: 55, sprite: 'serpent', family: 'beast', region: 'crystal_caverns' },
  { slug: 'caverns_overlord', name: 'Caverns Overlord', level: 15, hp: 480, atk_min: 30, atk_max: 50, defense: 12, speed: 6, xp_reward: 220, gold_min: 50, gold_max: 90, sprite: 'overlord', family: 'humanoid', region: 'crystal_caverns' },

  // Ashen Wastes (lvl 15-22)
  { slug: 'ash_revenant', name: 'Ash Revenant', level: 17, hp: 540, atk_min: 34, atk_max: 58, defense: 10, speed: 7, xp_reward: 280, gold_min: 55, gold_max: 95, sprite: 'wraith', family: 'undead', region: 'ashen_wastes' },
  { slug: 'fire_drake', name: 'Fire Drake', level: 20, hp: 720, atk_min: 42, atk_max: 70, defense: 15, speed: 7, xp_reward: 400, gold_min: 80, gold_max: 140, sprite: 'drake', family: 'dragon', region: 'ashen_wastes' },
  { slug: 'lava_titan', name: 'Lava Titan', level: 22, hp: 920, atk_min: 50, atk_max: 80, defense: 20, speed: 4, xp_reward: 520, gold_min: 100, gold_max: 180, sprite: 'titan', family: 'giant', region: 'ashen_wastes' },

  // Endgame
  { slug: 'shadow_lord', name: 'The Shadow Lord', level: 25, hp: 1500, atk_min: 70, atk_max: 110, defense: 25, speed: 8, xp_reward: 900, gold_min: 250, gold_max: 400, sprite: 'shadowlord', family: 'demon', region: 'shadowfell' },
];

/* =========================================================================
 * Endless content — procedurally generated monsters for levels 26 → 350.
 *
 * One monster per level guarantees the Hunting Grounds and Bounty Board
 * always find a level-appropriate target no matter how high the player
 * climbs. Stats scale on smooth curves anchored to the hand-built set
 * (≈ lv25 = 1500 HP). Each ~35-level band is its own themed region with a
 * matching level gate (see REGION_BANDS, mirrored in routes/hunting.ts).
 * ======================================================================= */

export interface HighRegionBand { region: string; name: string; gate: number; max: number; creatures: string[]; sprites: string[]; family: string; }

export const REGION_BANDS: HighRegionBand[] = [
  { region: 'emberreach',        name: 'Emberreach',          gate: 26,  max: 60,  creatures: ['Cinder Marauder', 'Magma Hound', 'Ash Knight', 'Emberwing Drake'], sprites: ['drake', 'wolf', 'orc', 'titan'], family: 'dragon' },
  { region: 'frostspire',        name: 'Frostspire',          gate: 60,  max: 95,  creatures: ['Rime Stalker', 'Glacier Golem', 'Frost Wyrm', 'Hoarfrost Witch'], sprites: ['golem', 'serpent', 'witch', 'wolf'], family: 'giant' },
  { region: 'drowned_coast',     name: 'The Drowned Coast',   gate: 95,  max: 130, creatures: ['Tide Revenant', 'Abyssal Maw', 'Coral Leviathan', 'Drowned Captain'], sprites: ['serpent', 'wraith', 'overlord', 'spider'], family: 'undead' },
  { region: 'stormpeaks',        name: 'The Stormpeaks',      gate: 130, max: 165, creatures: ['Thunder Roc', 'Galestorm Elemental', 'Sky Titan', 'Tempest Warden'], sprites: ['titan', 'drake', 'golem', 'overlord'], family: 'elemental' },
  { region: 'blighted_expanse',  name: 'The Blighted Expanse',gate: 165, max: 200, creatures: ['Plague Behemoth', 'Rot Shambler', 'Famine Wraith', 'Blight Hierophant'], sprites: ['troll', 'wraith', 'witch', 'overlord'], family: 'undead' },
  { region: 'obsidian_dominion', name: 'The Obsidian Dominion',gate: 200, max: 235, creatures: ['Obsidian Colossus', 'Shadowforged Knight', 'Void Reaver', 'Onyx Tyrant'], sprites: ['golem', 'titan', 'shadowlord', 'overlord'], family: 'construct' },
  { region: 'astral_rift',       name: 'The Astral Rift',     gate: 235, max: 270, creatures: ['Star-Eater', 'Rift Horror', 'Celestial Devourer', 'Astral Sovereign'], sprites: ['serpent', 'drake', 'shadowlord', 'witch'], family: 'aberration' },
  { region: 'voidmaw',           name: 'Voidmaw',             gate: 270, max: 305, creatures: ['Null Behemoth', 'Entropy Fiend', 'Maw of the Void', 'Oblivion Herald'], sprites: ['shadowlord', 'titan', 'wraith', 'overlord'], family: 'demon' },
  { region: 'dragon_roost',      name: 'The Dragon Roost',    gate: 305, max: 340, creatures: ['Elder Wyrm', 'Catastrophe Drake', 'Worldfire Serpent', 'Dragon Ascendant'], sprites: ['drake', 'serpent', 'titan', 'shadowlord'], family: 'dragon' },
  { region: 'eternal_throne',    name: 'The Eternal Throne',  gate: 340, max: 351, creatures: ['Throneguard Titan', 'God-King\'s Shadow', 'The Unmaker', 'Avatar of the End'], sprites: ['shadowlord', 'titan', 'overlord', 'golem'], family: 'demon' },
];

function bandFor(level: number): HighRegionBand {
  for (const b of REGION_BANDS) if (level >= b.gate && level < b.max) return b;
  return REGION_BANDS[REGION_BANDS.length - 1];
}

(() => {
  for (let lvl = 26; lvl <= 350; lvl++) {
    const band = bandFor(lvl);
    const idx = lvl % band.creatures.length;
    const creature = band.creatures[idx];
    const sprite = band.sprites[idx % band.sprites.length];
    const f = lvl / 25; // scale factor anchored at the lv25 hand-built boss
    MONSTER_SEED.push({
      slug: `${band.region}_${lvl}`,
      name: `${creature} · Lv ${lvl}`,
      level: lvl,
      hp: Math.round(1500 * Math.pow(f, 1.9)),
      atk_min: Math.round(60 * Math.pow(f, 1.25)),
      atk_max: Math.round(95 * Math.pow(f, 1.25)),
      defense: Math.round(25 * Math.pow(f, 1.1)),
      speed: 4 + (lvl % 6),
      xp_reward: Math.round(85 * Math.pow(lvl, 0.7)),
      gold_min: Math.round(8 * lvl),
      gold_max: Math.round(14 * lvl),
      sprite,
      family: band.family,
      region: band.region,
    });
  }
})();
