// A context for the RT's component tests (round 52): a modification under UNI 10411-1 on a calculation's values, with
// the documented loads and the logbook when given; every field overridable. Test helper, not a test.
import type { FormValues } from '@/calc/types';
import { collaudoOf, type Collaudo } from '@/lib/lift/collaudo';
import { contestoRt2, type TecniciRt2 } from '@/lib/rt2/contesto';
import type { ContestoRt2 } from '@/lib/rt2/types';
import type { Anagrafica } from '@/lib/rt/anagrafica';

/** A modification's calculation: 630 kg, 900 kg empty car, k 0,5, 1 m/s, 20 m, 1:1, machine above, 4 ropes of 10 mm. */
export const V_BASE: FormValues = {
  context: 'repl', machineStd: 'en81-20', Q: '630', P: '900', k: '0.5', v: '1', H: '20', r: '1', layout: 'top', alphaMode: 'manual', alphaManual: '180',
  n_n: '4', n_d: '10', n_Fmin: '46', n_qf: '0.34', n_D: '500', n_groove: 'VH', n_gamma: '40', n_i: '50', n_nm: '1400', n_Pn: '5.5', n_poles: '4',
  n_brakeSets: '2', n_brakeNm: '60', n_etaD: '0.7', aDesign: '0.8', aBrake: '0.5', rh: '0.2',
};

export interface CtxOpts {
  V?: FormValues;
  collaudo?: Partial<Collaudo>;
  anagrafica?: Anagrafica;
  tecnici?: TecniciRt2;
  liftUse?: 'passengers' | 'goods' | 'goodsHeavy';
}

export function ctxDi(o: CtxOpts = {}): ContestoRt2 {
  const V = { ...V_BASE, ...(o.V ?? {}) };
  const C = collaudoOf(V, { norma: '10411-1', parti: ['machine', 'ropes'], ...(o.collaudo ?? {}) } as Collaudo);
  return contestoRt2({ V, C, res: null, anagrafica: o.anagrafica ?? {}, liftUse: o.liftUse }, o.tecnici ?? {});
}
