// Схема на темата — споделена с бъдещия catalog.json от агента за данни (виж ДОГОВОРА в задачата).
// theme.family определя материалния архетип; primary/secondary/trim/emissive оцветяват;
// motif избира орнамента; finish завършека (мат/износен/полиран/емайлиран/светещ).

export type Family =
  | 'leather' | 'mail' | 'plate' | 'cloth' | 'bone' | 'crystal' | 'void'
  | 'celestial' | 'infernal' | 'verdant' | 'shadow' | 'arcane' | 'storm' | 'frost';

export type Motif = 'plain' | 'rivets' | 'filigree' | 'spikes' | 'runes' | 'feathers' | 'scales' | 'thorns' | 'stars' | 'flames';

export type Finish = 'matte' | 'worn' | 'polished' | 'enameled' | 'glowing';

export interface ItemTheme {
  family: Family;
  primary: string;
  secondary: string;
  trim: string;
  emissive?: string;
  motif: Motif;
  finish: Finish;
}

export type Category = 'weapon' | 'shield' | 'helm' | 'armor' | 'gloves' | 'boots' | 'cloak' | 'ring' | 'amulet';

export interface CatalogEntry {
  slug: string;
  name: string;
  category: Category;
  sub_type?: string;
  tier: number;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  class_req?: string;
  set_slug?: string | null;
  theme: ItemTheme;
}

const FAMILY_BY_TIER: Family[] = [
  'leather', 'leather', 'mail', 'mail', 'plate', 'plate',
  'storm', 'frost', 'arcane', 'celestial', 'void', 'infernal',
];

const MOTIF_BY_TIER: Motif[] = [
  'plain', 'rivets', 'rivets', 'scales', 'filigree', 'spikes',
  'runes', 'thorns', 'stars', 'flames', 'feathers', 'runes',
];

const FINISH_BY_TIER: Finish[] = [
  'matte', 'worn', 'worn', 'polished', 'polished', 'enameled',
  'enameled', 'glowing', 'glowing', 'glowing', 'glowing', 'glowing',
];

const RARITY_TINT: Record<string, string> = {
  common: '#8a8f98', uncommon: '#4fae6c', rare: '#3f7fe0',
  epic: '#a860e6', legendary: '#e0a83f',
};

/**
 * Временна тема по тир — САМО докато финалният catalog.json от агента за данни не е готов
 * (виж договора в задачата). Веднъж качен истинският каталог, тази функция спира да се вика
 * за реални предмети — остава като fallback за нови/недефинирани slug-ове.
 */
export function fallbackTheme(entry: { tier: number; rarity: string; category: string; sub_type?: string }): ItemTheme {
  const t = Math.min(12, Math.max(1, Math.round(entry.tier || 1)));
  const family = FAMILY_BY_TIER[t - 1];
  const motif = MOTIF_BY_TIER[t - 1];
  const finish = FINISH_BY_TIER[t - 1];
  const trim = RARITY_TINT[entry.rarity] || RARITY_TINT.common;
  const P = FAMILY_PALETTE[family];
  return {
    family, primary: P.primary, secondary: P.secondary, trim,
    emissive: finish === 'glowing' ? P.glow : undefined,
    motif, finish,
  };
}

const FAMILY_PALETTE: Record<Family, { primary: string; secondary: string; glow: string }> = {
  leather:   { primary: '#6b4a30', secondary: '#4a3320', glow: '#ffae4a' },
  mail:      { primary: '#8e949c', secondary: '#565a60', glow: '#bcd0ff' },
  plate:     { primary: '#c6cad0', secondary: '#3a3d42', glow: '#ffe08a' },
  cloth:     { primary: '#4a3e6e', secondary: '#7a6ab0', glow: '#c7a8ff' },
  bone:      { primary: '#d8cdb0', secondary: '#8a7a58', glow: '#eaff9a' },
  crystal:   { primary: '#6ecbe0', secondary: '#2a6a80', glow: '#9af4ff' },
  void:      { primary: '#241a30', secondary: '#0c0814', glow: '#8a2fff' },
  celestial: { primary: '#f0e6c0', secondary: '#c9a25a', glow: '#fff3c0' },
  infernal:  { primary: '#5c1010', secondary: '#1a0505', glow: '#ff5a1a' },
  verdant:   { primary: '#3a6e3a', secondary: '#1e3a1e', glow: '#8aff6a' },
  shadow:    { primary: '#1c1c22', secondary: '#0a0a0d', glow: '#6a4aff' },
  arcane:    { primary: '#5a2f8a', secondary: '#2a1450', glow: '#c294ff' },
  storm:     { primary: '#2f4f7a', secondary: '#16283f', glow: '#8ac8ff' },
  frost:     { primary: '#bfe6f0', secondary: '#5a94a8', glow: '#d8f8ff' },
};
