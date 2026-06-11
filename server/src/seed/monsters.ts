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

  // ======================================================================
  // ENDGAME EXPANSION — five fully hand-built divine bands (lv 201-350)
  // replacing the previous procedural generator. Each band has 11-12
  // named monsters at fixed levels, two named "Lieutenant" mini-bosses
  // inside the band (2.5x XP, 2x gold), and one APEX cap-boss with a
  // unique legendary drop (see hunting.ts -> APEX_DROPS).
  // ======================================================================

  // ===== Stormpeaks (lv 201-230) — sky-piercing range, storm elementals =====
  { slug: 'stormpeaks_galestrider', name: "Galestrider", level: 201, hp: 14855, atk_min: 659, atk_max: 1044, defense: 248, speed: 7, xp_reward: 369, gold_min: 1608, gold_max: 2814, sprite: 'orc', family: 'elemental', region: 'stormpeaks' },
  { slug: 'stormpeaks_thunder_roc', name: "Thunder Roc", level: 204, hp: 15099, atk_min: 671, atk_max: 1062, defense: 252, speed: 4, xp_reward: 372, gold_min: 1632, gold_max: 2856, sprite: 'drake', family: 'beast', region: 'stormpeaks' },
  { slug: 'stormpeaks_skyglass_knight', name: "Skyglass Knight", level: 207, hp: 15344, atk_min: 682, atk_max: 1080, defense: 256, speed: 7, xp_reward: 376, gold_min: 1656, gold_max: 2898, sprite: 'overlord', family: 'humanoid', region: 'stormpeaks' },
  { slug: 'stormpeaks_lightning_drake', name: "Lightning Drake", level: 211, hp: 15670, atk_min: 697, atk_max: 1104, defense: 261, speed: 5, xp_reward: 381, gold_min: 1688, gold_max: 2954, sprite: 'drake', family: 'dragon', region: 'stormpeaks' },
  { slug: 'stormpeaks_cloud_reaver', name: "Cloud Reaver", level: 214, hp: 15915, atk_min: 709, atk_max: 1122, defense: 265, speed: 8, xp_reward: 385, gold_min: 1712, gold_max: 2996, sprite: 'wraith', family: 'aberration', region: 'stormpeaks' },
  { slug: 'stormpeaks_vorrik', name: "Captain Vorrik the Skybandit", level: 217, hp: 21009, atk_min: 828, atk_max: 1311, defense: 309, speed: 5, xp_reward: 972, gold_min: 3472, gold_max: 6076, sprite: 'bandit', family: 'humanoid', region: 'stormpeaks' },
  { slug: 'stormpeaks_hierophant', name: "Storm Hierophant", level: 220, hp: 16407, atk_min: 732, atk_max: 1158, defense: 273, speed: 8, xp_reward: 393, gold_min: 1760, gold_max: 3080, sprite: 'witch', family: 'magic', region: 'stormpeaks' },
  { slug: 'stormpeaks_tempest', name: "Tempest Warden", level: 223, hp: 16653, atk_min: 743, atk_max: 1177, defense: 278, speed: 5, xp_reward: 396, gold_min: 1784, gold_max: 3122, sprite: 'shadowlord', family: 'elemental', region: 'stormpeaks' },
  { slug: 'stormpeaks_stormcrown', name: "The Stormcrown", level: 225, hp: 21862, atk_min: 864, atk_max: 1367, defense: 322, speed: 7, xp_reward: 998, gold_min: 3600, gold_max: 6300, sprite: 'titan', family: 'giant', region: 'stormpeaks' },
  { slug: 'stormpeaks_wyrm', name: "Wind-bound Wyrm", level: 227, hp: 16982, atk_min: 758, atk_max: 1201, defense: 283, speed: 9, xp_reward: 401, gold_min: 1816, gold_max: 3178, sprite: 'serpent', family: 'dragon', region: 'stormpeaks' },
  { slug: 'stormpeaks_cyclone', name: "Cyclone Ascendant", level: 229, hp: 17147, atk_min: 766, atk_max: 1213, defense: 286, speed: 5, xp_reward: 404, gold_min: 1832, gold_max: 3206, sprite: 'shadowlord', family: 'elemental', region: 'stormpeaks' },
  { slug: 'stormpeaks_apex_karna', name: "Skyfather Karna", level: 230, hp: 29289, atk_min: 1001, atk_max: 1585, defense: 373, speed: 6, xp_reward: 2430, gold_min: 7360, gold_max: 12880, sprite: 'shadowlord', family: 'dragon', region: 'stormpeaks' },

  // ===== Voidshade Hollow (lv 231-260) — crack in reality, void aberrations =====
  { slug: 'voidshade_walker', name: "Hollow Walker", level: 231, hp: 17311, atk_min: 774, atk_max: 1225, defense: 289, speed: 7, xp_reward: 406, gold_min: 1848, gold_max: 3234, sprite: 'wraith', family: 'aberration', region: 'voidshade_hollow' },
  { slug: 'voidshade_reaver', name: "Void Reaver", level: 234, hp: 17559, atk_min: 785, atk_max: 1244, defense: 293, speed: 4, xp_reward: 410, gold_min: 1872, gold_max: 3276, sprite: 'shadowlord', family: 'aberration', region: 'voidshade_hollow' },
  { slug: 'voidshade_horror', name: "Rift Horror", level: 237, hp: 17807, atk_min: 797, atk_max: 1262, defense: 297, speed: 7, xp_reward: 414, gold_min: 1896, gold_max: 3318, sprite: 'serpent', family: 'aberration', region: 'voidshade_hollow' },
  { slug: 'voidshade_unmade', name: "Echo of the Unmade", level: 240, hp: 18055, atk_min: 809, atk_max: 1280, defense: 301, speed: 4, xp_reward: 417, gold_min: 1920, gold_max: 3360, sprite: 'witch', family: 'aberration', region: 'voidshade_hollow' },
  { slug: 'voidshade_blade_aspect', name: "Bladeshade Aspect", level: 242, hp: 23686, atk_min: 938, atk_max: 1487, defense: 350, speed: 6, xp_reward: 1050, gold_min: 3872, gold_max: 6776, sprite: 'overlord', family: 'aberration', region: 'voidshade_hollow' },
  { slug: 'voidshade_null_serpent', name: "Null Serpent", level: 244, hp: 18386, atk_min: 824, atk_max: 1305, defense: 306, speed: 8, xp_reward: 422, gold_min: 1952, gold_max: 3416, sprite: 'serpent', family: 'aberration', region: 'voidshade_hollow' },
  { slug: 'voidshade_tyrant', name: "Voidshade Tyrant", level: 247, hp: 18635, atk_min: 836, atk_max: 1323, defense: 311, speed: 5, xp_reward: 426, gold_min: 1976, gold_max: 3458, sprite: 'titan', family: 'aberration', region: 'voidshade_hollow' },
  { slug: 'voidshade_aspect', name: "Hollow Aspect", level: 250, hp: 18884, atk_min: 848, atk_max: 1342, defense: 315, speed: 8, xp_reward: 429, gold_min: 2000, gold_max: 3500, sprite: 'shadowlord', family: 'aberration', region: 'voidshade_hollow' },
  { slug: 'voidshade_first_dark', name: "Shade of the First Dark", level: 253, hp: 24873, atk_min: 988, atk_max: 1564, defense: 367, speed: 5, xp_reward: 1082, gold_min: 4048, gold_max: 7084, sprite: 'shadowlord', family: 'demon', region: 'voidshade_hollow' },
  { slug: 'voidshade_devourer', name: "Hollow Devourer", level: 256, hp: 19383, atk_min: 871, atk_max: 1379, defense: 323, speed: 8, xp_reward: 437, gold_min: 2048, gold_max: 3584, sprite: 'drake', family: 'aberration', region: 'voidshade_hollow' },
  { slug: 'voidshade_silent_aspect', name: "Silent Aspect", level: 258, hp: 19550, atk_min: 879, atk_max: 1391, defense: 326, speed: 4, xp_reward: 439, gold_min: 2064, gold_max: 3612, sprite: 'wraith', family: 'aberration', region: 'voidshade_hollow' },
  { slug: 'voidshade_apex_caethra', name: "Caethra, the Voidshade Heart", level: 260, hp: 33517, atk_min: 1153, atk_max: 1825, defense: 428, speed: 6, xp_reward: 2646, gold_min: 8320, gold_max: 14560, sprite: 'shadowlord', family: 'aberration', region: 'voidshade_hollow' },

  // ===== Mooncradle (lv 261-290) — floating lunar isles, pale court =====
  { slug: 'mooncradle_stalker', name: "Lunar Stalker", level: 261, hp: 19800, atk_min: 891, atk_max: 1410, defense: 330, speed: 7, xp_reward: 442, gold_min: 2088, gold_max: 3654, sprite: 'wolf', family: 'beast', region: 'mooncradle' },
  { slug: 'mooncradle_priest', name: "Tidecaller Priest", level: 264, hp: 20050, atk_min: 902, atk_max: 1429, defense: 334, speed: 4, xp_reward: 446, gold_min: 2112, gold_max: 3696, sprite: 'wraith', family: 'magic', region: 'mooncradle' },
  { slug: 'mooncradle_silver_wyrm', name: "Silver Wyrm", level: 267, hp: 20301, atk_min: 914, atk_max: 1447, defense: 338, speed: 7, xp_reward: 450, gold_min: 2136, gold_max: 3738, sprite: 'serpent', family: 'dragon', region: 'mooncradle' },
  { slug: 'mooncradle_sentinel', name: "Cradle Sentinel", level: 271, hp: 20636, atk_min: 930, atk_max: 1472, defense: 344, speed: 5, xp_reward: 454, gold_min: 2168, gold_max: 3794, sprite: 'overlord', family: 'construct', region: 'mooncradle' },
  { slug: 'mooncradle_pale_seer', name: "Pale Seer of the Cradle", level: 273, hp: 27044, atk_min: 1079, atk_max: 1708, defense: 399, speed: 7, xp_reward: 1142, gold_min: 4368, gold_max: 7644, sprite: 'witch', family: 'magic', region: 'mooncradle' },
  { slug: 'mooncradle_reaper', name: "Moonglass Reaper", level: 275, hp: 20971, atk_min: 946, atk_max: 1497, defense: 350, speed: 9, xp_reward: 459, gold_min: 2200, gold_max: 3850, sprite: 'shadowlord', family: 'aberration', region: 'mooncradle' },
  { slug: 'mooncradle_hierophant', name: "Pale Hierophant", level: 279, hp: 21307, atk_min: 962, atk_max: 1522, defense: 355, speed: 7, xp_reward: 464, gold_min: 2232, gold_max: 3906, sprite: 'witch', family: 'magic', region: 'mooncradle' },
  { slug: 'mooncradle_devourer', name: "Lunar Devourer", level: 283, hp: 21643, atk_min: 977, atk_max: 1548, defense: 361, speed: 5, xp_reward: 468, gold_min: 2264, gold_max: 3962, sprite: 'drake', family: 'aberration', region: 'mooncradle' },
  { slug: 'mooncradle_archon', name: "Archon of the Pale Court", level: 285, hp: 28356, atk_min: 1133, atk_max: 1794, defense: 419, speed: 7, xp_reward: 1178, gold_min: 4560, gold_max: 7980, sprite: 'overlord', family: 'humanoid', region: 'mooncradle' },
  { slug: 'mooncradle_sovereign', name: "Mooncradle Sovereign", level: 287, hp: 21980, atk_min: 993, atk_max: 1573, defense: 366, speed: 9, xp_reward: 473, gold_min: 2296, gold_max: 4018, sprite: 'titan', family: 'aberration', region: 'mooncradle' },
  { slug: 'mooncradle_wyrm_priest', name: "Silver Wyrm-Priest", level: 289, hp: 22149, atk_min: 1001, atk_max: 1585, defense: 369, speed: 5, xp_reward: 475, gold_min: 2312, gold_max: 4046, sprite: 'serpent', family: 'magic', region: 'mooncradle' },
  { slug: 'mooncradle_apex_selan', name: "Selan, the Pale Empress", level: 290, hp: 37796, atk_min: 1306, atk_max: 2070, defense: 482, speed: 6, xp_reward: 2856, gold_min: 9280, gold_max: 16240, sprite: 'shadowlord', family: 'aberration', region: 'mooncradle' },

  // ===== Worldspine (lv 291-320) — backbone of the world, bone dragons =====
  { slug: 'worldspine_spinewyrm', name: "Spinewyrm", level: 291, hp: 22317, atk_min: 1009, atk_max: 1598, defense: 372, speed: 7, xp_reward: 477, gold_min: 2328, gold_max: 4074, sprite: 'serpent', family: 'dragon', region: 'worldspine' },
  { slug: 'worldspine_bone_titan', name: "Bone Titan", level: 294, hp: 22570, atk_min: 1021, atk_max: 1617, defense: 376, speed: 4, xp_reward: 481, gold_min: 2352, gold_max: 4116, sprite: 'titan', family: 'undead', region: 'worldspine' },
  { slug: 'worldspine_marrow_reaver', name: "Marrow Reaver", level: 297, hp: 22824, atk_min: 1033, atk_max: 1636, defense: 380, speed: 7, xp_reward: 484, gold_min: 2376, gold_max: 4158, sprite: 'wraith', family: 'undead', region: 'worldspine' },
  { slug: 'worldspine_druid', name: "Worldspine Druid", level: 300, hp: 23078, atk_min: 1045, atk_max: 1655, defense: 385, speed: 4, xp_reward: 488, gold_min: 2400, gold_max: 4200, sprite: 'witch', family: 'magic', region: 'worldspine' },
  { slug: 'worldspine_marrow_lord', name: "Marrow Lord of the Old Bones", level: 303, hp: 30332, atk_min: 1216, atk_max: 1925, defense: 447, speed: 7, xp_reward: 1228, gold_min: 4848, gold_max: 8484, sprite: 'shadowlord', family: 'undead', region: 'worldspine' },
  { slug: 'worldspine_colossus', name: "Stoneflesh Colossus", level: 306, hp: 23586, atk_min: 1069, atk_max: 1693, defense: 393, speed: 4, xp_reward: 495, gold_min: 2448, gold_max: 4284, sprite: 'golem', family: 'construct', region: 'worldspine' },
  { slug: 'worldspine_roost_tyrant', name: "Roost Tyrant", level: 309, hp: 23840, atk_min: 1081, atk_max: 1712, defense: 397, speed: 7, xp_reward: 498, gold_min: 2472, gold_max: 4326, sprite: 'drake', family: 'dragon', region: 'worldspine' },
  { slug: 'worldspine_marrow_knight', name: "Marrow Knight", level: 312, hp: 24095, atk_min: 1093, atk_max: 1731, defense: 402, speed: 4, xp_reward: 501, gold_min: 2496, gold_max: 4368, sprite: 'overlord', family: 'undead', region: 'worldspine' },
  { slug: 'worldspine_old_wyrm', name: "Old Wyrm of the Spine", level: 314, hp: 31544, atk_min: 1267, atk_max: 2006, defense: 465, speed: 6, xp_reward: 1260, gold_min: 5024, gold_max: 8792, sprite: 'drake', family: 'dragon', region: 'worldspine' },
  { slug: 'worldspine_aspect', name: "Worldspine Aspect", level: 317, hp: 24520, atk_min: 1114, atk_max: 1763, defense: 409, speed: 9, xp_reward: 507, gold_min: 2536, gold_max: 4438, sprite: 'titan', family: 'dragon', region: 'worldspine' },
  { slug: 'worldspine_bone_priest', name: "Bone Priest of the Hollow Crown", level: 319, hp: 24690, atk_min: 1122, atk_max: 1776, defense: 412, speed: 5, xp_reward: 509, gold_min: 2552, gold_max: 4466, sprite: 'wraith', family: 'magic', region: 'worldspine' },
  { slug: 'worldspine_apex_vhastar', name: "Vhastar, the Spine-Wyrm", level: 320, hp: 42118, atk_min: 1464, atk_max: 2317, defense: 537, speed: 6, xp_reward: 3060, gold_min: 10240, gold_max: 17920, sprite: 'shadowlord', family: 'dragon', region: 'worldspine' },

  // ===== The Eternal Throne (lv 321-350) — god's last court =====
  { slug: 'throne_throneguard', name: "Throneguard Titan", level: 321, hp: 24861, atk_min: 1130, atk_max: 1789, defense: 414, speed: 7, xp_reward: 511, gold_min: 2568, gold_max: 4494, sprite: 'titan', family: 'construct', region: 'eternal_throne' },
  { slug: 'throne_shadow', name: "God-King's Shadow", level: 324, hp: 25116, atk_min: 1142, atk_max: 1808, defense: 419, speed: 4, xp_reward: 515, gold_min: 2592, gold_max: 4536, sprite: 'shadowlord', family: 'demon', region: 'eternal_throne' },
  { slug: 'throne_unmaker', name: "The Unmaker", level: 327, hp: 25372, atk_min: 1154, atk_max: 1827, defense: 423, speed: 7, xp_reward: 518, gold_min: 2616, gold_max: 4578, sprite: 'overlord', family: 'demon', region: 'eternal_throne' },
  { slug: 'throne_avatar_end', name: "Avatar of the End", level: 330, hp: 25628, atk_min: 1166, atk_max: 1847, defense: 427, speed: 4, xp_reward: 521, gold_min: 2640, gold_max: 4620, sprite: 'shadowlord', family: 'demon', region: 'eternal_throne' },
  { slug: 'throne_seven_kings', name: "Herald of the Seven Kings", level: 332, hp: 33539, atk_min: 1350, atk_max: 2139, defense: 494, speed: 6, xp_reward: 1310, gold_min: 5312, gold_max: 9296, sprite: 'overlord', family: 'demon', region: 'eternal_throne' },
  { slug: 'throne_sovereign', name: "Eternal Sovereign", level: 335, hp: 26056, atk_min: 1187, atk_max: 1879, defense: 434, speed: 9, xp_reward: 527, gold_min: 2680, gold_max: 4690, sprite: 'titan', family: 'demon', region: 'eternal_throne' },
  { slug: 'throne_herald_last_day', name: "Herald of the Last Day", level: 338, hp: 26313, atk_min: 1199, atk_max: 1898, defense: 439, speed: 6, xp_reward: 530, gold_min: 2704, gold_max: 4732, sprite: 'wraith', family: 'demon', region: 'eternal_throne' },
  { slug: 'throne_aspect', name: "Throne-Aspect", level: 341, hp: 26570, atk_min: 1211, atk_max: 1918, defense: 443, speed: 9, xp_reward: 534, gold_min: 2728, gold_max: 4774, sprite: 'titan', family: 'demon', region: 'eternal_throne' },
  { slug: 'throne_silence', name: "Avatar of Silence", level: 344, hp: 26827, atk_min: 1223, atk_max: 1937, defense: 447, speed: 6, xp_reward: 537, gold_min: 2752, gold_max: 4816, sprite: 'shadowlord', family: 'demon', region: 'eternal_throne' },
  { slug: 'throne_dawn_unmaker', name: "The Dawn-Unmaker", level: 346, hp: 35099, atk_min: 1417, atk_max: 2242, defense: 518, speed: 8, xp_reward: 1348, gold_min: 5536, gold_max: 9688, sprite: 'shadowlord', family: 'demon', region: 'eternal_throne' },
  { slug: 'throne_wyrm_silence', name: "Wyrm of Silence", level: 348, hp: 27170, atk_min: 1240, atk_max: 1963, defense: 453, speed: 4, xp_reward: 541, gold_min: 2784, gold_max: 4872, sprite: 'drake', family: 'dragon', region: 'eternal_throne' },
  { slug: 'throne_apex_unname', name: "The Unname, God-of-Endings", level: 350, hp: 46481, atk_min: 1622, atk_max: 2569, defense: 593, speed: 6, xp_reward: 3258, gold_min: 11200, gold_max: 19600, sprite: 'shadowlord', family: 'demon', region: 'eternal_throne' },
];

/* =========================================================================
 * REGION_BANDS retained as metadata for hunting.ts (region gates +
 * pretty names). The procedural generator that used to populate the
 * lv 201-350 stretch is gone — every monster in those levels now
 * exists as a hand-built entry above, with explicit stats and a name
 * that doesn't end in "· Lv 247".
 * ======================================================================= */

export interface HighRegionBand { region: string; name: string; gate: number; max: number; family: string; }

export const REGION_BANDS: HighRegionBand[] = [
  { region: 'stormpeaks',       name: 'The Stormpeaks',     gate: 201, max: 231, family: 'elemental'  },
  { region: 'voidshade_hollow', name: 'Voidshade Hollow',   gate: 231, max: 261, family: 'aberration' },
  { region: 'mooncradle',       name: 'Mooncradle',         gate: 261, max: 291, family: 'aberration' },
  { region: 'worldspine',       name: 'The Worldspine',     gate: 291, max: 321, family: 'dragon'     },
  { region: 'eternal_throne',   name: 'The Eternal Throne', gate: 321, max: 351, family: 'demon'      },
];
