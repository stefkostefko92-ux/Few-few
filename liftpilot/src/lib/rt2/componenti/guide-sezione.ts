// What the car's and the counterweight's rail pages of the RT after the owner's model share (round 52): the rail's
// section (the model's catalogue, or typed by hand), its permissible stresses, the buckling factor ω, the rail column's
// mass, and the bending of a rail between two brackets in one load case (UNI EN 81-50:2020, 5.10.2, 5.10.5, 5.10.6). The
// model's operations in its order (golden tests to 1e-9), with its corrections: the least radius of gyration (E-4),
// Rm/St of UNI EN 81-20:2020 prospetto 15 (E-5, E-26), ω of UNI EN 81-50 5.10.3 between Rm 370 and 520 only and from
// λ 20 (E-12–E-15), |Fx| in the foot's bending (E-6). Units: N, mm, N/mm², kg. Pure.
import { K } from '@/calc/norme';
import { KV_GUIDE } from '@/shaft/norme-guide';
import { KR } from '../../rt/norme';
import { omegaRm } from '../../tavole/rail-check';
import { num, str } from '../campi';
import { ALTRA, GUIDE_CATALOGO, guidaDi } from '../cataloghi/guide';
import { K_GUIDE } from '../norme-guide';
import type { DatiRt2 } from '../types';

export const G = K.g;

/** A rail's section as the pages print and the checks take it. */
export interface SezioneGuida {
  /** the profile as printed (the catalogue's «Tipo»; typed by hand: its «Dimensioni», as the model) and its finish */
  nome: string;
  dimensioni: string;
  lavorazione: string;
  Jx: number;
  Jy: number;
  Wx: number;
  Wy: number;
  A: number;
  Rm: number;
  lsc: number | null;
  c: number;
}

/** The fields of a rail typed by hand (the model's panel «Inserire i seguenti dati della guida:»). */
export const CAMPI_ALTRA = ['dimensioni', 'Jx', 'Jy', 'Wx', 'Wy', 'A', 'Rm', 'c'] as const;

/** The rail chosen (`profilo`: the model's index as text): the catalogue's row, or the one typed by hand (index
 *  ALTRA[k]); null while not chosen or not complete. */
export function sezioneGuida(x: DatiRt2, k: keyof typeof ALTRA): SezioneGuida | null {
  const p = Number(str(x, 'profilo'));
  if (p === ALTRA[k]) {
    const [Jx, Jy, Wx, Wy, A, Rm, c] = (['Jx', 'Jy', 'Wx', 'Wy', 'A', 'Rm', 'c'] as const).map((id) => num(x, id));
    const dimensioni = str(x, 'dimensioni');
    if (Jx === null || Jy === null || Wx === null || Wy === null || A === null || Rm === null || c === null || dimensioni === null) return null;
    return { nome: dimensioni, dimensioni, lavorazione: str(x, 'lavorazione') ?? '', Jx, Jy, Wx, Wy, A, Rm, lsc: num(x, 'lsc'), c };
  }
  const r = guidaDi(p);
  return r ? { nome: r.tipo.trimEnd(), dimensioni: r.dimensioni, lavorazione: r.lavorazione, Jx: r.Jx, Jy: r.Jy, Wx: r.Wx, Wy: r.Wy, A: r.A, Rm: r.Rm, lsc: r.lsc, c: r.c } : null;
}

/** The catalogue as the list of the field «Profilo guide» offers it, with the component's own rail typed by hand. */
export const opzioniProfilo = (k: keyof typeof ALTRA, altra: string): { v: string; t: string }[] => [
  ...GUIDE_CATALOGO.map((r) => ({ v: String(r.n), t: r.tipo.trimEnd() })), { v: String(ALTRA[k]), t: altra },
];

/** The steel's elongation A5 (UNI EN 81-20:2020, 5.7.4.5 prospetto 15). */
export type Allungamento = 'oltre12' | 'da8a12' | 'sotto8';
export const allungamentoDi = (x: DatiRt2): Allungamento => {
  const a = str(x, 'allungamento');
  return a === 'da8a12' || a === 'sotto8' ? a : 'oltre12';
};

