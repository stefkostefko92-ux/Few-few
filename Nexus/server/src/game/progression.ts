import type { Character, CharacterClass } from '../types/domain';

// Back-compat snapshot of the first 100 levels (tests + any old consumers).
// The live curve is the formula below — uncapped.
export const XP_TABLE = (() => {
  const arr = [0];
  for (let lvl = 1; lvl <= 100; lvl++) arr.push(Math.floor(50 * Math.pow(lvl, 1.7)));
  return arr;
})();

// The XP curve is a pure formula so the game is ENDLESS — there is no
// level cap. xpForLevel(n) = floor(50 * n^1.7) for any n ≥ 1.
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.floor(50 * Math.pow(level, 1.7));
}

/**
 * Целеви per-kill XP за чудовище на дадено ниво: ~8 убийства на ниво,
 * изведено от реалната крива. Ползва се от hunting за клампване на
 * seed стойностите в темпова лента (0.6x–1.8x) — маха „XP стената" на
 * lv26 (act-1 seed-ът беше ~10x над темпа, expansion — на темпа).
 */
export function paceXpForKill(monsterLevel: number): number {
  const step = Math.max(1, xpForLevel(monsterLevel + 1) - xpForLevel(monsterLevel));
  return Math.max(5, Math.round(step / 8));
}

export function levelFromXp(xp: number): number {
  // Invert the curve, then walk to correct any rounding drift. No upper bound.
  let lvl = Math.max(1, Math.floor(Math.pow(xp / 50, 1 / 1.7)));
  while (xp >= xpForLevel(lvl + 1)) lvl++;
  while (lvl > 1 && xp < xpForLevel(lvl)) lvl--;
  return lvl;
}

export interface LevelUpResult {
  leveled: boolean;
  fromLevel: number;
  toLevel: number;
  statPointsGained: number;
  skillPointsGained: number;
  hpGained: number;
  mpGained: number;
  gemsGained: number;
}

export function applyXp(char: Character, xpGain: number): LevelUpResult {
  const fromLevel = char.level;
  char.xp += xpGain;
  const newLevel = levelFromXp(char.xp);
  if (newLevel <= fromLevel) {
    return { leveled: false, fromLevel, toLevel: fromLevel, statPointsGained: 0, skillPointsGained: 0, hpGained: 0, mpGained: 0, gemsGained: 0 };
  }
  const levelsGained = newLevel - fromLevel;
  // По спецификация на собственика: вдигането на ниво НЕ дава точки за
  // атрибути/умения. Атрибутите се вдигат ЕДИНСТВЕНО със злато по линейната
  // 5-10-15-… крива (виж /api/character/upgrade-stat + game/upgrade.ts).
  // Нивото дава само HP/MP растеж. Полетата *PointsGained остават в изхода
  // (=0) за обратна съвместимост със стари клиенти.
  const statPointsGained = 0;
  const skillPointsGained = 0;
  const hpGained = levelsGained * 10;
  const mpGained = levelsGained * 4;
  char.level = newLevel;
  char.hp_max += hpGained;
  char.mp_max += mpGained;
  char.hp = Math.min(char.hp + hpGained, char.hp_max);
  char.mp = Math.min(char.mp + mpGained, char.mp_max);
  return {
    leveled: true,
    fromLevel,
    toLevel: newLevel,
    statPointsGained,
    skillPointsGained,
    hpGained,
    mpGained,
    gemsGained: 0,
  };
}

export const ENERGY_REGEN_MS = 6 * 60 * 1000; // 1 energy per 6 minutes (200 energy in 20 hours)

export function regenerateEnergy(char: Character, now: number = Date.now()): void {
  if (char.energy >= char.energy_max) {
    char.energy_updated_at = now;
    return;
  }
  const elapsed = now - char.energy_updated_at;
  const gained = Math.floor(elapsed / ENERGY_REGEN_MS);
  if (gained <= 0) return;
  char.energy = Math.min(char.energy_max, char.energy + gained);
  char.energy_updated_at += gained * ENERGY_REGEN_MS;
}

export function classBaseStats(cls: CharacterClass) {
  switch (cls) {
    case 'warrior':
      return { strength: 9, dexterity: 5, constitution: 8, intelligence: 3, charisma: 4, wisdom: 4, skill_sword: 5, skill_axe: 3 };
    case 'ranger':
      return { strength: 5, dexterity: 9, constitution: 6, intelligence: 4, charisma: 5, wisdom: 5, skill_bow: 5, skill_stealth: 3 };
    case 'mage':
      return { strength: 3, dexterity: 4, constitution: 5, intelligence: 9, charisma: 5, wisdom: 8, skill_staff: 4, skill_magic: 5 };
    case 'rogue':
      return { strength: 5, dexterity: 8, constitution: 6, intelligence: 5, charisma: 6, wisdom: 4, skill_sword: 3, skill_stealth: 5 };
  }
}
