// The computation of «Contrappeso» of the RT after the owner's model (round 52): its rails (sheet «guide cwt 8120»), the
// change of its mass (sheet «Contrappeso solo inserimento», UNI 10411-1 6.1 prospetto 2) and the model's clearance
// check «VERIFICA CWT». The rails corrected as UNI EN 81-50:2020 5.10 asks (the model divides by the rail's weight and
// never by the shoes' distance, E-23): the guiding forces of the mass off the centre by 5 % of DFG and 10 % of the depth
// (E-29; the model halves them), Fy over n/2 (E-30), in running with K2 and, with a safety gear only, at its operation
// with K1 and buckling (E-25, E-28); every check computed (E-24). The mass's change as LiftPilot measures it
// (ctx.carico: the smaller rated load, the stricter row; E-34), whatever the intervention (E-33). The clearance as the
// model computes it. Units: N, mm, N/mm², kg. Pure.
import { KV_GUIDE } from '@/shaft/norme-guide';
import { KV_VERT } from '@/shaft/norme-vert';
import { ROUNDING_KG } from '../../lift/modifica';
import { KL } from '../../lift/norme';
import { KR } from '../../rt/norme';
import { num, str } from '../campi';
import { PARACADUTE_CWT, type ParacaduteGuide } from '../cataloghi/guide';
import { primaO } from '../contesto';
import { K_GUIDE } from '../norme-guide';
import type { ContestoRt2, DatiRt2 } from '../types';
import { fpDi } from './guide-cabina-calc';
import {
  G, allungamentoDi, ammissibili, colonnaGuida, flessione, massaColonna, omegaGuida, raggioInerzia, sezioneGuida, snellezza,
  type Caso, type OmegaNo, type SezioneGuida,
} from './guide-sezione';

/** DG!Y79 «sostituzione / solo verifica - cwt» (the model's list Z80:Z82). */
export const INTERVENTI_CWT = [
  { v: '1', t: 'cwt solo verifica - bordiglioni' }, { v: '2', t: 'cwt solo verifica - guide rigide' }, { v: '3', t: 'cwt sostituzione' },
] as const;

export interface CalcoloCwt {
  sez: SezioneGuida;
  E: number;
  n: number;
  l: number;
  h: number;
  i: number;
  lambda: number;
  omega: number | null;
  omegaNo: OmegaNo | null;
  amm: { run: number | null; gear: number | null };
  Mcw: number;
  gear: ParacaduteGuide;
  /** null without a safety gear */
  K1: number | null;
  K2: number;
  colonna: number;
  Mg: number;
  Fp: number;
  /** the mass's offsets [mm]: across the rails' line (XS, of the depth) and along it (YS, of DFG) */
  XS: number;
  YS: number;
  marcia: Caso;
  /** σ = σm + (Mg·g + Fp)/A in running; the deflections' limit: 5 mm with a safety gear, 10 without */
  sMarcia: number;
  dLim: number;
  paracadute: (Caso & { Fv: number; sk: number | null; s: number; sc: number | null }) | null;
}

/** The counterweight's rails; null while the base (its mass, the travel) or an input is missing. */
export function calcolaCwt(ctx: ContestoRt2, x: DatiRt2): CalcoloCwt | null {
  const sez = sezioneGuida(x, 'contrappeso'), Mcw = ctx.dopo.Mcw, H = ctx.dopo.H, Fp = fpDi(ctx, x);
  const [l, h, n, testata, fossa, dfg, prof] = (['l', 'h', 'numeroGuide', 'testata', 'fossa', 'dfg', 'profondita'] as const).map((id) => num(x, id));
  const gear = PARACADUTE_CWT.find((r) => String(r.n) === str(x, 'paracadute'));
  if (!sez || Mcw === null || H === null || l === null || h === null || n === null || testata === null || fossa === null || dfg === null || prof === null
    || !gear || Fp === null) return null;
  const E = K_GUIDE.E, i = raggioInerzia(sez), lambda = snellezza(l, i), w = omegaGuida(lambda, sez.Rm), amm = ammissibili(sez.Rm, allungamentoDi(x));
  const colonna = colonnaGuida(H, testata, fossa), Mg = massaColonna(sez.A, colonna), K2 = KV_VERT.k2Running;
  const XS = KV_GUIDE.cwEccDepth * prof, YS = KV_GUIDE.cwEccWidth * dfg;
  const caso = (k: number): Caso => flessione(k * G * Mcw * XS / (n * h), k * G * Mcw * YS / (n / 2 * h), l, sez, E);
  const marcia = caso(K2), K1 = gear.K1;
  let paracadute: CalcoloCwt['paracadute'] = null;
  if (K1 !== null) {
    const cg = caso(K1), Fv = (K1 * G * Mcw / n) + Mg * G + Fp, sk = w.omega === null ? null : (Fv * w.omega) / sez.A;
    paracadute = { ...cg, Fv, sk, s: cg.sm + Fv / sez.A, sc: sk === null ? null : sk + KV_GUIDE.railCombine * cg.sm };
  }
  return {
    sez, E, n, l, h, i, lambda, omega: w.omega, omegaNo: w.no, amm, Mcw, gear, K1, K2, colonna, Mg, Fp, XS, YS, marcia,
    sMarcia: marcia.sm + (Mg * G + Fp) / sez.A, dLim: K1 !== null ? KV_GUIDE.railDeflection : KR.cwRailDeflNoGear, paracadute,
  };
}

