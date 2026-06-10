export const MONSTER_SEED = [
  // ===== Whispering Woods (lvl 1-5) =====
  { slug: 'forest_rat', name: 'Forest Rat', level: 1, hp: 18, atk_min: 2, atk_max: 4, defense: 0, speed: 6, xp_reward: 4, gold_min: 1, gold_max: 3, sprite: 'rat', family: 'beast', region: 'whispering_woods' },
  { slug: 'wild_boar', name: 'Wild Boar', level: 2, hp: 30, atk_min: 3, atk_max: 6, defense: 1, speed: 5, xp_reward: 8, gold_min: 2, gold_max: 5, sprite: 'boar', family: 'beast', region: 'whispering_woods' },
  { slug: 'goblin_scout', name: 'Goblin Scout', level: 3, hp: 40, atk_min: 4, atk_max: 8, defense: 1, speed: 6, xp_reward: 12, gold_min: 3, gold_max: 7, sprite: 'goblin', family: 'humanoid', region: 'whispering_woods' },
  { slug: 'forest_wolf', name: 'Forest Wolf', level: 4, hp: 55, atk_min: 6, atk_max: 11, defense: 2, speed: 7, xp_reward: 18, gold_min: 4, gold_max: 8, sprite: 'wolf', family: 'beast', region: 'whispering_woods' },
  { slug: 'bandit', name: 'Hooded Bandit', level: 5, hp: 75, atk_min: 8, atk_max: 14, defense: 3, speed: 6, xp_reward: 24, gold_min: 6, gold_max: 12, sprite: 'bandit', family: 'humanoid', region: 'whispering_woods' },

  // ===== Mistmoor Hills (lvl 6-10) =====
  { slug: 'hill_troll', name: 'Hill Troll', level: 7, hp: 130, atk_min: 12, atk_max: 20, defense: 5, speed: 4, xp_reward: 50, gold_min: 10, gold_max: 18, sprite: 'troll', family: 'giant', region: 'mistmoor_hills' },
  { slug: 'orc_raider', name: 'Orc Raider', level: 8, hp: 150, atk_min: 14, atk_max: 22, defense: 6, speed: 5, xp_reward: 60, gold_min: 12, gold_max: 22, sprite: 'orc', family: 'humanoid', region: 'mistmoor_hills' },
  { slug: 'dire_wolf', name: 'Dire Wolf', level: 9, hp: 175, atk_min: 16, atk_max: 26, defense: 6, speed: 8, xp_reward: 75, gold_min: 14, gold_max: 25, sprite: 'wolf', family: 'beast', region: 'mistmoor_hills' },
  { slug: 'mistmoor_witch', name: 'Mistmoor Witch', level: 10, hp: 180, atk_min: 18, atk_max: 30, defense: 4, speed: 7, xp_reward: 90, gold_min: 18, gold_max: 32, sprite: 'witch', family: 'magic', region: 'mistmoor_hills' },

  // ===== Crystal Caverns (lvl 10-15) =====
  { slug: 'cave_spider', name: 'Cave Spider', level: 11, hp: 200, atk_min: 18, atk_max: 32, defense: 7, speed: 8, xp_reward: 100, gold_min: 18, gold_max: 30, sprite: 'spider', family: 'beast', region: 'crystal_caverns' },
  { slug: 'rock_golem', name: 'Rock Golem', level: 13, hp: 320, atk_min: 22, atk_max: 38, defense: 14, speed: 3, xp_reward: 140, gold_min: 28, gold_max: 48, sprite: 'golem', family: 'construct', region: 'crystal_caverns' },
  { slug: 'crystal_serpent', name: 'Crystal Serpent', level: 14, hp: 300, atk_min: 26, atk_max: 42, defense: 8, speed: 8, xp_reward: 160, gold_min: 32, gold_max: 55, sprite: 'serpent', family: 'beast', region: 'crystal_caverns' },
  { slug: 'caverns_overlord', name: 'Caverns Overlord', level: 15, hp: 480, atk_min: 30, atk_max: 50, defense: 12, speed: 6, xp_reward: 220, gold_min: 50, gold_max: 90, sprite: 'overlord', family: 'humanoid', region: 'crystal_caverns' },

  // ===== Ashen Wastes (lvl 15-22) =====
  { slug: 'ash_revenant', name: 'Ash Revenant', level: 17, hp: 540, atk_min: 34, atk_max: 58, defense: 10, speed: 7, xp_reward: 280, gold_min: 55, gold_max: 95, sprite: 'wraith', family: 'undead', region: 'ashen_wastes' },
  { slug: 'fire_drake', name: 'Fire Drake', level: 20, hp: 720, atk_min: 42, atk_max: 70, defense: 15, speed: 7, xp_reward: 400, gold_min: 80, gold_max: 140, sprite: 'drake', family: 'dragon', region: 'ashen_wastes' },
  { slug: 'lava_titan', name: 'Lava Titan', level: 22, hp: 920, atk_min: 50, atk_max: 80, defense: 20, speed: 4, xp_reward: 520, gold_min: 100, gold_max: 180, sprite: 'titan', family: 'giant', region: 'ashen_wastes' },

  // ===== Shadowfell ridge (lv 24-25) — the first end-of-act-1 boss =====
  { slug: 'shadow_lord', name: 'The Shadow Lord', level: 25, hp: 1500, atk_min: 70, atk_max: 110, defense: 25, speed: 8, xp_reward: 900, gold_min: 250, gold_max: 400, sprite: 'shadowlord', family: 'demon', region: 'shadowfell' },

  // =====================================================================

  // ======================================================================
  // EXPANSION — six new named regions covering lv 26-200 with hand-built
  // monster rosters and a level-cap APEX boss in each. Each APEX drops a
  // unique boss-tier item (see seed/items.ts -> APEX drops table). Stats
  // are calibrated against the same scaling curves as the procedural
  // bands so the cross-over at lv 200 is smooth.
  // ======================================================================

  // ===== Emberreach (lv 26-50) — volcanic frontier, Wyrmkin clans =====
  { slug: 'emberreach_cinder_imp', name: "Cinder Imp", level: 26, hp: 1566, atk_min: 63, atk_max: 99, defense: 26, speed: 6, xp_reward: 88, gold_min: 208, gold_max: 364, sprite: 'goblin', family: 'elemental', region: 'emberreach' },
  { slug: 'emberreach_ash_wolf', name: "Ash Wolf", level: 28, hp: 1699, atk_min: 68, atk_max: 108, defense: 28, speed: 8, xp_reward: 93, gold_min: 224, gold_max: 392, sprite: 'wolf', family: 'beast', region: 'emberreach' },
  { slug: 'emberreach_drake_whelp', name: "Lava Drake Whelp", level: 31, hp: 1900, atk_min: 77, atk_max: 122, defense: 32, speed: 5, xp_reward: 100, gold_min: 248, gold_max: 434, sprite: 'drake', family: 'dragon', region: 'emberreach' },
  { slug: 'emberreach_wyrmkin_scout', name: "Wyrmkin Scout", level: 34, hp: 2104, atk_min: 85, atk_max: 135, defense: 35, speed: 8, xp_reward: 106, gold_min: 272, gold_max: 476, sprite: 'orc', family: 'humanoid', region: 'emberreach' },
  { slug: 'emberreach_sulfur_witch', name: "Sulfur Witch", level: 37, hp: 2309, atk_min: 94, atk_max: 149, defense: 38, speed: 5, xp_reward: 113, gold_min: 296, gold_max: 518, sprite: 'witch', family: 'magic', region: 'emberreach' },
  { slug: 'emberreach_ember_knight', name: "Ember Knight", level: 41, hp: 2585, atk_min: 106, atk_max: 168, defense: 43, speed: 9, xp_reward: 121, gold_min: 328, gold_max: 574, sprite: 'overlord', family: 'humanoid', region: 'emberreach' },
  { slug: 'emberreach_caldera_golem', name: "Caldera Golem", level: 46, hp: 2934, atk_min: 121, atk_max: 192, defense: 49, speed: 8, xp_reward: 131, gold_min: 368, gold_max: 644, sprite: 'golem', family: 'construct', region: 'emberreach' },
  { slug: 'emberreach_apex_khalad', name: "Khalad the Wyrm-Touched", level: 50, hp: 5466, atk_min: 173, atk_max: 274, defense: 70, speed: 6, xp_reward: 834, gold_min: 1600, gold_max: 2800, sprite: 'shadowlord', family: 'dragon', region: 'emberreach' },

  // ===== Hammerhand Pass (lv 52-75) — overrun dwarven mining outpost =====
  { slug: 'hammerhand_picker', name: "Iron-Mad Picker", level: 52, hp: 3357, atk_min: 139, atk_max: 221, defense: 56, speed: 8, xp_reward: 143, gold_min: 416, gold_max: 728, sprite: 'bandit', family: 'humanoid', region: 'hammerhand_pass' },
  { slug: 'hammerhand_mine_cur', name: "Mine Cur", level: 55, hp: 3571, atk_min: 149, atk_max: 235, defense: 60, speed: 5, xp_reward: 149, gold_min: 440, gold_max: 770, sprite: 'wolf', family: 'beast', region: 'hammerhand_pass' },
  { slug: 'hammerhand_crawler', name: "Tunnel Crawler", level: 58, hp: 3786, atk_min: 158, atk_max: 250, defense: 63, speed: 8, xp_reward: 154, gold_min: 464, gold_max: 812, sprite: 'spider', family: 'beast', region: 'hammerhand_pass' },
  { slug: 'hammerhand_pit_drake', name: "Pit Drake", level: 62, hp: 4074, atk_min: 171, atk_max: 270, defense: 68, speed: 6, xp_reward: 162, gold_min: 496, gold_max: 868, sprite: 'drake', family: 'dragon', region: 'hammerhand_pass' },
  { slug: 'hammerhand_slag_golem', name: "Slag Golem", level: 66, hp: 4364, atk_min: 183, atk_max: 290, defense: 73, speed: 4, xp_reward: 169, gold_min: 528, gold_max: 924, sprite: 'golem', family: 'construct', region: 'hammerhand_pass' },
  { slug: 'hammerhand_shaft_wraith', name: "Shaft Wraith", level: 70, hp: 4655, atk_min: 196, atk_max: 310, defense: 78, speed: 8, xp_reward: 176, gold_min: 560, gold_max: 980, sprite: 'wraith', family: 'undead', region: 'hammerhand_pass' },
  { slug: 'hammerhand_apex_gorvak', name: "Gorvak the Iron Tyrant", level: 75, hp: 8539, atk_min: 276, atk_max: 437, defense: 109, speed: 7, xp_reward: 1110, gold_min: 2400, gold_max: 4200, sprite: 'shadowlord', family: 'humanoid', region: 'hammerhand_pass' },

  // ===== Conclave of Aedric (lv 77-105) — rogue magical academy =====
  { slug: 'conclave_sentry', name: "Conjured Sentry", level: 77, hp: 5170, atk_min: 219, atk_max: 346, defense: 86, speed: 9, xp_reward: 188, gold_min: 616, gold_max: 1078, sprite: 'golem', family: 'construct', region: 'conclave_aedric' },
  { slug: 'conclave_initiate', name: "Apprentice Initiate", level: 80, hp: 5392, atk_min: 229, atk_max: 362, defense: 90, speed: 6, xp_reward: 193, gold_min: 640, gold_max: 1120, sprite: 'witch', family: 'magic', region: 'conclave_aedric' },
  { slug: 'conclave_runeservitor', name: "Rune Servitor", level: 84, hp: 5689, atk_min: 242, atk_max: 383, defense: 95, speed: 4, xp_reward: 200, gold_min: 672, gold_max: 1176, sprite: 'overlord', family: 'construct', region: 'conclave_aedric' },
  { slug: 'conclave_spellsword', name: "Spellsword Adept", level: 88, hp: 5988, atk_min: 255, atk_max: 404, defense: 100, speed: 8, xp_reward: 207, gold_min: 704, gold_max: 1232, sprite: 'bandit', family: 'humanoid', region: 'conclave_aedric' },
  { slug: 'conclave_voidshard', name: "Voidshard Hierophant", level: 93, hp: 6363, atk_min: 272, atk_max: 430, defense: 106, speed: 7, xp_reward: 215, gold_min: 744, gold_max: 1302, sprite: 'wraith', family: 'magic', region: 'conclave_aedric' },
  { slug: 'conclave_astral_wyrm', name: "Astral Wyrm", level: 98, hp: 6741, atk_min: 289, atk_max: 457, defense: 112, speed: 6, xp_reward: 223, gold_min: 784, gold_max: 1372, sprite: 'serpent', family: 'dragon', region: 'conclave_aedric' },
  { slug: 'conclave_apex_vex', name: "Archlector Vex", level: 105, hp: 12362, atk_min: 407, atk_max: 644, defense: 157, speed: 7, xp_reward: 1404, gold_min: 3360, gold_max: 5880, sprite: 'shadowlord', family: 'magic', region: 'conclave_aedric' },

  // ===== Saltmarsh & the Sunken King (lv 107-140) — lizardfolk swamp =====
  { slug: 'saltmarsh_strider', name: "Marsh Strider", level: 107, hp: 7425, atk_min: 319, atk_max: 506, defense: 124, speed: 9, xp_reward: 237, gold_min: 856, gold_max: 1498, sprite: 'orc', family: 'humanoid', region: 'saltmarsh' },
  { slug: 'saltmarsh_hag', name: "Bog Hag", level: 112, hp: 7807, atk_min: 337, atk_max: 533, defense: 130, speed: 8, xp_reward: 245, gold_min: 896, gold_max: 1568, sprite: 'witch', family: 'magic', region: 'saltmarsh' },
  { slug: 'saltmarsh_crocodile', name: "Salt Crocodile", level: 116, hp: 8114, atk_min: 350, atk_max: 555, defense: 135, speed: 6, xp_reward: 251, gold_min: 928, gold_max: 1624, sprite: 'serpent', family: 'beast', region: 'saltmarsh' },
  { slug: 'saltmarsh_tidefall_priest', name: "Tidefall Priest", level: 122, hp: 8577, atk_min: 371, atk_max: 588, defense: 143, speed: 6, xp_reward: 260, gold_min: 976, gold_max: 1708, sprite: 'wraith', family: 'magic', region: 'saltmarsh' },
  { slug: 'saltmarsh_drowned_guard', name: "Drowned Lord's Guard", level: 128, hp: 9042, atk_min: 392, atk_max: 621, defense: 151, speed: 6, xp_reward: 269, gold_min: 1024, gold_max: 1792, sprite: 'overlord', family: 'humanoid', region: 'saltmarsh' },
  { slug: 'saltmarsh_salt_wraith', name: "Salt Wraith", level: 134, hp: 9510, atk_min: 414, atk_max: 655, defense: 158, speed: 6, xp_reward: 277, gold_min: 1072, gold_max: 1876, sprite: 'wraith', family: 'undead', region: 'saltmarsh' },
  { slug: 'saltmarsh_apex_sunken_king', name: "The Sunken King", level: 140, hp: 16964, atk_min: 566, atk_max: 896, defense: 216, speed: 6, xp_reward: 1716, gold_min: 4480, gold_max: 7840, sprite: 'shadowlord', family: 'undead', region: 'saltmarsh' },

  // ===== Frostvale (lv 142-175) — arctic tundra, frost giants =====
  { slug: 'frostvale_direwolf', name: "Frost Direwolf", level: 142, hp: 10136, atk_min: 442, atk_max: 700, defense: 169, speed: 8, xp_reward: 289, gold_min: 1136, gold_max: 1988, sprite: 'wolf', family: 'beast', region: 'frostvale' },
  { slug: 'frostvale_snow_reaver', name: "Snow Reaver", level: 148, hp: 10608, atk_min: 464, atk_max: 734, defense: 177, speed: 8, xp_reward: 297, gold_min: 1184, gold_max: 2072, sprite: 'bandit', family: 'humanoid', region: 'frostvale' },
  { slug: 'frostvale_wendigo', name: "Wendigo Stalker", level: 153, hp: 11003, atk_min: 482, atk_max: 763, defense: 183, speed: 7, xp_reward: 304, gold_min: 1224, gold_max: 2142, sprite: 'troll', family: 'aberration', region: 'frostvale' },
  { slug: 'frostvale_banshee', name: "Ice Banshee", level: 160, hp: 11558, atk_min: 507, atk_max: 803, defense: 193, speed: 8, xp_reward: 314, gold_min: 1280, gold_max: 2240, sprite: 'wraith', family: 'undead', region: 'frostvale' },
  { slug: 'frostvale_giant_berserker', name: "Frost Giant Berserker", level: 168, hp: 12195, atk_min: 537, atk_max: 850, defense: 203, speed: 4, xp_reward: 325, gold_min: 1344, gold_max: 2352, sprite: 'titan', family: 'giant', region: 'frostvale' },
  { slug: 'frostvale_glacial_wyrm', name: "Glacial Wyrm", level: 173, hp: 12595, atk_min: 555, atk_max: 879, defense: 210, speed: 9, xp_reward: 332, gold_min: 1384, gold_max: 2422, sprite: 'serpent', family: 'dragon', region: 'frostvale' },
  { slug: 'frostvale_apex_snowtooth', name: "Jarl Snowtooth", level: 175, hp: 21685, atk_min: 731, atk_max: 1157, defense: 277, speed: 5, xp_reward: 2004, gold_min: 5600, gold_max: 9800, sprite: 'titan', family: 'giant', region: 'frostvale' },

  // ===== Black Spire (lv 177-200) — demonic incursion =====
  { slug: 'blackspire_hellhound', name: "Hellhound", level: 177, hp: 12916, atk_min: 570, atk_max: 902, defense: 215, speed: 7, xp_reward: 337, gold_min: 1416, gold_max: 2478, sprite: 'wolf', family: 'demon', region: 'black_spire' },
  { slug: 'blackspire_brimstone_imp', name: "Brimstone Imp", level: 182, hp: 13318, atk_min: 588, atk_max: 931, defense: 222, speed: 6, xp_reward: 344, gold_min: 1456, gold_max: 2548, sprite: 'goblin', family: 'demon', region: 'black_spire' },
  { slug: 'blackspire_cultist', name: "Fellblade Cultist", level: 187, hp: 13721, atk_min: 607, atk_max: 961, defense: 229, speed: 5, xp_reward: 350, gold_min: 1496, gold_max: 2618, sprite: 'bandit', family: 'humanoid', region: 'black_spire' },
  { slug: 'blackspire_pyromancer', name: "Pyromancer Adept", level: 192, hp: 14125, atk_min: 626, atk_max: 991, defense: 235, speed: 4, xp_reward: 357, gold_min: 1536, gold_max: 2688, sprite: 'witch', family: 'magic', region: 'black_spire' },
  { slug: 'blackspire_titan', name: "Demon-Wrought Titan", level: 197, hp: 14530, atk_min: 644, atk_max: 1020, defense: 242, speed: 9, xp_reward: 363, gold_min: 1576, gold_max: 2758, sprite: 'golem', family: 'construct', region: 'black_spire' },
  { slug: 'blackspire_apex_azhtek', name: "Azhtek, the Black Pyrelord", level: 200, hp: 25116, atk_min: 853, atk_max: 1349, defense: 320, speed: 6, xp_reward: 2202, gold_min: 6400, gold_max: 11200, sprite: 'shadowlord', family: 'demon', region: 'black_spire' },
];


