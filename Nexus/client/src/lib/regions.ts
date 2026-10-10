// Единственият клиентски списък на 21-те региона за ПРЕДСТАВЯНЕ (лендинг, табло).
// Slug-овете съвпадат със сървъра (server/src/routes/hunting.ts REGION_ORDER +
// server/src/seed/monsters.ts REGION_BANDS); нивата — с ловните прагове.
// Картата (pages/World.tsx) държи СВОИТЕ координати отделно — тук няма позиции.
// Имената/лорът се превеждат през `world.regions.<slug>.{name,lore}`; английският
// текст тук е резервата (defaultValue), за да не излезе суров ключ на екрана.

export interface RegionInfo {
  slug: string;
  minLevel: number;
  maxLevel: number;
  name: string;
  lore: string;
  /** Цвят на биома — за акценти и сияние. */
  color: string;
}

export const REGIONS: RegionInfo[] = [
  { slug: 'whispering_woods', minLevel: 1, maxLevel: 5, color: '#6ad8a4', name: 'Whispering Woods', lore: 'A green wood near Oaken Hollow — every hero’s first road.' },
  { slug: 'mistmoor_hills', minLevel: 6, maxLevel: 9, color: '#9ad9ff', name: 'Mistmoor Hills', lore: 'Fog-laced highlands where orcs ride the high passes.' },
  { slug: 'crystal_caverns', minLevel: 10, maxLevel: 14, color: '#6aa7ff', name: 'Crystal Caverns', lore: 'A labyrinth of glittering ore beneath the mountains.' },
  { slug: 'ashen_wastes', minLevel: 15, maxLevel: 23, color: '#ff7c4d', name: 'Ashen Wastes', lore: 'Burned plains where revenants drift and drakes wheel above.' },
  { slug: 'shadowfell', minLevel: 24, maxLevel: 25, color: '#c294ff', name: 'The Shadowfell', lore: 'The Shadow Lord’s domain. Bring everything.' },
  { slug: 'emberreach', minLevel: 26, maxLevel: 49, color: '#ff7c4d', name: 'Emberreach', lore: 'Smouldering canyons where dragonkind nest.' },
  { slug: 'hammerhand_pass', minLevel: 50, maxLevel: 74, color: '#d6a13d', name: 'Hammerhand Pass', lore: 'A dwarf-cut mountain road guarding the ore caravans.' },
  { slug: 'conclave_aedric', minLevel: 75, maxLevel: 104, color: '#b9a6ff', name: 'Conclave of Aedric', lore: 'A cloistered city of mages and their unquiet apprentices.' },
  { slug: 'saltmarsh', minLevel: 105, maxLevel: 139, color: '#5dd4d0', name: 'Saltmarsh', lore: 'Sunken cities along a haunted, brackish shoreline.' },
  { slug: 'frostvale', minLevel: 140, maxLevel: 174, color: '#a8e6ff', name: 'Frostvale', lore: 'Glacial valleys under a sky of perpetual aurora.' },
  { slug: 'black_spire', minLevel: 175, maxLevel: 200, color: '#e0863d', name: 'Black Spire', lore: 'A volcanic fortress-tower ruled by a fallen king.' },
  { slug: 'stormpeaks', minLevel: 201, maxLevel: 230, color: '#b9d8ff', name: 'The Stormpeaks', lore: 'Lightning-wracked summits ruled by storm giants.' },
  { slug: 'voidshade_hollow', minLevel: 231, maxLevel: 260, color: '#8b6cff', name: 'Voidshade Hollow', lore: 'A bottomless chasm that devours its own gravity.' },
  { slug: 'mooncradle', minLevel: 261, maxLevel: 290, color: '#c294ff', name: 'Mooncradle', lore: 'A tear in reality where stars bleed into the sky.' },
  { slug: 'worldspine', minLevel: 291, maxLevel: 320, color: '#ff5a4d', name: 'The Worldspine', lore: 'The wyrm-king’s mountain throne, spine of the known world.' },
  { slug: 'eternal_throne', minLevel: 321, maxLevel: 350, color: '#ffd34d', name: 'The Eternal Throne', lore: 'Where the Last Sovereign waits at the end of all roads.' },
  { slug: 'ashen_veil', minLevel: 351, maxLevel: 380, color: '#9aa0ad', name: 'The Ashen Veil', lore: 'What remains when an ending ends. Ash, echo, and the patient dead.' },
  { slug: 'starfall_abyss', minLevel: 381, maxLevel: 410, color: '#6a8dff', name: 'The Starfall Abyss', lore: 'The grave of fallen stars. Light goes in; something else comes out.' },
  { slug: 'forge_of_dawn', minLevel: 411, maxLevel: 440, color: '#ffb84d', name: 'The Forge of Dawn', lore: 'Where the next world is being hammered. The smiths do not stop for visitors.' },
  { slug: 'crown_of_night', minLevel: 441, maxLevel: 470, color: '#5b4dff', name: 'The Crown of Night', lore: 'The court of the Unlit Crown, where the dark keeps its own throne.' },
  { slug: 'first_light', minLevel: 471, maxLevel: 500, color: '#fff1b8', name: 'The First Light', lore: 'The beginning before everything. The last road ends where the first one starts.' },
];

/** Пейзажен кадър на региона (изпечен рендер); при липса — ключовият арт. */
export const regionArt = (slug: string): string => `/assets/regions/${slug}.webp`;
export const KEY_ART = '/assets/landing/dominion-key.webp';

/** Опасност по нива — за етикета в досието (не игрова механика, само представяне). */
export function dangerOf(r: RegionInfo): 'low' | 'mid' | 'high' | 'end' {
  if (r.minLevel > 350) return 'end';
  if (r.minLevel >= 175) return 'high';
  if (r.minLevel >= 15) return 'mid';
  return 'low';
}

export function regionForLevel(level: number): RegionInfo {
  return REGIONS.find((r) => level >= r.minLevel && level <= r.maxLevel) ?? REGIONS[REGIONS.length - 1];
}
