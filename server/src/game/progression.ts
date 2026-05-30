import type { Character, CharacterClass } from '../types/domain';

export const XP_TABLE = (() => {
  const arr = [0];
  for (let lvl = 1; lvl <= 100; lvl++) {
    // Smooth exponential curve, tuned for ~10–15 min per level early on
    arr.push(Math.floor(50 * Math.pow(lvl, 1.7)));
  }
  return arr;
})();

export function xpForLevel(level: number): number {
  return XP_TABLE[Math.min(level, XP_TABLE.length - 1)];
}

export function levelFromXp(xp: number): number {
  let lvl = 1;
  while (lvl < XP_TABLE.length - 1 && xp >= XP_TABLE[lvl + 1]) lvl++;
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
  // Stats and skills are now gold-driven (see /api/character/upgrade-stat).
  // Levels grant HP/MP scaling. Gems trickle through daily claims & dungeon
  // clears (handled in those routes) so this function stays side-effect free.
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
    statPointsGained: 0,
    skillPointsGained: 0,
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
