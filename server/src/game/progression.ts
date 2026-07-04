import type { Character, CharacterClass } from '../types/domain';

// Back-compat snapshot of the first 100 levels (tests + any old consumers).
// The live curve is the formula below — uncapped.
export const XP_TABLE = (() => {
  const arr = [0];
  // Level 1 is the origin (0 XP) so this table matches xpForLevel(1) === 0.
  for (let lvl = 1; lvl <= 100; lvl++) arr.push(lvl === 1 ? 0 : Math.floor(50 * Math.pow(lvl, 1.7)));
  return arr;
})();

// The XP curve is a pure formula so the game is ENDLESS — there is no
// level cap. xpForLevel(n) = floor(50 * n^1.7) for any n ≥ 1.
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.floor(50 * Math.pow(level, 1.7));
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
  // Audit (balance landmine #4): stats + skills were "gold-driven only"
  // (see /api/character/upgrade-stat), but at lv 200+ a player who blew
  // through the broken XP curve had earned far less gold than the
  // ~745k needed to push a single stat to +500. Restoring 3 stat
  // points and 1 skill point per level guarantees a baseline build
  // recovery while the gold-buy path remains for power players.
  const statPointsGained = levelsGained * 3;
  const skillPointsGained = levelsGained;
  const hpGained = levelsGained * 10;
  const mpGained = levelsGained * 4;
  char.level = newLevel;
  char.stat_points = (char.stat_points || 0) + statPointsGained;
  char.skill_points = (char.skill_points || 0) + skillPointsGained;
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
