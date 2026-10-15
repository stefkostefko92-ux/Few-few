// What a modification's acceptance test hangs on besides the parts replaced (UNI 10411-1/-11:2024). Which part of UNI
// 10411: by the lift's CE marking — the declaration of conformity in the logbook and the mark in the car (DPR 162/1999,
// art. 7 c.2 and art. 16 c.1), never the plate —, or, not known, by the day the lift was put in service. And whether the
// change of the loads, against the state the last report documents (the acceptance test's or an extraordinary
// verification's), brings the checks of the load: beyond the increases of prospetti 1 and 2 of UNI 10411-1 (6.1), any
// increase under UNI 10411-11 (6.1); a load that decreases brings them too (the buffers, the progressive safety gear).
// And (round 46) the changes of the rated speed and of the travel against what the logbook or a verbale documents
// (UNI 10411-1/-11:2024, 15 and 16), with the speed regulation of the existing controller.
// Registry: impianto.marcatura, impianto.variazione.carico, impianto.variazione.velocita, impianto.variazione.corsa. Pure.
import { readInputs } from '@/calc/inputs';
import type { FormValues } from '@/calc/types';
import { KL } from './norme';

/** The documented loads are whole kilograms from a report: a difference within half a kilogram is their rounding, not
 *  a change of the load (input sanity, not a value of a standard). */
export const ROUNDING_KG = 0.5;
/** The documented speed and travel, against the calculation's: a difference within these is their rounding, not a
 *  change (the same as sheet 1's mismatches between the calculation and the shaft, tavole/data.ts; input sanity, not a
 *  value of a standard) [m/s, m]. */
export const ROUNDING_V = 0.005, ROUNDING_H = 0.05;
/** Over a limit — a standard's or the rounding's: strictly, past the floating point's noise (+5,00 % is not over 5 %,
 *  15,05 m is within 0,05 m of 15 m). */
const oltre = (x: number, limit: number): boolean => x > limit + 1e-9;

/** The answer about the CE marking: there, not there, not known. */
export const MARCATURE = ['si', 'no', 'incerta'] as const;
export type Marcatura = (typeof MARCATURE)[number];

export type Norma10411 = '10411-1' | '10411-11';

/** The part of UNI 10411 the answer gives: with the CE marking -11, without it -1; not known, by the day the lift was
 *  put in service (`servizio`, YYYY-MM-DD: before KL.ceFrom by the earlier rules), to be confirmed on the logbook;
 *  null: not known and no day. */
export function normaDaMarcatura(ce: Marcatura, servizio?: string): Norma10411 | null {
  if (ce === 'si') return '10411-11';
  if (ce === 'no') return '10411-1';
  return servizio ? (servizio < KL.ceFrom ? '10411-1' : '10411-11') : null;
}

