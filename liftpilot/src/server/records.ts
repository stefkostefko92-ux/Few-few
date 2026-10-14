import 'server-only';
// The saved records as their documents take them, read back and reproduced by the running engines: one rule for every
// page, route and action. A calculation's documents (report, order, drawing set, export) need the calculation, the shaft
// design it was made from and the lift design it belongs to all reproduced; a record that is not keeps its page, and its
// documents wait for a new save (the button «Aggiorna con il software attuale»). An issued drawing set is kept as the PDF
// it was (DrawingSetPdf) and never needs this.
import { ENGINE_VERSION } from '@/calc/snapshot';
import type { FormValues } from '@/calc/types';
import { formValuesSchema } from '@/lib/calc-input';
import { NO_MARKS, valueMarks, type ValueMarks } from '@/lib/lift/marks';
import { collaudoOf, type Collaudo } from '@/lib/lift/collaudo';
import { collaudoReadSchema } from '@/lib/lift-input';
import { liftRecord, type LiftRecord } from '@/lib/lift-record';
import { LIFT_ENGINE_VERSION } from '@/lib/lift/version';
import { ROOM_ENGINE_VERSION } from '@/lib/room/snapshot';
import type { ReportDesign } from '@/lib/report/shaft';
import { reproduceDesign, type StoredDesign } from '@/lib/shaft-hash';
import { verifyStored } from '@/lib/snapshot-hash';
import { SHAFT_ENGINE_VERSION } from '@/shaft/snapshot';

/** A saved calculation's values read back, and whether the running engine reproduces its hash; null when unreadable. */
export function readCalc(c: { inputs: unknown; sha256: string }): { values: FormValues; same: boolean } | null {
  const v = formValuesSchema.safeParse(c.inputs);
  return v.success ? { values: v.data, same: verifyStored(v.data, c.sha256).same } : null;
}

/** The standards of a saved calculation's acceptance test: those chosen with it (Calculation.collaudo, outside its hash),
 *  else the intervention's default. */
export function storedCollaudo(values: FormValues, raw: unknown): Collaudo {
  const chosen = raw ? collaudoReadSchema.safeParse(raw) : null;
  return collaudoOf(values, chosen?.success ? chosen.data : undefined);
}

export interface CalcRecord {
  values: FormValues;
  /** the shaft design it was made from, reproduced; null without one or when not reproduced (`designSame`) */
  design: ReportDesign | null;
  /** the lift design it belongs to, derived again */
  lift: LiftRecord | null;
  calcSame: boolean;
  designSame: boolean;
  liftSame: boolean;
  /** all of them reproduced: its documents may be made */
  ok: boolean;
}

/** A saved calculation with the records it was made from or belongs to; null when its values do not read. */
export function calcRecord(c: {
  inputs: unknown; sha256: string; shaftDesign: StoredDesign | null; liftDesign: { inputs: unknown; engineVersion: string } | null;
}): CalcRecord | null {
  const r = readCalc(c);
  if (!r) return null;
  const design = c.shaftDesign ? reproduceDesign(c.shaftDesign) : null;
  const lift = c.liftDesign ? liftRecord(c.liftDesign, c.shaftDesign?.sha256, c.sha256) : null;
  const designSame = !c.shaftDesign || design !== null, liftSame = !c.liftDesign || (lift?.same ?? false);
  return { values: r.values, design, lift, calcSame: r.same, designSame, liftSame, ok: r.same && designSame && liftSame };
}

/** What the documents mark as filled in by the software: the lift design's switches and standards; a calculation without
 *  one carries the standards chosen with it, as its report does (`rawCollaudo` = Calculation.collaudo). */
export function recordMarks(rec: CalcRecord, rawCollaudo: unknown): ValueMarks {
  const L = rec.lift;
  const marks = L ? valueMarks(L.inputs.auto, L.same ? L.dv : null, L.dv.bottom, L.dv.collaudo) : NO_MARKS;
  return marks.collaudo ? marks : { ...marks, collaudo: storedCollaudo(rec.values, rawCollaudo) };
}

type Versioned = { engineVersion: string };
const oldCalc = (c: Versioned) => c.engineVersion !== ENGINE_VERSION, oldShaft = (d: Versioned) => d.engineVersion !== SHAFT_ENGINE_VERSION;

/** A record the running engines no longer reproduce, told by the engine versions stored with it and with the records it
 *  is made of (every hash covers its engine's version, and a change of an engine bumps it): the lists mark it «da
 *  aggiornare» without deriving anything. */
export const outdated = {
  calc: (c: Versioned & { shaftDesign?: Versioned | null; liftDesign?: Versioned | null }): boolean =>
    oldCalc(c) || (!!c.shaftDesign && oldShaft(c.shaftDesign)) || (!!c.liftDesign && c.liftDesign.engineVersion !== LIFT_ENGINE_VERSION),
  shaft: oldShaft,
  lift: (d: Versioned & { calculation: Versioned; shaftDesign: Versioned }): boolean =>
    d.engineVersion !== LIFT_ENGINE_VERSION || oldCalc(d.calculation) || oldShaft(d.shaftDesign),
  room: (r: Versioned & { calculation: Versioned }): boolean => r.engineVersion !== ROOM_ENGINE_VERSION || oldCalc(r.calculation),
};
