// What a modification's acceptance test hangs on besides the parts replaced (UNI 10411-1/-11:2024). Which part of UNI
// 10411: by the lift's CE marking — the declaration of conformity in the logbook and the mark in the car (DPR 162/1999,
// art. 7 c.2 and art. 16 c.1), never the plate —, or, not known, by the day the lift was put in service. And whether the
// change of the loads, against the state the last report documents (the acceptance test's or an extraordinary
// verification's), brings the checks of the load: beyond the increases of prospetti 1 and 2 of UNI 10411-1 (6.1), any
// increase under UNI 10411-11 (6.1); a load that decreases brings them too (the buffers, the progressive safety gear).
// Registry: impianto.marcatura, impianto.variazione.carico. Pure.
import { readInputs } from '@/calc/inputs';
import type { FormValues } from '@/calc/types';
import { KL } from './norme';

/** The documented loads are whole kilograms from a report: a difference within half a kilogram is their rounding, not
 *  a change of the load (input sanity, not a value of a standard). */
const ROUNDING_KG = 0.5;

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
    return { dQ, dT, dTcp, limiti: null, p1: over(To, Td), p2: over(ora.Mcw, doc.Mcw), calo, strutture: big };
  }
  const row = doc.Q > KL.loadSplitQ || ora.Q > KL.loadSplitQ ? 1 : 0;
  const limiti = { Q: KL.loadIncQ[row], T: KL.loadIncT[row], Tcp: KL.loadIncTcp[row] };
  return { dQ, dT, dTcp, limiti, p1: dQ > limiti.Q || dT > limiti.T, p2: dTcp > limiti.Tcp, calo, strutture: null };
}

/** Whether the change brings the checks of the load into the test. */
export const caricoVariato = (v: Variazione): boolean => v.p1 || v.p2 || v.calo;