/** A day the lift was put in service (YYYY-MM-DD): one of the calendar ("1999-02-31" is not), not after `today`. */
export function isServiceDay(s: string, today: string = new Date().toISOString().slice(0, 10)): boolean {
  const d = new Date(`${s}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s && s <= today;
}

/** The loads of the lift [kg]: the rated load, the empty car with its sling, doors and their gear (P of the
 *  calculation), the counterweight (a type, not an interface: it is stored as JSON with the test). */
export type Carichi = { Q: number; P: number; Mcw: number };

/** The loads of a calculation's values as the calculation reads them (calc/inputs.ts, calc/model.ts): the counterweight
 *  P + the measured balancing load when there is one, else P + k·Q; null while one of them is not entered or is out of
 *  range (k does not count with a measured load). */
export function carichiOf(V: FormValues): Carichi | null {
  const { I, bad } = readInputs(V), off = (id: string): boolean => bad.includes(id);
  if (off('Q') || off('P') || off('qeq') || (I.qeq === 0 && off('k'))) return null;
  return { Q: I.Q, P: I.P, Mcw: I.P + (I.qeq > 0 ? I.qeq : I.k * I.Q) };
}

export interface Variazione {
  /** the increases as fractions: of the rated load, of the car side's static load T* = P + Q, of the counterweight
   *  over the rated load (the smaller of the two: the stricter) */
  dQ: number;
  dT: number;
  dTcp: number;
  /** the increases UNI 10411-1 allows without the checks of the load (null under -11: none) */
  limiti: { Q: number; T: number; Tcp: number } | null;
  /** beyond prospetto 1 (rated load or T*) and prospetto 2 (counterweight); under -11: T* and the counterweight increased */
  p1: boolean;
  p2: boolean;
  /** T* or the counterweight decreased */
  calo: boolean;
  /** under -11 a change beyond KL.loadStruct11 brings its §5 (the structures) too; under -1 null */
  strutture: boolean | null;
  /** under -1 the ratio of the suspended loads changed (6.1): T* or P away, by more than the documented loads' rounding
   *  carried to it, from the value that would keep the documented ratio to the new counterweight Tcp — D.1, D.2 and
   *  buffers to 5.8; under -11 false (its 6.1 counts every increase) */
  rapporto: boolean;
}

/** The change of the loads from the documented state `doc` to the design's `ora` under the part of UNI 10411. Under -1
 *  the stricter row when either rated load is over KL.loadSplitQ (the standard does not say which one decides). */
export function variazioneCarico(norma: Norma10411, doc: Carichi, ora: Carichi): Variazione {
  const Td = doc.P + doc.Q, To = ora.P + ora.Q;
  const dQ = (ora.Q - doc.Q) / doc.Q, dT = (To - Td) / Td, dTcp = (ora.Mcw - doc.Mcw) / Math.min(doc.Q, ora.Q);
  // a over b by more than the documented loads' rounding
  const over = (a: number, b: number): boolean => a - b > ROUNDING_KG;
  const calo = over(Td, To) || over(doc.Mcw, ora.Mcw);
  if (norma === '10411-11') {
    const big = Math.max(Math.abs(To - Td) / Td, Math.abs(ora.Mcw - doc.Mcw) / doc.Mcw) > KL.loadStruct11;
    return { dQ, dT, dTcp, limiti: null, p1: over(To, Td), p2: over(ora.Mcw, doc.Mcw), calo, strutture: big, rapporto: false };
  }
  const row = doc.Q > KL.loadSplitQ || ora.Q > KL.loadSplitQ ? 1 : 0;
  const limiti = { Q: KL.loadIncQ[row], T: KL.loadIncT[row], Tcp: KL.loadIncTcp[row] };
  // the ratio kept: T* and P in the documented proportion to the new counterweight (the full car and the empty one),
  // within the documented loads' rounding carried to the value that keeps it (a load and the counterweight each within
  // half a kilogram of the report's: a rounding of the report is never a change of the ratio)
  const k = ora.Mcw / doc.Mcw, off = (a: number, d: number): boolean => Math.abs(a - d * k) > ROUNDING_KG * k * (1 + d / doc.Mcw) + 1e-9;
  const rapporto = off(To, Td) || off(ora.P, doc.P);
  return { dQ, dT, dTcp, limiti, p1: dQ > limiti.Q || dT > limiti.T, p2: dTcp > limiti.Tcp, calo, strutture: null, rapporto };
}

/** The rated load changed past the documented loads' rounding (DPR 162/1999 art. 2 c.1 lett. cc) n. 2) names it). */
export const portataVariata = (doc: Carichi, ora: Carichi): boolean => Math.abs(ora.Q - doc.Q) > ROUNDING_KG;

/** The static loads changed past the documented loads' rounding — T* or the counterweight, up or down, or (under -1)
 *  their ratio (`Variazione.rapporto`): what the documents show of a change of the loads, whatever the prospetti allow
 *  (round 46 recheck: the DPR's case of the loads names it only when the documents show it). */
export const carichiVariati = (norma: Norma10411, doc: Carichi, ora: Carichi): boolean =>
  Math.abs(ora.P + ora.Q - (doc.P + doc.Q)) > ROUNDING_KG || Math.abs(ora.Mcw - doc.Mcw) > ROUNDING_KG || variazioneCarico(norma, doc, ora).rapporto;

/** Whether the change brings the checks of the load into the test: beyond the prospetti, a load decreased, or (under
 *  -1) the ratio of the suspended loads changed — stricter than the prospetti, on the side of safety (registry
 *  impianto.variazione.carico). */
export const caricoVariato = (v: Variazione): boolean => v.p1 || v.p2 || v.calo || v.rapporto;

/** The speed regulation of the existing controller, as the survey names it (rilievi's tipoVelocita): a frequency
 *  converter, two speeds, one speed. */
export const REGOLAZIONI = ['vvvf', '2v', '1v'] as const;
export type Regolazione = (typeof REGOLAZIONI)[number];

/** What the logbook (libretto) or a later verbale documents of the lift (a type, not an interface: it is stored as JSON
 *  with the test; at least one value): `v` the reference rated speed [m/s] — under UNI 10411-1 the initial one of the
 *  logbook, or the one an extraordinary verification established after an increase over 5 %; under -11 the documented
 *  one —, `v50` the speed after the passage of the mains to 50 Hz [m/s] (UNI 10411-1 only), `H` the travel [m] — under
 *  -1 at the first acceptance test, under -11 the documented one. */
export type Libretto = { v?: number; v50?: number; H?: number };

/** The calculation's rated speed [m/s] and travel [m] as the calculation reads them; null while not entered or out of
 *  range. */
export function velocitaOf(V: FormValues): number | null {
  const { I, bad } = readInputs(V);
  return bad.includes('v') ? null : I.v;
}
export function corsaOf(V: FormValues): number | null {
  const { I, bad } = readInputs(V);
  return bad.includes('H') ? null : I.H;
}

/** A comparison the documents and the form print for a change of speed: the speed compared with [m/s], the change from
 *  it (a fraction, negative: a decrease) and whose speed it is — the logbook's (or a later verbale's), the one after the
 *  passage to 50 Hz (UNI 10411-1), the documented one (UNI 10411-11). */
export interface ConfrontoVelocita { rispetto: number; dv: number; di: 'libretto' | '50hz' | 'documentata' }

export interface VariazioneVelocita {
  /** the speed the change is measured from [m/s]: under -1 the higher of the logbook's and the one after 50 Hz, under -11
   *  the documented one */
  rif: number;
  /** the change from it, as a fraction (negative: a decrease) */
  dv: number;
  /** under -1 over KL.speedInc1 above `rif` (15.1), under -11 any increase past the rounding */
  aumento: boolean;
  /** under -1 over KL.speedDec1 below the logbook's speed (15.16), under -11 any decrease past the rounding */
  calo: boolean;
  /** the speed is among the parts the modification changes */
  variata: boolean;
  /** under -11 a change over KL.ucmSpeed11: the UCM protection to UNI EN 81-20 5.6.7 (15 i)); under -1 false */
  ucm15i: boolean;
  /** the design's speed equal, within the rounding, to the documented one — under -1 the logbook's, or the one after
   *  50 Hz only when the logbook gives no speed (round 46 recheck: equal to the one after 50 Hz and above the logbook's is
   *  no «uguale»): no change at all — no note of a change within 5 % */
  uguale: boolean;
  /** what the change is printed against (round 46 review): under -1 an increase against `rif` (15.1), a decrease against
   *  the logbook's speed (15.16 — never the one after 50 Hz); within both, against the logbook's speed and the one after
   *  50 Hz when the design lies between them or equals the one after 50 Hz (within the rounding), else against the
   *  nearer of the two; under -11 the documented speed */
  confronti: ConfrontoVelocita[];
}

/** The change of the rated speed `v` of the design from what the logbook documents, under the part of UNI 10411; null
 *  without a documented speed (under -1 the logbook's or the one after 50 Hz, under -11 the documented one). */
export function variazioneVelocita(norma: Norma10411, lib: Libretto | undefined, v: number): VariazioneVelocita | null {
  const c = (rispetto: number, di: ConfrontoVelocita['di']): ConfrontoVelocita => ({ rispetto, dv: (v - rispetto) / rispetto, di });
  if (norma === '10411-11') {
    if (!lib?.v) return null;
    const rif = lib.v, d = v - rif, variata = oltre(Math.abs(d), ROUNDING_V);
    return { rif, dv: d / rif, aumento: variata && d > 0, calo: variata && d < 0, variata, ucm15i: oltre(Math.abs(d) / rif, KL.ucmSpeed11), uguale: !variata,
      confronti: [c(rif, 'documentata')] };
  }
  const rif = Math.max(lib?.v ?? 0, lib?.v50 ?? 0);
  if (!(rif > 0)) return null;
  const aumento = oltre((v - rif) / rif, KL.speedInc1), calo = !!lib?.v && oltre((lib.v - v) / lib.v, KL.speedDec1);
  const lv = lib?.v, v50 = lib?.v50, diRif = lv === rif ? 'libretto' : '50hz';
  const base = lv || v50, uguale = !!base && !oltre(Math.abs(v - base), ROUNDING_V);
  const confronti = aumento ? [c(rif, diRif)] : calo && lv ? [c(lv, 'libretto')]
    : lv && v50 && v50 > lv && oltre(v - lv, ROUNDING_V) && !oltre(v - v50, ROUNDING_V) ? [c(lv, 'libretto'), c(v50, '50hz')]
      : !lv || Math.abs(v - rif) <= Math.abs(v - lv) ? [c(rif, diRif)] : [c(lv, 'libretto')];
  return { rif, dv: (v - rif) / rif, aumento, calo, variata: aumento || calo, ucm15i: false, uguale, confronti };
}

export interface VariazioneCorsa {
  /** the travel's change from the documented one [m] (negative: shortened) */
  dH: number;
  allungata: boolean;
  accorciata: boolean;
  /** under -1 lengthened over KL.travelInc1 from the first acceptance test: the intervention counts as a new installation
   *  (16) — a warning, to be confirmed with whoever carries out the verification; under -11 false (no limit) */
  oltre8: boolean;
  /** the travel is among the parts the modification changes: any change past the rounding, a shortening too (DPR
   *  162/1999, art. 2 c.1 lett. cc) n. 3) */
  variata: boolean;
}

/** The change of the travel `H` of the design from the documented one, under the part of UNI 10411; null without a
 *  documented travel. */
export function variazioneCorsa(norma: Norma10411, lib: Libretto | undefined, H: number): VariazioneCorsa | null {
  if (!lib?.H) return null;
  const dH = H - lib.H, variata = oltre(Math.abs(dH), ROUNDING_H);
  return { dH, allungata: variata && dH > 0, accorciata: variata && dH < 0, oltre8: norma === '10411-1' && oltre(dH, KL.travelInc1), variata };
}

/** What the documents of the existing lift bring among a modification's parts, by the rule (round 46): the load by the
 *  documented loads (caricoVariato), the speed and the travel by the logbook (variazioneVelocita, variazioneCorsa), each
 *  against the calculation's values `V`. Nothing documented: nothing brought (the calculation is not even read). */
export function variazioniDi(norma: Norma10411, doc: { documentato?: Carichi; libretto?: Libretto }, V: FormValues): { load: boolean; speed: boolean; travel: boolean } {
  const lib = doc.libretto, ora = doc.documentato ? carichiOf(V) : null;
  const v = lib && (lib.v || lib.v50) ? velocitaOf(V) : null, H = lib?.H ? corsaOf(V) : null;
  return {
    load: !!doc.documentato && !!ora && caricoVariato(variazioneCarico(norma, doc.documentato, ora)),
    speed: v !== null && !!variazioneVelocita(norma, lib, v)?.variata,
    travel: H !== null && !!variazioneCorsa(norma, lib, H)?.variata,
  };
}
