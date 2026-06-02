/**
 * Gold-driven stat & skill upgrades.
 *
 * Each individual stat/skill costs progressively more gold to upgrade:
 *   1st upgrade → 5g, 2nd → 10g, 3rd → 15g, ..., nth → 5n gold
 *
 * Per-stat upgrade counts are persisted in the JSON column
 * `characters.stat_upgrades` so each stat scales independently.
 */

export const UPGRADE_BASE_COST = 5;

export type StatKey =
  | 'strength' | 'dexterity' | 'constitution'
  | 'intelligence' | 'wisdom' | 'charisma'
  | 'skill_sword' | 'skill_axe' | 'skill_bow'
  | 'skill_staff' | 'skill_magic' | 'skill_stealth';

export const STAT_KEYS: StatKey[] = [
  'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma',
  'skill_sword', 'skill_axe', 'skill_bow', 'skill_staff', 'skill_magic', 'skill_stealth',
];

export interface UpgradeCounts {
  [stat: string]: number;
}

export function parseCounts(raw: string | null | undefined): UpgradeCounts {
  if (!raw) return {};
  try { return JSON.parse(raw) || {}; } catch { return {}; }
}

/** Cost of the NEXT upgrade for a stat that has been upgraded `count` times.
 *  Audit balance #12: linear 5*(n+1) made +100 to a stat cost 25 250g and
 *  a Lv-200 hunt funded ~9 upgrades. Super-linear curve so the gold sink
 *  scales with progression: floor(5 * n^1.5). Cumulative to +100 ≈ 33 500g,
 *  to +500 ≈ 745 000g — meaningful but not a wall. */
export function nextUpgradeCost(count: number): number {
  const n = count + 1;
  return Math.max(UPGRADE_BASE_COST, Math.floor(UPGRADE_BASE_COST * Math.pow(n, 1.5)));
}

/** Cumulative cost to upgrade a stat from 0 → n upgrades. */
export function cumulativeCost(n: number): number {
  let s = 0;
  for (let i = 1; i <= n; i++) s += Math.max(UPGRADE_BASE_COST, Math.floor(UPGRADE_BASE_COST * Math.pow(i, 1.5)));
  return s;
}

/** Number of upgrades possible with `gold` from current count. */
export function affordableUpgrades(currentCount: number, gold: number): number {
  let bought = 0;
  let g = gold;
  let count = currentCount;
  while (g >= nextUpgradeCost(count)) {
    g -= nextUpgradeCost(count);
    bought++;
    count++;
  }
  return bought;
}

/** Total cost of `n` consecutive upgrades starting from `currentCount`. */
export function batchCost(currentCount: number, n: number): number {
  let total = 0;
  for (let i = 0; i < n; i++) total += nextUpgradeCost(currentCount + i);
  return total;
}