/** The permissible stresses Rm/St in normal use and at the safety gear's operation [N/mm²]; none under 8 % (not
 *  admitted). The model's step table 165/205 – 195/244 – 230/290 (E-5) is replaced. */
export function ammissibili(Rm: number, a5: Allungamento): { run: number | null; gear: number | null } {
  if (a5 === 'sotto8') return { run: null, gear: null };
  const da8 = a5 === 'da8a12';
  return { run: Rm / (da8 ? KR.railStRun812 : KV_GUIDE.railStRun), gear: Rm / (da8 ? KR.railStGear812 : KV_GUIDE.railStGear) };
}

/** The radius of gyration [mm]: the least of the two axes (E-4; the model √(Jy/A)). */
export const raggioInerzia = (S: Pick<SezioneGuida, 'Jx' | 'Jy' | 'A'>): number => (Math.min(S.Jx, S.Jy) / S.A) ** 0.5;
/** The slenderness rounded to the integer, as the model (its ω tables go by integer λ). */
export const snellezza = (l: number, i: number): number => Math.round(l / i);

/** Why ω cannot be given: λ beyond the table, or a steel outside the method's Rm. */
export type OmegaNo = 'lambda' | 'rm';

/** ω for the slenderness λ and the steel's Rm (UNI EN 81-50:2020, 5.10.3: Rm 370 and 520, linear between; λ under 20 as
 *  20), or why not. */
export function omegaGuida(lambda: number, Rm: number): { omega: number | null; no: OmegaNo | null } {
  if (lambda > KV_GUIDE.omega370[KV_GUIDE.omega370.length - 1][0]) return { omega: null, no: 'lambda' };
  if (Rm < KR.railRmMin - 1e-9 || Rm > KR.railRmMax + 1e-9) return { omega: null, no: 'rm' };
  return { omega: omegaRm(lambda, Rm), no: null };
}

/** The rail column [m] (travel [m] + headroom + pit [mm], less K_GUIDE.colonnaRiduzione) and the mass of one rail line
 *  [kg], as the model (TABELLE!N, 'Contrappeso solo inserimento'!K14). */
export const colonnaGuida = (H: number, testata: number, fossa: number): number => (H + testata / 1000 + fossa / 1000) - K_GUIDE.colonnaRiduzione;
export const massaColonna = (A: number, colonna: number): number => A * colonna * K_GUIDE.massaAcciaio;

/** A load case on a rail between two brackets: the forces across the rails' line (Fx, on the blades' faces) and along it
 *  (Fy, on the tips) [N], the moments [Nmm], the stresses [N/mm²], the deflections [mm]. */
export interface Caso {
  Fx: number;
  My: number;
  sy: number;
  Fy: number;
  Mx: number;
  sx: number;
  sm: number;
  sf: number;
  dx: number;
  dy: number;
}

/** The model's bending of a case: M = 3·F·l/16, σ = M/W, σm = |σx| + |σy|, σF = 1,85·|Fx|/c² (the model has no ABS on the
 *  car's: E-6), δ = |0,7·F·l³/(48·E·J)|. */
export function flessione(Fx: number, Fy: number, l: number, S: Pick<SezioneGuida, 'Wx' | 'Wy' | 'Jx' | 'Jy' | 'c'>, E: number): Caso {
  const My = KV_GUIDE.railBend * Fx * l, sy = My / S.Wy, Mx = KV_GUIDE.railBend * Fy * l, sx = Mx / S.Wx;
  return {
    Fx, My, sy, Fy, Mx, sx, sm: Math.abs(sx) + Math.abs(sy), sf: (KV_GUIDE.railFlange * Math.abs(Fx)) / S.c ** 2,
    dx: Math.abs((KV_GUIDE.railDeflK * Fx * l ** 3) / (48 * E * S.Jy)), dy: Math.abs((KV_GUIDE.railDeflK * Fy * l ** 3) / (48 * E * S.Jx)),
  };
}

/** The value of the two of `f(+1)`, `f(−1)` larger in size (the load off the centre in one sense and then the other: the
 *  worse; E-7), +1 on a tie. */
export const peggiore = (f: (s: 1 | -1) => number): number => {
  const a = f(1), b = f(-1);
  return Math.abs(b) > Math.abs(a) ? b : a;
};
