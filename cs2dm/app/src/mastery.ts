/**
 * Майсторство по оръжие (CONTRACT.md §3): убийства с оръжието за всички времена (сезон 0).
 * Значката е само текст и CSS форма до името — никакви изображения на оръжия или скинове
 * (правилата на Valve за общностни сървъри).
 */
export const MASTERY_TIERS = [
  { id: 'bronze', kills: 100 },
  { id: 'silver', kills: 500 },
  { id: 'gold', kills: 1500 },
  { id: 'platinum', kills: 4000 },
  { id: 'diamond', kills: 10000 },
] as const;

export type MasteryTierId = (typeof MASTERY_TIERS)[number]['id'];

export interface Mastery {
  tier: MasteryTierId | null;
  next: { id: MasteryTierId; kills: number; remaining: number } | null;
  /** Цял процент към следващата значка (0–99); при последната — 100. */
  percent: number;
}

export function masteryFor(killsInput: number): Mastery {
  const kills = Number.isFinite(killsInput) && killsInput > 0 ? Math.floor(killsInput) : 0;
  let index = -1;
  MASTERY_TIERS.forEach((tier, i) => {
    if (kills >= tier.kills) index = i;
  });
  const current = index >= 0 ? MASTERY_TIERS[index] : undefined;
  const next = MASTERY_TIERS[index + 1];
  if (!next) return { tier: current?.id ?? null, next: null, percent: 100 };
  const from = current?.kills ?? 0;
  const percent = Math.min(99, Math.floor(((kills - from) * 100) / (next.kills - from)));
  return {
    tier: current?.id ?? null,
    next: { id: next.id, kills: next.kills, remaining: next.kills - kills },
    percent,
  };
}

/**
 * Имената на оръжията, както ги пише плъгинът (`weapon_ak47`, `ak47`, `knife_t`…), в четим вид.
 * Непознато име не се гадае — показва се почистено, с главни букви.
 */
const WEAPON_NAMES: Record<string, string> = {
  ak47: 'AK-47',
  m4a1: 'M4A4',
  m4a1_silencer: 'M4A1-S',
  m4a1s: 'M4A1-S',
  awp: 'AWP',
  ssg08: 'SSG 08',
  scar20: 'SCAR-20',
  g3sg1: 'G3SG1',
  aug: 'AUG',
  sg556: 'SG 553',
  famas: 'FAMAS',
  galilar: 'Galil AR',
  deagle: 'Desert Eagle',
  revolver: 'R8 Revolver',
  glock: 'Glock-18',
  hkp2000: 'P2000',
  usp_silencer: 'USP-S',
  p250: 'P250',
  fiveseven: 'Five-SeveN',
  tec9: 'Tec-9',
  cz75a: 'CZ75-Auto',
  elite: 'Dual Berettas',
  mp9: 'MP9',
  mac10: 'MAC-10',
  mp7: 'MP7',
  mp5sd: 'MP5-SD',
  ump45: 'UMP-45',
  p90: 'P90',
  bizon: 'PP-Bizon',
  nova: 'Nova',
  xm1014: 'XM1014',
  mag7: 'MAG-7',
  sawedoff: 'Sawed-Off',
  negev: 'Negev',
  m249: 'M249',
  hegrenade: 'HE Grenade',
  molotov: 'Molotov',
  inferno: 'Molotov',
  incgrenade: 'Incendiary',
  taser: 'Zeus x27',
  knife: 'Knife',
};

export function weaponLabel(raw: string): string {
  const key = raw
    .trim()
    .toLowerCase()
    .replace(/^weapon_/, '');
  if (key.startsWith('knife') || key === 'bayonet') return WEAPON_NAMES.knife ?? 'Knife';
  const known = WEAPON_NAMES[key];
  if (known) return known;
  const cleaned = key.replace(/[^a-z0-9_-]/g, '').replace(/_/g, ' ');
  return cleaned ? cleaned.toUpperCase() : '?';
}
