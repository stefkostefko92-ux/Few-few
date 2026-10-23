// The ratio of the loads hung on the car side and on the counterweight side changed by a modification under UNI
// 10411-1 (6.1; modifica.ts Variazione.rapporto): the stability against slipping of its appendix D.1 is to be shown
// (calc/d1.ts), with D.2 — the specific pressure in the grooves, verified (round 48: a check met or not, tr_d2; g_press
// stays a value to state everywhere else) — and the buffers to UNI EN 81-20 5.8. The checks tr_d1 and tr_d2 are emitted
// together as the existing sling's (arcata.ts): only in that case, among the lift design's checks, the relazione's and
// sheet 1's; they enter the test under UNI 10411-1 only, with the load the changed ratio brings among the parts
// (ambito.ts SOLO_10411_1, collaudoOf). Registry: modifica.d1 (the values), rapporto.d1 and rapporto.d2 (the checks). Pure.
import { d1Of, d2Of, type D1Result } from '@/calc/d1';
import { readInputs } from '@/calc/inputs';
import type { FormValues, GrooveType } from '@/calc/types';
import { check } from '@/shaft/checks';
import type { ShaftCheck } from '@/shaft/types';
import type { Collaudo } from './collaudo';
import { carichiOf, variazioneCarico } from './modifica';

/** Whether the test is a modification under UNI 10411-1 whose documented loads, against the calculation's values `V`,
 *  change the ratio of the suspended loads (6.1). */
export function rapportoVariato(C: Collaudo, V: FormValues): boolean {
  if (C.norma !== '10411-1' || !C.documentato) return false;
  const ora = carichiOf(V);
  return !!ora && variazioneCarico('10411-1', C.documentato, ora).rapporto;
}

/** D.1 of the calculation's values when the ratio changes (the machine they verify, new or kept); null otherwise. */
export function d1Di(C: Collaudo, V: FormValues): D1Result | null {
  if (!rapportoVariato(C, V)) return null;
  const { I, N } = readInputs(V);
  return d1Of(I, N);
}

/** tr_d1: (T1/T2)·C1·C2 over e^(f·α) in the worse of D.1's two cases, at most 1 (a slack side: not met, no value);
 *  null when D.1 is not asked. */
export function d1Check(C: Collaudo, V: FormValues): ShaftCheck | null {
  const d = d1Di(C, V);
  if (!d) return null;
  const u = d.worst.util;
  return check('tr_d1', u <= 1 + 1e-9, Number.isFinite(u) ? u : null, 1, 2, '');
}

/** D.2 of the calculation's values when the ratio changes: the specific pressure with the car loaded with the rated load
 *  and its limit [N/mm²], with the machine's groove type (a V groove with undercut has no formula of its own in D.2:
 *  the larger of the two is the software's choice, round 48 review); null otherwise. */
export function d2Di(C: Collaudo, V: FormValues): { T: number; p: number; limit: number; gola: GrooveType } | null {
  if (!rapportoVariato(C, V)) return null;
  const { I, N } = readInputs(V);
  return { ...d2Of(I, N), gola: N.groove.type };
}

/** tr_d2: the specific pressure of D.2 at most its limit (12,5 + 4·v_c)/(1 + v_c), met or not, as g_press compares them
 *  (≤); null when D.1 is not asked. */
export function d2Check(C: Collaudo, V: FormValues): ShaftCheck | null {
  const d = d2Di(C, V);
  return d ? check('tr_d2', d.p <= d.limit, d.p, d.limit, 2, 'MPa') : null;
}

/** The checks a changed ratio asks (6.1), D.1 then D.2, as every list takes them: none when the ratio stays. */
export const rapportoChecks = (C: Collaudo, V: FormValues): ShaftCheck[] => [d1Check(C, V), d2Check(C, V)].filter((c): c is ShaftCheck => c !== null);
