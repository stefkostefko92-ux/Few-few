// The existing sling (arcata) of a modification that changes the car or the load: the rated load and the car side's
// static load T* (the car with its sling, doors and gear plus the rated load) against the documented ones decide whether
// the sling is to be checked for the new loads — UNI 10411-1:2024, 6.1 (T* or the rated load beyond prospetto 1 brings
// 6.3–6.12 and 6.15, among them 6.9: the sling), UNI 10411-11:2024, 6.1 (any increase of T* brings 6.2–6.13) and 22 (a
// new car on the old sling); a decrease brings the buffers and the progressive safety gear (collaudoOf counts the load
// as changed). The software has no model of the sling: the check (sl_frame, registry arcata.carichi) is a warning that
// asks for its maker's data or the engineer's calculation, when the loads are beyond those limits or cannot be compared
// because the documented loads are missing. Pure.
import { check } from '@/shaft/checks';
import type { ShaftCheck } from '@/shaft/types';
import type { Collaudo } from './collaudo';
import { variazioneCarico, type Carichi } from './modifica';

/** The loads against the documented ones: 'aumento' beyond the limits that bring 6.9 (under UNI 10411-1 T* or the
 *  rated load beyond prospetto 1 — Variazione.p1 —, under -11 any increase of T*), 'non_aumento' within them, 'ignoto'
 *  not comparable (no documented loads); null when T* cannot change (neither the car nor the load among what the
 *  intervention changes), the lift is tested as new, or the design's loads are not all entered. */
export type TStar = 'aumento' | 'non_aumento' | 'ignoto';

export function tStarOf(C: Collaudo, ora: Carichi | null): TStar | null {
  if (C.norma === 'en81') return null;
  const doc = C.documentato;
  if (doc) return ora ? (variazioneCarico(C.norma, doc, ora).p1 ? 'aumento' : 'non_aumento') : null;
  return C.parti.includes('car') || C.parti.includes('load') ? 'ignoto' : null;
}

/** sl_frame (a warning, no value): the sling stays — not among the parts replaced — and the loads are beyond the limits
 *  (tStarOf: T* or, under UNI 10411-1, the rated load) or not known. */
export function slingCheck(C: Collaudo, ora: Carichi | null): ShaftCheck | null {
  const t = tStarOf(C, ora);
  return !C.parti.includes('sling') && (t === 'aumento' || t === 'ignoto') ? check('sl_frame', false, null, null, 0, '', true) : null;
}
