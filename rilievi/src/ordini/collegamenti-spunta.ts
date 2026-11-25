import type { Collegamento } from './collegamenti.js';
import type { Prefisso } from './registry.js';

/** Една отметка (или опция на радио група) на всяко място — „да“ на едното е „да“ на другите. */
export function spunta(
  key: string,
  membri: ReadonlyArray<readonly [Prefisso, string]>,
): Collegamento {
  return {
    key,
    tipo: 'scelta',
    membri: membri.map(([luogo, campo]) => ({ luogo, voci: { [campo]: 'SI' } })),
  };
}
