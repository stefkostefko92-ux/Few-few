// The governor's tripping speed to set, as the documents write it (sheet 1, the relazione, the bill of materials): from
// KV_GOV.govTripMin times the rated speed, below the limit of the car's safety gear of the data of the installation —
// none given: the progressive one the sheet's loads take (registry limitatore.scatto, UNI EN 81-20:2020,
// 5.6.2.2.1.1 a)). The bounds rounded inward to the centimetre per second. Pure.
import { tripWindow, type GovernedGear } from '@/shaft/governor';
import type { Plant } from '../plant';
import { makeFmt } from '../present/tr';

const fmt = makeFmt('it-IT');

/** The car's safety gear the governor trips: the data of the installation's, else the progressive one. */
export const governedGear = (Pl: Plant): GovernedGear => Pl.safetyGear ?? 'progressive';

/** The window rounded inward [m/s]: at least `lo`, below `hi`; null when the gear admits no tripping speed for `v`
 *  (sg_type then says the gear does not take the speed). */
export function tripRange(v: number, Pl: Plant): { lo: number; hi: number } | null {
  const w = tripWindow(v, governedGear(Pl)), lo = Math.ceil(w.lo * 100 - 1e-9) / 100, hi = Math.floor(w.hi * 100 + 1e-9) / 100;
  return hi > lo ? { lo, hi } : null;
}

/** «≥ 0,73 e < 0,80» for sheet 1 and the relazione [m/s]. */
export function tripText(v: number, Pl: Plant): string {
  const r = tripRange(v, Pl);
  return r ? `≥ ${fmt(r.lo, 2)} e < ${fmt(r.hi, 2)}` : 'NESSUNA PER IL PARACADUTE';
}
