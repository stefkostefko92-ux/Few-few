// What a design gives, as the search of the remedies reads it (round 54): the checks the acceptance test counts against
// it (collaudo.ts problemiCollaudo — the same rule as the verdict) and each check's distance from its limit, positive
// inside it, in the check's unit: the machine's with the sense the screens print (≥ or ≤, texts.ts), the shaft's by
// theirs (checks.ts isUpperLimit). Pure.
import type { Check } from '@/calc/types';
import { AT_LEAST } from '@/lib/present/texts';
import { problemiCollaudo, type Collaudo } from '@/lib/lift/collaudo';
import { isUpperLimit, type ShaftCheck } from '@/shaft';
import type { Esito, Stato } from './tipi';

/** How far a check of the machine is inside its limit; null: no number. */
export const margineCalc = (c: Check): number | null =>
  c.value == null || c.limit == null ? null : AT_LEAST.has(c.id) ? c.value - c.limit : c.limit - c.value;

/** How far a check of the shaft or of the machine room is inside its limit; null: no number. */
export const margineVano = (c: ShaftCheck): number | null =>
  c.value == null || c.limit == null ? null : isUpperLimit(c.id) ? c.limit - c.value : c.value - c.limit;

/** The design's result: under the test `C` (null: every check that does not pass or passes with «Attenzione»). */
export function esitoDi(C: Collaudo | null, calc: readonly Check[], vano: readonly ShaftCheck[]): Esito {
  const all = [...calc, ...vano], counted = C ? problemiCollaudo(C, all) : all.filter((c) => c.status === 'fail' || c.status === 'warn');
  const problemi = new Map<string, Stato>(counted.map((c) => [c.id, c.status === 'fail' ? 'fail' : 'warn']));
  const margini = new Map<string, number | null>([...calc.map((c) => [c.id, margineCalc(c)] as const), ...vano.map((c) => [c.id, margineVano(c)] as const)]);
  return { problemi, margini };
}
