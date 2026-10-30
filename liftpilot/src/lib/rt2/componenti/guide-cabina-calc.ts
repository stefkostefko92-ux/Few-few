// The computation of «Guide di cabina» of the RT after the owner's model (round 52, sheet «guide cabina 8120»): the
// rails' data, then the four cases of the model in its order — in running with K2 about the suspension point, the
// model's «Distribuzione del carico» (the same with K1), at the safety gear's operation (K1, about the rails' axes, with
// buckling), while loading at a floor — and a second entrance's loading case where one is given (E-19). The model's
// arithmetic in its order; its corrections: σ = σm + Fk/A (E-1), the load off the car's centre by ±XQ, ±YQ on the worse
// side (E-7), n from its input (E-10), the brackets' push Fp over 40 m of travel (E-17), the least radius of gyration,
// Rm/St, ω (guide-sezione.ts). Units: N, mm, N/mm², kg. Pure.
import { KV_GUIDE } from '@/shaft/norme-guide';
import { KV_VERT } from '@/shaft/norme-vert';
import { KR } from '../../rt/norme';
import { num, str } from '../campi';
import { PARACADUTE_CABINA, type ParacaduteGuide } from '../cataloghi/guide';
import { K_GUIDE } from '../norme-guide';
import type { AscensorePer, ContestoRt2, DatiRt2 } from '../types';
import {
  G, allungamentoDi, ammissibili, colonnaGuida, flessione, massaColonna, omegaGuida, peggiore, raggioInerzia, sezioneGuida, snellezza,
  type Caso, type OmegaNo, type SezioneGuida,
} from './guide-sezione';

/** The car on its rails [mm]: its centre (Xc, Yc), the ropes' point (Xs, Ys), the rated load's offset from the car's
 *  centre (XQ, YQ: 1/8 of the car's depth and width unless typed), the car door's sill (Xi, Yi) and a second entrance's. */
export interface GeoCabina {
  Xc: number;
  Yc: number;
  Xs: number;
  Ys: number;
  XQ: number;
  YQ: number;
  Xi: number;
  Yi: number;
  ingresso2: { Xi: number; Yi: number } | null;
}

export interface CasoCarico extends Caso {
  Fs: number;
}

export interface CalcoloCabina {
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
  P: number;
  Q: number;
  gear: ParacaduteGuide;
  K1: number;
  K2: number;
  colonna: number;
  Mg: number;
  Fp: number;
  geo: GeoCabina;
  marcia: Caso;
  distr: Caso;
  paracadute: Caso & { Fk: number; sk: number | null; s: number; sc: number | null };
  carico: CasoCarico;
  carico2: CasoCarico | null;
  /** σ = σm + (Mg·g + Fp)/A in running and while loading (E-18) */
  sMarcia: number;
  sCarico: number;
  sCarico2: number | null;
  /** the factor of the sill's force by «Ascensore per» and the model's printed formula */
  fsFattore: number;
  fsTesto: string;
}

/** The factor of Fs by the model's «Ascensore per» (DG!AD70: UNI EN 81-20:2020, 5.7.2.3.6) and its printed formula. */
export const FS_DI: Readonly<Record<AscensorePer, { k: number; testo: string }>> = {
  persone: { k: KV_GUIDE.sillLoad, testo: 'Fs  = 0,4 gn Q' },
  merci: { k: KV_GUIDE.sillLoadHeavy, testo: 'Fs  = 0,6 gn Q' },
  merci_carrelli: { k: KV_GUIDE.sillLoadDevices, testo: 'Fs  = 0,85 gn Q' },
};

/** The geometry from the inputs (the proposals under them), XQ and YQ from the car's depth and width as the model (1/8);
 *  null while a datum is missing. */
export function geoCabina(x: DatiRt2): GeoCabina | null {
  const D = num(x, 'profondita'), W = num(x, 'larghezza');
  // the model's (D·0,625) − D/2: the load on 3/4 of the floor, 1/8 off the centre (KV_VERT.loadOffset; 0,5 + 0,125 is exact)
  const k = 0.5 + KV_VERT.loadOffset;
  const XQ = num(x, 'XQ') ?? (D !== null ? (D * k) - D / 2 : null), YQ = num(x, 'YQ') ?? (W !== null ? (W * k) - W / 2 : null);
  const [Xc, Yc, Xs, Ys, Xi, Yi] = (['Xc', 'Yc', 'Xs', 'Ys', 'Xi', 'Yi'] as const).map((id) => num(x, id));
  if (Xc === null || Yc === null || Xs === null || Ys === null || Xi === null || Yi === null || XQ === null || YQ === null) return null;
  const Xi2 = num(x, 'Xi2'), Yi2 = num(x, 'Yi2');
  return { Xc, Yc, Xs, Ys, XQ, YQ, Xi, Yi, ingresso2: Xi2 !== null ? { Xi: Xi2, Yi: Yi2 ?? Yi } : null };
}

