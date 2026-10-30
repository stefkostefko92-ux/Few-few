// The regime an existing lift was approved under (owner's decision 8; the norm expert's answers §1), as the relazione
// tecnica di modifica prints it: the acts of the lifts without the CE marking — modified under UNI 10411-1 — and DPR
// 162/1999 for the CE-marked ones — UNI 10411-11. From the year of installation the software derives one only as a
// guess: an act's date is not the day installations had to follow it (transitions are not in the texts), and 1999
// (KL.ceFrom, 1 July) and the years before the first act (1945) derive nothing. A derived regime is printed «da confermare ⚠» and the issue needs it chosen or
// confirmed on the logbook; one the base's part of UNI 10411 does not admit refuses the issue. DM 1635/1979 (screw,
// rack and hydraulic lifts) is not offered: LiftPilot's lifts are electric traction ones. Registry entry impianto.regime
// (norme-voci.ts). Pure.
import type { NormaCollaudo } from '../lift/collaudo';
import type { Norma10411 } from '../lift/modifica';
import { KL } from '../lift/norme';
import type { RegimeKey, RegimeRt } from './types';

export interface Regime {
  key: RegimeKey;
  /** as the RT prints it */
  sigla: string;
  /** the part of UNI 10411 a lift approved under it is modified with */
  norma: Norma10411;
  /** the years of installation it is derived from when the lift has no CE marking [first, last]; null: never */
  anni: readonly [number, number] | null;
  /** derived from the CE marking of the calculation (-11) */
  ce?: true;
  nota?: string;
}

/** The year of KL.ceFrom: a lift installed in it may be either (the day decides), so it derives nothing. */
export const ANNO_CE = Number(KL.ceFrom.slice(0, 4));
/** The first act of the succession UNI 10411-1 names (15.17 note 8, 18 note 9): a lift installed before it derives
 *  nothing — an act cannot be the rule of an earlier installation; the engineer chooses. */
export const ANNO_PRIMO_ATTO = 1945;

export const REGIMI: readonly Regime[] = [
  { key: 'dlgt_600_1945', sigla: 'D.Lgt. 600/1945', norma: '10411-1', anni: [ANNO_PRIMO_ATTO, 1962] },
  { key: 'dpr_1497_1963', sigla: 'DPR 1497/1963', norma: '10411-1', anni: [1963, 1987] },
  { key: 'dm_587_1987', sigla: 'DM 587/1987', norma: '10411-1', anni: [1988, ANNO_CE - 1] },
  { key: 'dpr_268_1994', sigla: 'DPR 268/1994', norma: '10411-1', anni: null, nota: 'non più citato nello scopo della UNI 10411-1 dal 2013' },
  { key: 'dpr_162_1999', sigla: 'DPR 162/1999 (marcatura CE)', norma: '10411-11', anni: null, ce: true },
];

/** A regime's entry. */
export const regime = (k: RegimeKey): Regime => REGIMI.find((r) => r.key === k) ?? REGIMI[0];

/** The regime the year of installation suggests (`ce`: the base is CE-marked, UNI 10411-11): DPR 162/1999 for a CE
 *  lift; else by the years of REGIMI, none for 1999, later years or no year. A guess, to confirm. */
export function regimeDaAnno(anno: number | undefined, ce: boolean): RegimeKey | null {
  if (ce) return 'dpr_162_1999';
  if (anno === undefined) return null;
  return REGIMI.find((r) => r.anni !== null && anno >= r.anni[0] && anno <= r.anni[1])?.key ?? null;
}

/** The regimes a lift modified under a part of UNI 10411 can have been approved under. */
export const regimiAmmessi = (norma: Norma10411): RegimeKey[] => REGIMI.filter((r) => r.norma === norma).map((r) => r.key);

/** Whether the regime agrees with the calculation's test (its CE marking): one of its part of UNI 10411. */
export const coerenzaRegime = (legge: RegimeKey, C: { norma: NormaCollaudo }): boolean =>
  C.norma !== 'en81' && regimiAmmessi(C.norma).includes(legge);

/** The regime as the RT reads it from the registry on a base of part `norma`: the chosen one, else the year's guess;
 *  printable at issue when chosen, or derived and confirmed on the logbook, and admitted by the part. */
export function regimeOf(a: { legge?: RegimeKey; leggeConfermata?: boolean; annoInstallazione?: number }, norma: Norma10411): RegimeRt {
  const derivata = a.legge ? null : regimeDaAnno(a.annoInstallazione, norma === '10411-11');
  const legge = a.legge ?? derivata, origine = a.legge ? 'scelta' : derivata ? 'anno' : null, confermata = a.leggeConfermata === true;
  const coerente = legge !== null && coerenzaRegime(legge, { norma });
  return { legge, origine, confermata, coerente, emettibile: coerente && (origine === 'scelta' || confermata) };
}
