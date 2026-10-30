// The static load of the car side in the owner's model (sheet «Cabina», round 52): its rope tension T = g·(Q + P +
// Pfuni)/ct before and after the modification, the changes in %, and its limits of the new car's mass — its formulas in
// its order (golden: rt2-cqpl.test.ts) — and the state LiftPilot decides with: T* = P + Q of UNI 10411-1:2024 6.1
// (prospetto 1, ropes and cables excluded, no roping) and the rated load against the documented ones, as the context
// holds them (ctx.carico, lift/modifica.ts variazioneCarico: the stricter row across 500 kg, a decrease and a changed
// ratio of the suspended loads too) — the model's tension stays printed as information (E-C1). Its blanks corrected:
// the old loads, travel, roping and machine room from the context («before» empty: the same as after, E-C4, E-C20), the
// old ropes from the calculation's existing machine or typed, empty: the new ones (E-C2, E-C3). Pure.
import { readInputs } from '@/calc/inputs';
import { K } from '@/calc/norme';
import { ROUNDING_KG } from '../../lift/modifica';
import { KL } from '../../lift/norme';
import { num } from '../campi';
import { funiDaCalcolo } from '../funi-calc';
import { K_CQPL } from '../norme-cqpl';
import type { ContestoRt2, DatiRt2 } from '../types';

/** The model's inputs of the static load: the old and new rated load [kg], car [kg], travel [m], number of ropes, rope
 *  mass [kg/m], roping; the old machine room's index (Alto 1, Basso 2, blank 0) and the old roping's raw index (S76). */
export interface CaricoModelloIn {
  qOld: number;
  pOld: number;
  hOld: number;
  nOld: number;
  mOld: number;
  ctOld: number;
  ctOldRaw: number;
  kLocOld: number;
  qNew: number;
  pNew: number;
  hNew: number;
  nNew: number;
  mNew: number;
  ctNew: number;
}

export interface CaricoModelloOut {
  /** the ropes' mass [kg], the tension T [N] before and after, its change and the rated load's [%], U10 (a fraction),
   *  the model's Pmax and Pmin of the new car [kg] */
  pfOld: number;
  pfNew: number;
  Told: number;
  Tnew: number;
  varT: number;
  varQ: number;
  incrT: number;
  pMax: number;
  pMin: number;
}

/** The model's formulas (Cabina!R73:O82, U10), in its order. */
export function caricoModello(x: CaricoModelloIn): CaricoModelloOut {
  const pfOld = x.mOld * x.hOld * x.nOld; // R73 = Q68*T73*K6
  const pfNew = x.mNew * x.hNew * x.nNew; // R74 = Q67*T74*E6
  const Told = (K.g * (x.qOld + x.pOld + pfOld)) / x.ctOld; // O73
  const Tnew = (K.g * (x.qNew + x.pNew + pfNew)) / x.ctNew; // O74
  const varT = ((Tnew - Told) / Told) * 100; // O78
  const varQ = ((x.qNew - x.qOld) / x.qOld) * 100; // O79
  const incrT = (Tnew - Told) / Told; // U10
  const pMax = (x.pOld + x.qOld + pfOld * x.kLocOld) * K_CQPL.pModelloSu - (x.qNew + pfNew * x.kLocOld); // O81
  const pMin = (x.pOld + x.qOld + pfOld * x.ctOldRaw) * K_CQPL.pModelloGiu - (x.qNew + pfNew * x.ctOldRaw); // O82
  return { pfOld, pfNew, Told, Tnew, varT, varQ, incrT, pMax, pMin };
}

/** The existing machine's ropes of the calculation (number, mass per metre) when it has them, else null. */
export function funiPreesistentiDaCalcolo(ctx: ContestoRt2): { n: number; m: number } | null {
  const { O, compare, bad } = readInputs(ctx.calc.V);
  return compare && !bad.includes('o_n') && !bad.includes('o_qf') ? { n: O.n, m: O.qf } : null;
}

/** The model's inputs read from the context and the page's fields; null while the base misses a load, the travel or
 *  the ropes. */
export function ingressoModello(ctx: ContestoRt2, x: DatiRt2): CaricoModelloIn | null {
  const d = ctx.dopo, f = funiDaCalcolo(ctx.calc.V);
  if (d.Q === null || d.P === null || d.H === null || d.r === null || !f) return null;
  const old = funiPreesistentiDaCalcolo(ctx), ctOld = ctx.prima.r ?? d.r;
  return {
    qOld: ctx.prima.Q ?? d.Q, pOld: ctx.prima.P ?? d.P, hOld: ctx.prima.H ?? d.H,
    nOld: old?.n ?? num(x, 'funiPreesNumero') ?? f.input.n, mOld: old?.m ?? num(x, 'funiPreesMassa') ?? f.input.qf,
    ctOld, ctOldRaw: ctOld, kLocOld: (ctx.prima.locale ?? d.locale) === 'basso' ? 2 : 1,
    qNew: d.Q, pNew: d.P, hNew: d.H, nNew: f.input.n, mNew: f.input.qf, ctNew: d.r,
  };
}

/** What LiftPilot decides the car's page with (UNI 10411-1/-11:2024, 6.1). */
export interface StatoCarico {
  /** T* = P + Q before (documented) and after [kg]; the rated load before and after [kg] */
  TsOld: number;
  TsNew: number;
  qOld: number;
  qNew: number;
  /** the changes as fractions (negative: a decrease) */
  dT: number;
  dQ: number;
  /** the increases allowed without the checks (prospetto 1, the stricter row across 500 kg); null under -11 */
  tolT: number | null;
  tolQ: number | null;
  /** beyond prospetto 1 (under -11 any increase of T*); a load decreased (T* or the counterweight); T* itself
   *  decreased; the ratio of the suspended loads changed (D.1, D.2) */
  p1: boolean;
  calo: boolean;
  caloT: boolean;
  rapporto: boolean;
  /** the new car's mass within the tolerance of T* and not below the documented T* (a decrease brings checks) [kg] */
  pMax: number;
  pMin: number;
}

export function statoCarico(ctx: ContestoRt2): StatoCarico | null {
  const d = ctx.dopo;
  if (d.Q === null || d.P === null) return null;
  const qOld = ctx.prima.Q ?? d.Q, pOld = ctx.prima.P ?? d.P, v = ctx.carico, uno = ctx.norma === '10411-1';
  const row = qOld > KL.loadSplitQ || d.Q > KL.loadSplitQ ? 1 : 0;
  const tol = v ? v.limiti : uno ? { Q: KL.loadIncQ[row], T: KL.loadIncT[row] } : null;
  const TsOld = pOld + qOld, TsNew = d.P + d.Q;
  return {
    TsOld, TsNew, qOld, qNew: d.Q, dT: v?.dT ?? (TsNew - TsOld) / TsOld, dQ: v?.dQ ?? (d.Q - qOld) / qOld,
    tolT: tol?.T ?? null, tolQ: tol?.Q ?? null, p1: v?.p1 ?? false, calo: v?.calo ?? false, caloT: TsOld - TsNew > ROUNDING_KG,
    rapporto: v?.rapporto ?? false, pMax: (1 + (tol?.T ?? 0)) * TsOld - d.Q, pMin: TsOld - d.Q,
  };
}