/** Whether the travel is over KR.fpTravelMax, where the brackets' push Fp counts (UNI EN 81-20:2020, 5.7.2.3.5), and the
 *  push [N]: the one given, 0 up to it (the model: always 0, E-17); null while it is asked and not given. */
export const conFp = (ctx: ContestoRt2): boolean => (ctx.dopo.H ?? 0) > KR.fpTravelMax;
export const fpDi = (ctx: ContestoRt2, x: DatiRt2): number | null => (conFp(ctx) ? num(x, 'fp') : 0);

function caricoAl(Xi: number, Yi: number, b: { P: number; Q: number; n: number; h: number; l: number; E: number; Fs: number; geo: GeoCabina; sez: SezioneGuida }): CasoCarico {
  const { P, n, h, Fs, geo: g } = b;
  const Fx = (G * P * (g.Xc - g.Xs) + Fs * (Xi - g.Xs)) / (n * h);
  const Fy = (G * P * (g.Yc - g.Ys) + Fs * (Yi - g.Ys)) / (n / 2 * h);
  return { ...flessione(Fx, Fy, b.l, b.sez, b.E), Fs };
}

/** The car rails' computation; null while the base (Q, P, travel) or an input is missing. */
export function calcolaCabina(ctx: ContestoRt2, x: DatiRt2): CalcoloCabina | null {
  const sez = sezioneGuida(x, 'cabina'), geo = geoCabina(x), Q = ctx.dopo.Q, P = ctx.dopo.P, H = ctx.dopo.H;
  const l = num(x, 'l'), h = num(x, 'h'), n = num(x, 'numeroGuide'), testata = num(x, 'testata'), fossa = num(x, 'fossa');
  const gear = PARACADUTE_CABINA.find((r) => String(r.n) === str(x, 'paracadute')), Fp = fpDi(ctx, x);
  if (!sez || !geo || Q === null || P === null || H === null || l === null || h === null || n === null || testata === null || fossa === null
    || !gear || gear.K1 === null || Fp === null) return null;
  const E = K_GUIDE.E, i = raggioInerzia(sez), lambda = snellezza(l, i), w = omegaGuida(lambda, sez.Rm), amm = ammissibili(sez.Rm, allungamentoDi(x));
  const K1 = gear.K1, K2 = KV_VERT.k2Running, colonna = colonnaGuida(H, testata, fossa), Mg = massaColonna(sez.A, colonna);
  const { Xc, Yc, Xs, Ys, XQ, YQ } = geo;
  // with the suspension point (running, «Distribuzione del carico»): the load at Xc ± XQ, Yc ± YQ, the worse side
  const sospeso = (k: number): Caso => flessione(
    peggiore((s) => k * G * (Q * ((Xc + s * XQ) - Xs) + P * (Xc - Xs)) / (n * h)),
    peggiore((s) => k * G * (Q * ((Yc + s * YQ) - Ys) + P * (Yc - Ys)) / (n / 2 * h)), l, sez, E);
  const marcia = sospeso(K2), distr = sospeso(K1);
  // the safety gear's operation: about the rails' axes; the vertical force with the rail's weight and Fp
  const Fk = (K1 * G * (P + Q) / n) + Mg * G + Fp, sk = w.omega === null ? null : (Fk * w.omega) / sez.A;
  const cg = flessione(peggiore((s) => K1 * G * (Q * (Xc + s * XQ) + P * Xc) / (n * h)), peggiore((s) => K1 * G * (Q * (Yc + s * YQ) + P * Yc) / (n / 2 * h)), l, sez, E);
  const paracadute = { ...cg, Fk, sk, s: cg.sm + Fk / sez.A, sc: sk === null ? null : sk + KV_GUIDE.railCombine * cg.sm };
  const fs = FS_DI[ctx.ascensorePer], Fs = fs.k * G * Q, b = { P, Q, n, h, l, E, Fs, geo, sez };
  const carico = caricoAl(geo.Xi, geo.Yi, b), carico2 = geo.ingresso2 ? caricoAl(geo.ingresso2.Xi, geo.ingresso2.Yi, b) : null;
  const vert = (Mg * G + Fp) / sez.A;
  return {
    sez, E, n, l, h, i, lambda, omega: w.omega, omegaNo: w.no, amm, P, Q, gear, K1, K2, colonna, Mg, Fp, geo, marcia, distr, paracadute, carico, carico2,
    sMarcia: marcia.sm + vert, sCarico: carico.sm + vert, sCarico2: carico2 ? carico2.sm + vert : null, fsFattore: fs.k, fsTesto: fs.testo,
  };
}