/** The change of the counterweight's mass (UNI 10411-1:2024, 6.1 prospetto 2; UNI 10411-11:2024, 6.1): before (the
 *  documented, else the same) and after [kg], the increase over the rated load it is measured on (-1) or in kg (-11), the
 *  limit (-1: the share of KL.loadIncTcp by the stricter row; -11: none, any increase), within or not, decreased. */
export interface PesoCwt {
  prima: number;
  dopo: number;
  Qbase: number;
  aumento: number;
  limite: number | null;
  /** the model's «peso limite» corrected: before + limit × the smaller rated load [kg] (-1) */
  pesoLimite: number | null;
  entro: boolean;
  calo: boolean;
}

export function pesoCwt(ctx: ContestoRt2): PesoCwt | null {
  const dopo = ctx.dopo.Mcw, prima = primaO(ctx, 'Mcw'), Qd = ctx.dopo.Q, Qp = primaO(ctx, 'Q');
  if (dopo === null || prima === null || Qd === null || Qp === null) return null;
  const Qbase = Math.min(Qp, Qd), v = ctx.carico;
  const limite = ctx.norma === '10411-1' ? (v?.limiti?.Tcp ?? KL.loadIncTcp[Qp > KL.loadSplitQ || Qd > KL.loadSplitQ ? 1 : 0]) : null;
  const aumento = v ? v.dTcp : (dopo - prima) / Qbase;
  // the context's verdict when the loads are documented (its rounding of the report), else no change
  const entro = v ? !v.p2 : true;
  return { prima, dopo, Qbase, aumento, limite, pesoLimite: limite === null ? null : prima + limite * Qbase, entro, calo: prima - dopo > ROUNDING_KG };
}

/** «VERIFICA CWT»: headroom + pit less the counterweight, its pillar, the buffer compressed and the two overtravels,
 *  against 0,3 m + 0,035·v² and the tie rods' room — the model's arithmetic (its H16, H18, F21). */
export interface MargineCwt {
  testata: number;
  fossa: number;
  v: number;
  somma: number;
  ingombro: number;
  pilastrino: number;
  L: number;
  f: number;
  extraCwt: number;
  extraCabina: number;
  M: number;
  Mextra: number;
  minimo: number;
  tiranti: number;
}

export function margineCwt(ctx: ContestoRt2, x: DatiRt2): MargineCwt | null {
  const [testata, fossa, ingombro, pilastrino, L, f, extraCwt, extraCabina] = (['testata', 'fossa', 'ingombroCwt', 'pilastrino', 'lAmm', 'frecciaAmm',
    'extracorsaCwt', 'extracorsaCabina'] as const).map((id) => num(x, id));
  const v = ctx.dopo.v;
  if (testata === null || fossa === null || ingombro === null || pilastrino === null || L === null || f === null || extraCwt === null || extraCabina === null
    || v === null) return null;
  const somma = testata + fossa;
  return {
    testata, fossa, v, somma, ingombro, pilastrino, L, f, extraCwt, extraCabina,
    M: somma - ingombro - pilastrino - (L - f) - extraCwt, Mextra: somma - ingombro - pilastrino - (L - f) - extraCwt - extraCabina,
    minimo: K_GUIDE.vcBase * 1000 + K_GUIDE.vcV2 * (v * v) * 1000, tiranti: K_GUIDE.vcTiranti,
  };
}
