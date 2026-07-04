/**
 * Region catalog — the single source of truth for the world map.
 *
 * The slugs here MUST match the `region` column the server seeds onto
 * quests (server/src/seed/quests.ts). Historically the map advertised a
 * different, decorative set of 15 slugs that did not exist on the backend,
 * so every pin fell through to a generic, unfiltered quest board. This
 * catalog is aligned 1:1 with the 16 seeded regions and their minimum
 * quest level, so a pin always opens the board for a region that actually
 * has quests.
 *
 * `minLevel` mirrors the lowest `level_req` seeded for that region; the
 * displayed level band runs up to the next region's threshold.
 * `x`/`y` are fractional positions (0..1) hand-placed on the Carta Marina
 * parchment so the fifteen-plus pins read as a legible journey.
 */

export interface RegionDef {
  slug: string;
  name: string;
  /** Human level band, e.g. "1-5". */
  level: string;
  minLevel: number;
  lore: string;
  x: number;
  y: number;
  /** Biome glow colour. */
  color: string;
  /** Roman-numeral medallion stamp. */
  stamp: string;
}

export const REGIONS: RegionDef[] = [
  { slug: 'whispering_woods', name: 'Whispering Woods', level: '1-5',     minLevel: 1,   lore: 'A green wood near Oaken Hollow — every hero\'s first road.',      x: 0.14, y: 0.80, color: '#6ad8a4', stamp: 'I'    },
  { slug: 'mistmoor_hills',   name: 'Mistmoor Hills',   level: '6-9',     minLevel: 6,   lore: 'Fog-laced highlands where orcs ride the high passes.',            x: 0.24, y: 0.64, color: '#9ad9ff', stamp: 'II'   },
  { slug: 'crystal_caverns',  name: 'Crystal Caverns',  level: '10-15',   minLevel: 10,  lore: 'A labyrinth of glittering ore beneath the mountains.',            x: 0.38, y: 0.76, color: '#6aa7ff', stamp: 'III'  },
  { slug: 'ashen_wastes',     name: 'Ashen Wastes',     level: '16-23',   minLevel: 16,  lore: 'Burned plains where revenants drift and drakes wheel above.',     x: 0.52, y: 0.60, color: '#ff7c4d', stamp: 'IV'   },
  { slug: 'shadowfell',       name: 'The Shadowfell',   level: '24-27',   minLevel: 24,  lore: 'The Shadow Lord\'s domain. Bring everything.',                    x: 0.63, y: 0.76, color: '#c294ff', stamp: 'V'    },
  { slug: 'emberreach',       name: 'Emberreach',       level: '28-51',   minLevel: 28,  lore: 'Smouldering canyons where dragonkind nest.',                      x: 0.76, y: 0.62, color: '#ff7c4d', stamp: 'VI'   },
  { slug: 'hammerhand_pass',  name: 'Hammerhand Pass',  level: '52-76',   minLevel: 52,  lore: 'A dwarf-cut mountain road guarding the ore caravans.',            x: 0.87, y: 0.47, color: '#d6a13d', stamp: 'VII'  },
  { slug: 'conclave_aedric',  name: 'Aedric Conclave',  level: '77-106',  minLevel: 77,  lore: 'A cloistered city of mages and their unquiet apprentices.',       x: 0.71, y: 0.39, color: '#b9a6ff', stamp: 'VIII' },
  { slug: 'saltmarsh',        name: 'Saltmarsh',        level: '107-141', minLevel: 107, lore: 'Sunken cities along a haunted, brackish shoreline.',              x: 0.17, y: 0.46, color: '#5dd4d0', stamp: 'IX'   },
  { slug: 'frostvale',        name: 'Frostvale',        level: '142-176', minLevel: 142, lore: 'Glacial valleys under a sky of perpetual aurora.',                x: 0.30, y: 0.33, color: '#a8e6ff', stamp: 'X'    },
  { slug: 'black_spire',      name: 'Black Spire',      level: '177-204', minLevel: 177, lore: 'A volcanic fortress-tower ruled by a fallen king.',               x: 0.45, y: 0.42, color: '#e0863d', stamp: 'XI'   },
  { slug: 'stormpeaks',       name: 'Stormpeaks',       level: '205-233', minLevel: 205, lore: 'Lightning-wracked summits ruled by storm giants.',               x: 0.58, y: 0.30, color: '#b9d8ff', stamp: 'XII'  },
  { slug: 'voidshade_hollow', name: 'Voidshade Hollow', level: '234-262', minLevel: 234, lore: 'A bottomless chasm that devours its own gravity.',                x: 0.71, y: 0.22, color: '#8b6cff', stamp: 'XIII' },
  { slug: 'mooncradle',       name: 'Mooncradle',       level: '263-294', minLevel: 263, lore: 'A tear in reality where stars bleed into the sky.',               x: 0.40, y: 0.18, color: '#c294ff', stamp: 'XIV'  },
  { slug: 'worldspine',       name: 'Worldspine',       level: '295-324', minLevel: 295, lore: 'The wyrm-king\'s mountain throne, spine of the known world.',      x: 0.24, y: 0.23, color: '#ff5a4d', stamp: 'XV'   },
  { slug: 'eternal_throne',   name: 'Eternal Throne',   level: '325-350', minLevel: 325, lore: 'Where the Last Sovereign waits at the end of all roads.',         x: 0.86, y: 0.82, color: '#ffd34d', stamp: 'XVI'  },
];

/** Pretty display name for a region slug, falling back to a humanised slug. */
export function regionName(slug: string): string {
  const found = REGIONS.find((r) => r.slug === slug);
  if (found) return found.name;
  return slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Lore blurb for a region slug (empty string if unknown). */
export function regionLore(slug: string): string {
  return REGIONS.find((r) => r.slug === slug)?.lore ?? '';
}
