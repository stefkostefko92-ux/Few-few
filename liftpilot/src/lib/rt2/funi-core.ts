// The ropes' checks of the owner's model (sheet «Funi», round 52), the one computation the RT's rope pages and the
// «Calcolo argano» of a modification under UNI 10411 share: the safety factor z = rope's breaking load over the static
// pull on one rope against 12 (three ropes or more) or 16 (two), D/d of the traction sheave, the compensation's D/d,
// the stability against slipping of UNI 10411-1:2024 D.1 in its two static cases, the specific pressure of D.2. The
// model's formulas in its order, with its corrections (docs/rules.md → «Relazione tecnica di modifica», the list):
// z compared with ≥ (E-F6), the friction factor f of D.1 for the groove (E-F11–E-F13, calc/d1.ts fD1), C1 never under
// its band's minimum (E-F10), the larger pull over the smaller in each case (the model divides car side by
// counterweight side), the travelling cable's weight with g (E-F15). Kept as the model has them, on the safe side: its
// «a» by speed band, its 0,981 on the pressure's limit, the whole rope weight on the car side with the machine above
// and none with the machine below. Pure.
import { K } from '@/calc/norme';
import { c1Min, c2Of, fD1 } from '@/calc/d1';
import type { Groove } from '@/calc/types';
import { KR2 } from './norme';
import type { Locale, Taglia } from './types';

const G = K.g;
const rad = (deg: number): number => (deg * Math.PI) / 180;

export type CompTipo = 'nessuna' | 'funi' | 'catene';

export interface FuniIn {
  /** suspension ropes: number, diameter [mm], minimum breaking load [N], mass per metre [kg/m], metallic section [mm²]
   *  (printed only) */
  n: number;
  d: number;
  MBL: number;
  qf: number;
  S: number | null;
  /** rated load, empty car, counterweight [kg]; travel [m]; roping; rated speed [m/s]; machine room */
  Q: number;
  P: number;
  Mcw: number;
  H: number;
  r: Taglia;
  v: number;
  locale: Locale;
  /** the traction sheave [mm], its groove, the wrap angle [°] */
  D: number;
  gola: Groove;
  alfa: number;
  /** compensation: kind, diameter of the rope or link [mm], how many, mass per metre [kg/m], the tensioner's mass [kg]
   *  and its pulley [mm], chains hanging from mid-travel to the counterweight only */
  comp: { tipo: CompTipo; d: number; n: number; q: number; Mt: number; Dt: number; soloCwt: boolean };
  /** the travelling cable's mass per metre [kg/m] */
  caviQ: number;
  /** the model's «a = 0,5 m/s²» chosen for D.1 (its cell K28) */
  aRidotta: boolean;
  /** the car's braking deceleration of the calculation [m/s²] (its emergency braking check, Plant.ae): over the last
   *  band D.1 computes C1 with it (round 52, norm expert's answer 16) */
  aFrenatura: number;
}

export interface FuniOut {
  ropeWeight: number;
  ropeMass: number;
  compWeight: number;
  compMassCar: number;
  compMassCwt: number;
  Ctot: number;
  Cfune: number;
  sigma: number | null;
  z: number;
  zMin: number;
  dRatio: number;
  compRatio: number | null;
  T1: number;
  T2: number;
  T2p: number;
  T1p: number;
  cableWeight: number;
  a: number;
  C1: number;
  C2: number;
  f: number;
  alfaRad: number;
  efa: number;
  ratioLow: number;
  ratioHigh: number;
  vRope: number;
  Tstat: number;
  pRes: number;
  pLim: number;
}

/** The model's «a» of D.1 at the rated speed `v` [m/s²]: by band, 0,5 when chosen; over the last band the car's braking
 *  deceleration `frenatura` (UNI 10411-1:2024 D.1 computes C1 for the lift there, never under its minimum: the model's
 *  fixed 0,5 corrected, round 52). */
export function aModello(v: number, ridotta: boolean, frenatura: number): number {
  const band = KR2.d1Bande.find(([top]) => v <= top + 1e-9);
  if (!band) return frenatura;
  return ridotta ? KR2.d1Ridotta : band[1];
}

/** The larger of two pulls over the smaller (a slack side: infinite). */
const rapporto = (a: number, b: number): number => {
  const hi = Math.max(a, b), lo = Math.min(a, b);
  return lo > 0 ? hi / lo : Infinity;
};

/** The specific pressure of D.2 for the groove [N/mm²]: V by γ, U by β (0 without the undercut); a V groove with the
 *  undercut, which D.2 gives no formula of its own, the larger of the two (the calculation's choice, round 48). */
export function pressioneD2(T: number, n: number, d: number, D: number, gr: Groove): number {
  const b = gr.type === 'U' ? 0 : rad(gr.beta || 0), base = T / (n * d * D);
  const pU = (base * K.pressU * Math.cos(b / 2)) / (Math.PI - b - Math.sin(b));
  const pV = (base * K.pressV) / Math.sin(rad(gr.gamma || 0) / 2);
  return gr.type === 'U' || gr.type === 'UU' ? pU : gr.type === 'VH' ? pV : Math.max(pU, pV);
}

export function funiDi(x: FuniIn): FuniOut {
  const { n, Q, P, Mcw, H, r, v } = x;
  const ropeWeight = n * x.qf * H * G * r;
  const Mt2 = x.comp.Mt / 2, conComp = x.comp.tipo !== 'nessuna';
  const compWeight = conComp ? x.comp.n * x.comp.q * H * G : 0;
  const compMassCar = x.comp.soloCwt ? 0 : compWeight / G, compMassCwt = (x.comp.soloCwt ? compWeight / 2 : compWeight) / G;
  const Ctot = ((Q + P + Mt2 + compMassCar) * G + ropeWeight) / r, Cfune = Ctot / n;
  const kRope = x.locale === 'basso' ? 0 : 1, cableWeight = x.caviQ * (H / 2) * G;
  const T1 = ((P + K.loadTestFactor * Q + Mt2) * G + ropeWeight * kRope) / r;
  const T2 = ((Mcw + Mt2 + compMassCwt) * G) / r;
  const T2p = ((P + Mt2 + compMassCar) * G + cableWeight) / r;
  const T1p = ((Mcw + Mt2) * G + ropeWeight * kRope) / r;
  const a = aModello(v, x.aRidotta, x.aFrenatura), C1 = a < G ? Math.max((G + a) / (G - a), c1Min(v)) : Infinity, C2 = c2Of(x.gola), f = fD1(x.gola);
  const alfaRad = rad(x.alfa), efa = Math.exp(f * alfaRad);
  const vRope = v * r, Tstat = ((P + Q + Mt2) * G + ropeWeight) / r;
  return {
    ropeWeight, ropeMass: ropeWeight / G, compWeight, compMassCar, compMassCwt, Ctot, Cfune,
    sigma: x.S && x.S > 0 ? Cfune / x.S : null, z: x.MBL / Cfune, zMin: n === 2 ? K.sfMin2 : K.sfMin3,
    dRatio: x.D / x.d, compRatio: x.comp.tipo === 'funi' && x.comp.d > 0 ? x.comp.Dt / x.comp.d : null,
    T1, T2, T2p, T1p, cableWeight, a, C1, C2, f, alfaRad, efa,
    ratioLow: C1 * C2 * rapporto(T1, T2), ratioHigh: C1 * C2 * rapporto(T1p, T2p),
    vRope, Tstat, pRes: pressioneD2(Tstat, n, x.d, x.D, x.gola),
    pLim: ((K.pressBase + K.pressSpeed * vRope) / (1 + vRope)) * KR2.pressioneFattore,
  };
}