/* =========================================================================
 * Endless content — procedurally generated monsters for levels 201 → 350.
 *
 * The named region expansion above carries the 25-200 stretch. The five
 * procedural bands below cover the divine end-game from lv 201 through
 * the level cap at 350. Each band has eight creature names cycled across
 * its level range, doubled from the previous four-name rosters so a
 * player pushing through it sees more variety.
 *
 * Stats scale on smooth curves anchored to the lv 200 APEX boss
 * (≈ 16000 HP). Each band ends at a divine cap boss.
 * ======================================================================= */

export interface HighRegionBand { region: string; name: string; gate: number; max: number; creatures: string[]; sprites: string[]; family: string; }

export const REGION_BANDS: HighRegionBand[] = [
  { region: 'stormpeaks',         name: 'The Stormpeaks',          gate: 201, max: 230, creatures: ['Thunder Roc', 'Galestorm Elemental', 'Sky Titan', 'Tempest Warden', 'Lightning Drake', 'Cloud Reaver', 'Skyglass Knight', 'Storm Hierophant'], sprites: ['titan', 'drake', 'golem', 'overlord', 'serpent', 'wraith', 'shadowlord', 'witch'], family: 'elemental' },
  { region: 'voidshade_hollow',   name: 'Voidshade Hollow',        gate: 230, max: 260, creatures: ['Hollow Walker', 'Void Reaver', 'Rift Horror', 'Echo of the Unmade', 'Null Serpent', 'Voidshade Tyrant', 'Hollow Aspect', 'Shade of the First Dark'], sprites: ['wraith', 'shadowlord', 'serpent', 'overlord', 'golem', 'titan', 'drake', 'witch'], family: 'aberration' },
  { region: 'mooncradle',         name: 'Mooncradle',              gate: 260, max: 290, creatures: ['Lunar Stalker', 'Tidecaller Priest', 'Silver Wyrm', 'Cradle Sentinel', 'Moonglass Reaper', 'Pale Hierophant', 'Lunar Devourer', 'Mooncradle Sovereign'], sprites: ['wolf', 'wraith', 'serpent', 'overlord', 'shadowlord', 'witch', 'drake', 'titan'], family: 'aberration' },
  { region: 'worldspine',         name: 'The Worldspine',          gate: 290, max: 320, creatures: ['Spinewyrm', 'Bone Titan', 'Marrow Reaver', 'Worldspine Druid', 'Stoneflesh Colossus', 'Roost Tyrant', 'Marrow Knight', 'Worldspine Aspect'], sprites: ['serpent', 'titan', 'wraith', 'witch', 'golem', 'overlord', 'shadowlord', 'drake'], family: 'dragon' },
  { region: 'eternal_throne',     name: 'The Eternal Throne',      gate: 320, max: 351, creatures: ['Throneguard Titan', "God-King's Shadow", 'The Unmaker', 'Avatar of the End', 'Eternal Sovereign', 'Herald of the Last Day', 'Throne-Aspect', 'Avatar of Silence'], sprites: ['shadowlord', 'titan', 'overlord', 'golem', 'drake', 'serpent', 'wraith', 'witch'], family: 'demon' },
];

