// The existing sling (arcata) of a modification that changes the car or the load: the car side's static load T* (the
// car with its sling, doors and gear plus the rated load) against the documented one decides whether the sling is to be
// checked for the new loads — UNI 10411-1:2024 and UNI 10411-11:2024, 6.1 (an increase brings 6.2/6.3–6.13, among them
// 6.9: the sling) and 22 (a new car on the old sling); a decrease brings the buffers and the progressive safety gear
// (collaudoOf counts the load as changed). The software has no model of the sling: the check (sl_frame, registry
// arcata.carichi) is a warning that asks for its maker's data or the engineer's calculation, when T* increases or cannot
// be compared because the documented loads are missing. Pure.
import { check } from '@/shaft/checks';
import type { ShaftCheck } from '@/shaft/types';
import type { Collaudo } from './collaudo';
import { variazioneCarico, type Carichi } from './modifica';

/** T* against the documented loads: increased (under UNI 10411-1 beyond prospetto 1, under -11 any increase), not
 *  increased, or not comparable (no documented loads); null when T* cannot change (neither the car nor the load among
 *  what the intervention changes), the lift is tested as new, or the design's loads are not all entered. */
export type TStar = 'aumento' | 'non_aumento' | 'ignoto';

export function tStarOf(C: Collaudo, ora: Carichi | null): TStar | null {
  if (C.norma === 'en81') return null;
  const doc = C.documentato;
  if (doc) return ora ? (variazioneCarico(C.norma, doc, ora).p1 ? 'aumento' : 'non_aumento') : null;
  return C.parti.includes('car') || C.parti.includes('load') ? 'ignoto' : null;
}

/** sl_frame (a warning, no value): the sling stays — not among the parts replaced — and T* increases or is not known. */
export function slingCheck(C: Collaudo, ora: Carichi | null): ShaftCheck | null {
  const t = tStarOf(C, ora);
  return !C.parti.includes('sling') && (t === 'aumento' || t === 'ignoto') ? check('sl_frame', false, null, null, 0, '', true) : null;
}
