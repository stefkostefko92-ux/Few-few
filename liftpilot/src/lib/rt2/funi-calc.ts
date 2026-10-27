// The ropes' data of the owner's model read from a calculation (round 52): the suspension ropes, the sheave, its groove
// and the wrap angle as the calculation has them (calc/inputs.ts, geometry.ts — one value, one place), the loads, and
// what the calculation of a modification asks for the model's rope checks — the rope chosen from the model's lists,
// the compensation, the travelling cable, the reduced deceleration of D.1 (fields of the calculator, fields.ts FUNI_10411).
// The same reading for the RT's rope pages and the «Calcolo argano» verdict. Pure.
import { wrapAngles } from '@/calc/geometry';
import { readInputs } from '@/calc/inputs';
import type { FormValues } from '@/calc/types';
import { carichiOf } from '../lift/modifica';
import { CATENE_COMP, FUNI_COMP, funeDi, type FunePeso } from './cataloghi/funi';
import { KR2 } from './norme';
import { funiDi, type CompTipo, type FuniIn, type FuniOut } from './funi-core';
import { localeDi, tagliaDi } from './contesto';

/** The calculator's fields of the model's rope checks (the keys of the values; absent in a calculation made before
 *  round 52: none of them, the model's defaults). */
export const CAMPI_FUNI_10411 = ['n_cat', 'compTipo', 'compFune', 'compCatena', 'compN', 'compMt', 'compDt', 'compCwt', 'caviQ', 'aRidotta'] as const;

const numero = (x: unknown): number | null => {
  const s = String(x ?? '').trim().replace(',', '.');
  if (!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const COMP_TIPI: readonly CompTipo[] = ['nessuna', 'funi', 'catene'];

/** The compensation of the values: kind, the chosen size of its list (1-based), how many, the tensioner. */
export function compDi(V: FormValues): FuniIn['comp'] {
  const tipo = COMP_TIPI.find((t) => t === V.compTipo) ?? 'nessuna';
  const voce = tipo === 'funi' ? FUNI_COMP[(numero(V.compFune) ?? 0) - 1] : tipo === 'catene' ? CATENE_COMP[(numero(V.compCatena) ?? 0) - 1] : undefined;
  return {
    tipo, d: voce?.d ?? 0, q: voce?.q ?? 0, n: tipo === 'nessuna' ? 0 : Math.max(0, numero(V.compN) ?? 0),
    Mt: Math.max(0, numero(V.compMt) ?? 0), Dt: Math.max(0, numero(V.compDt) ?? 0), soloCwt: tipo === 'catene' && !!V.compCwt,
  };
}

export interface FuniCalcolo {
  input: FuniIn;
  out: FuniOut;
  /** the rope of the model's lists the calculation names (null: entered by hand) */
  fune: FunePeso | null;
}

/** The model's rope checks on a calculation's values; null while the values the checks need are not entered or out of
 *  range (the calculator flags them). */
export function funiDaCalcolo(V: FormValues): FuniCalcolo | null {
  const { I, N, bad } = readInputs(V), car = carichiOf(V);
  const off = ['n_n', 'n_d', 'n_Fmin', 'n_qf', 'n_D', 'n_groove', 'v', 'H'].some((id) => bad.includes(id));
  if (!car || off) return null;
  // the rope of the lists only while the calculation's diameter, breaking load and mass are its own (edited by hand: none)
  const cat = funeDi(V.n_cat), fune = cat && cat.d === N.d && Math.abs(cat.MBL - N.Fmin * 1000) < 0.5 && Math.abs(cat.q - N.qf) < 1e-9 ? cat : null;
  const wa = wrapAngles(I, N);
  const input: FuniIn = {
    n: N.n, d: N.d, MBL: N.Fmin * 1000, qf: N.qf, S: fune?.S ?? null, Q: car.Q, P: car.P, Mcw: car.Mcw, H: I.H, r: tagliaDi(V), v: I.v,
    locale: localeDi(V), D: N.D, gola: N.groove, alfa: Math.min(wa.B, wa.T), comp: compDi(V),
    caviQ: numero(V.caviQ) ?? KR2.caviMassa, aRidotta: !!V.aRidotta,
  };
  return { input, out: funiDi(input), fune };
}