function bandFor(level: number): HighRegionBand {
  for (const b of REGION_BANDS) if (level >= b.gate && level < b.max) return b;
  return REGION_BANDS[REGION_BANDS.length - 1];
}

(() => {
  for (let lvl = 201; lvl <= 350; lvl++) {
    const band = bandFor(lvl);
    const idx = lvl % band.creatures.length;
    const creature = band.creatures[idx];
    const sprite = band.sprites[idx % band.sprites.length];
    const f = lvl / 25; // scale factor anchored at the lv 25 hand-built boss
    MONSTER_SEED.push({
      slug: `${band.region}_${lvl}`,
      name: `${creature} · Lv ${lvl}`,
      level: lvl,
      hp: Math.round(1500 * Math.pow(f, 1.1)),
      atk_min: Math.round(60 * Math.pow(f, 1.15)),
      atk_max: Math.round(95 * Math.pow(f, 1.15)),
      defense: Math.round(25 * Math.pow(f, 1.1)),
      speed: 4 + (lvl % 6),
      // Audit (content expansion): per-kill XP coefficient lowered from
      // 12 to 9 so the 350-level curve stretches to ~3,300 kills total
      // (was 2,450). At a casual one-hour-per-day cadence with the 5-12
      // minute hunt cooldowns, that lands the cap at roughly nine months
      // of play — the 8-10 month target. Hardcore players hit it sooner
      // because dungeons, arena, daily, and weekly events all contribute
      // outside the hunt loop.
      xp_reward: Math.max(1, Math.round(9 * Math.pow(lvl, 0.7))),
      gold_min: Math.round(8 * lvl),
      gold_max: Math.round(14 * lvl),
      sprite,
      family: band.family,
      region: band.region,
    });
  }
})();
