/**
 * Регионите на лова — ред, входни нива и логика за избор на среща.
 * Единствен източник за hunting.ts, bounties.ts и баланс харнеса.
 */
import { REGION_BANDS } from '../seed/monsters';

const BASE_REGIONS = ['whispering_woods', 'mistmoor_hills', 'crystal_caverns', 'ashen_wastes', 'shadowfell'];
const NAMED_MID_REGIONS = ['emberreach', 'hammerhand_pass', 'conclave_aedric', 'saltmarsh', 'frostvale', 'black_spire'];

/** Всички региони, подредени от ниско към високо ниво. */
export const REGION_ORDER: string[] = [...BASE_REGIONS, ...NAMED_MID_REGIONS, ...REGION_BANDS.map((b) => b.region)];

export const REGION_GATES: Record<string, number> = {
  whispering_woods: 1,
  mistmoor_hills: 6,
  crystal_caverns: 10,
  ashen_wastes: 15,
  shadowfell: 24,
  emberreach: 26,
  hammerhand_pass: 50,
  conclave_aedric: 75,
  saltmarsh: 105,
  frostvale: 140,
  black_spire: 175,
  ...Object.fromEntries(REGION_BANDS.map((b) => [b.region, b.gate])),
};

/** Всички APEX боссове носят `_apex_` в slug-а (seed/monsters.ts). */
export function isApexSlug(slug: string): boolean {
  return slug.includes('_apex_');
}

/**
 * Шанс една ловна среща да е APEX-ът на региона, когато е в ±3 нива.
 * Одит: преди APEX-ът влизаше в равномерния пул (2–3 чудовища) → на
 * върха на всеки регион 33–100% от лова бяха срещу босса (~0–5% победа):
 * 3–4 нива „стена", където ловът спираше (lv 102–104 — само APEX).
 */
export const APEX_ENCOUNTER_CHANCE = 0.2;

export interface EncounterPools<M> { regular: M[]; apex: M[] }

/**
 * Разделя чудовищата на региона на обикновен пул (±3 → 8 → 16 → всички, само
 * не-APEX) и APEX пул (само в ±3 от нивото на героя).
 */
export function huntEncounterPools<M extends { slug: string; level: number }>(regionMonsters: M[], level: number): EncounterPools<M> {
  const regularAll = regionMonsters.filter((m) => !isApexSlug(m.slug));
  let regular: M[] = [];
  for (const w of [3, 8, 16, 999]) {
    regular = regularAll.filter((m) => m.level >= Math.max(1, level - w) && m.level <= level + w);
    if (regular.length) break;
  }
  const apex = regionMonsters.filter((m) => isApexSlug(m.slug) && Math.abs(m.level - level) <= 3);
  return { regular, apex };
}

/** Избира чудовище за една среща (rng инжектиран за детерминизъм в тестове). */
export function pickHuntMonster<M extends { slug: string; level: number }>(pools: EncounterPools<M>, rng: () => number = Math.random): M | undefined {
  const { regular, apex } = pools;
  if (apex.length && (!regular.length || rng() < APEX_ENCOUNTER_CHANCE)) return apex[Math.floor(rng() * apex.length)];
  if (!regular.length) return undefined;
  return regular[Math.floor(rng() * regular.length)];
}
