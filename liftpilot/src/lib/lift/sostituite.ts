// The checks of compute() that a check of a modification stands in for (round 52): the safety factor S_f of UNI EN
// 81-50:2020 5.12 (r_sfa) where z of the owner's rope sheet is checked against 12/16 — which the sheet takes only with the
// specific pressure of D.2 met, as UNI 10411-1:2024 14.1 c)–d) allows (funi-modello.ts emits fm_z then only). One rule
// for every verdict that counts the calculation's checks beside the others: the calculation's (calc-verdict.ts), the
// acceptance test's (collaudo.ts collaudoVerdict, esitiNorme), the pill's panel (verdict-checks.ts) and the relazioni.
// Pure.
import type { CheckId } from '@/calc/types';

const SOSTITUISCE: ReadonlyMap<string, CheckId> = new Map([['fm_z', 'r_sfa']]);

/** The calculation's checks that some of `checks` stand in for. */
export const sostituite = (checks: readonly { id: string }[]): CheckId[] =>
  [...new Set(checks.flatMap((c) => { const s = SOSTITUISCE.get(c.id); return s ? [s] : []; }))];

/** `checks` without those that another of them, or of `altre`, stands in for. */
export function senzaSostituite<T extends { id: string }>(checks: readonly T[], altre: readonly { id: string }[] = []): T[] {
  const via = new Set<string>(sostituite([...checks, ...altre]));
  return checks.filter((c) => !via.has(c.id));
}
