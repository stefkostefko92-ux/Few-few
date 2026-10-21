import 'server-only';
// The base a relazione tecnica di modifica is made from (RT plan §4.2): the installation's latest «Calcolo argano» (its
// step-2 calculation) with, by what its Progetto draws (intervento.ts disegnoDi), its latest machine room surveyed on it
// (the room path) or the latest lift design drawn on it (the shaft path) — both reproduced by the running engines. Why an
// installation cannot have one now: no calculation, a «Trasformazione completa» or a test to UNI EN 81-20/50 (the new
// lift's documents apply), no Progetto on that calculation (or only on an older one), a record the running engines no
// longer reproduce (its page offers «Aggiorna con il software attuale»). An issued RT names its base by its records:
// `roomBase`/`liftBase` read them again the same way (record.ts). Company-scoped like queries.ts.
import type { TipoIntervento } from '@/lib/lift/intervento';
import { disegnoDi } from '@/lib/lift/intervento';
import { liftRecord } from '@/lib/lift-record';
import { prisma } from '@/lib/db';
import type { SessionUser } from '@/lib/auth';
import { idoneoRt } from '@/lib/rt/sezioni';
import type { RecordRef, RtBase } from '@/lib/rt/types';
import { mergeChecks } from '@/shaft/checks';
import { calcoloBase, tipoDi } from '../calcolo-base';
import { reproduceRoomRecord } from '../room-compose';

export type RtNonIdoneo = 'noCalc' | 'trasformazione' | 'en81' | 'noProgetto' | 'progettoVecchio' | 'engineChanged';

type Rec = { id: string; sha256: string; engineVersion: string; createdAt: Date };
const ref = (r: Rec): RecordRef => ({ id: r.id, sha256: r.sha256, engineVersion: r.engineVersion, createdAt: r.createdAt.toISOString() });

const CALC_COLS = { id: true, inputs: true, sha256: true, engineVersion: true, createdAt: true, collaudo: true, intervento: true } as const;
/** A machine room as its base reads it: the survey, its hash, its calculation. */
export const ROOM_BASE = { id: true, inputs: true, sha256: true, engineVersion: true, createdAt: true, label: true, calculation: { select: CALC_COLS } } as const;
/** A lift design as its base reads it: the form, its hash, its calculation and shaft design. */
export const LIFT_BASE = {
  id: true, inputs: true, sha256: true, engineVersion: true, createdAt: true, label: true, baseCalculationId: true,
  calculation: { select: { id: true, sha256: true, engineVersion: true, createdAt: true, intervento: true } },
  shaftDesign: { select: { id: true, sha256: true, engineVersion: true, createdAt: true } },
} as const;

type CalcRow = Rec & { inputs: unknown; collaudo: unknown; intervento: TipoIntervento | null };
export type RoomRow = Rec & { inputs: unknown; label: string | null; calculation: CalcRow };
export type LiftRow = Rec & { inputs: unknown; label: string | null; baseCalculationId: string | null;
  calculation: Rec & { intervento: TipoIntervento | null }; shaftDesign: Rec };

export type BaseResult = { ok: true; base: RtBase } | { ok: false; reason: Extract<RtNonIdoneo, 'trasformazione' | 'en81' | 'engineChanged'> };

/** The room path's base from a machine room and its calculation, both reproduced. */
export function roomBase(r: RoomRow): BaseResult {
  const rep = reproduceRoomRecord(r, r.calculation);
  if (!rep.ok) return { ok: false, reason: 'engineChanged' };
  const tipo = rep.tipo ?? tipoDi(r.calculation), why = idoneoRt(tipo, rep.collaudo.norma);
  if (why) return { ok: false, reason: why };
  if (tipo === 'TRASFORMAZIONE_COMPLETA' || rep.collaudo.norma === 'en81') return { ok: false, reason: 'trasformazione' };
  return { ok: true, base: {
    path: 'locale', tipo, norma: rep.collaudo.norma, collaudo: rep.collaudo, values: rep.values, analysis: rep.derived.analysis,
    room: { survey: rep.survey, derived: rep.derived, checks: rep.derived.checks },
    records: { calc: ref(r.calculation), room: ref(r) },
  } };
}

/** The shaft path's base from a lift design, its calculation and its shaft design, all reproduced. */
export function liftBase(d: LiftRow): BaseResult {
  const L = liftRecord(d, d.shaftDesign.sha256, d.calculation.sha256);
  if (!L?.same) return { ok: false, reason: 'engineChanged' };
  const dv = L.dv, C = dv.collaudo;
  const tipo = d.calculation.intervento ?? tipoDi({ inputs: dv.values, collaudo: C, intervento: null }), why = idoneoRt(tipo, C.norma);
  if (why) return { ok: false, reason: why };
  if (tipo === 'TRASFORMAZIONE_COMPLETA' || C.norma === 'en81') return { ok: false, reason: 'trasformazione' };
  return { ok: true, base: {
    path: 'vano', tipo, norma: C.norma, collaudo: C, values: dv.values, analysis: dv.analysis,
    lift: { layout: dv.layout, dv, checks: mergeChecks(dv.layout.checks, dv.supportChecks), underPit: dv.bottom === 'under' },
    records: { calc: ref(d.calculation), lift: ref(d), shaft: ref(d.shaftDesign) },
  } };
}

/** Where the installation's RT stands now: its base, or why there is none, with the records the page links. */
export interface RtBaseState {
  /** the latest step-2 calculation */
  calc: { id: string; createdAt: Date; tipo: TipoIntervento } | null;
  /** what its Progetto draws */
  disegno: 'locale' | 'vano' | null;
  /** the record of the Progetto the base is (or would be) */
  progetto: { kind: 'room' | 'lift'; id: string; createdAt: Date; label: string | null } | null;
  result: { ok: true; base: RtBase } | { ok: false; reason: RtNonIdoneo };
}

/** The base of an active installation of the company now (rtBaseOf): never one of another company or archived. */
export async function rtBaseOf(user: SessionUser, projectId: string): Promise<RtBaseState> {
  const c = await calcoloBase(user, projectId);
  if (!c) return { calc: null, disegno: null, progetto: null, result: { ok: false, reason: 'noCalc' } };
  const calc = { id: c.id, createdAt: c.createdAt, tipo: c.tipo };
  const not = idoneoRt(c.tipo, c.collaudo.norma);
  if (not) return { calc, disegno: null, progetto: null, result: { ok: false, reason: not } };
  const disegno = disegnoDi(c.tipo, c.collaudo, c.values), where = { companyId: user.companyId, projectId };
  if (disegno === 'locale') {
    const r = await prisma.roomDesign.findFirst({ where: { ...where, calculationId: c.id }, orderBy: { createdAt: 'desc' }, select: ROOM_BASE });
    if (!r) {
      const older = await prisma.roomDesign.count({ where });
      return { calc, disegno, progetto: null, result: { ok: false, reason: older ? 'progettoVecchio' : 'noProgetto' } };
    }
    const progetto = { kind: 'room' as const, id: r.id, createdAt: r.createdAt, label: r.label };
    return { calc, disegno, progetto, result: c.same ? roomBase(r) : { ok: false, reason: 'engineChanged' } };
  }
  const d = await prisma.liftDesign.findFirst({ where: { ...where, baseCalculationId: c.id }, orderBy: { createdAt: 'desc' }, select: LIFT_BASE });
  if (!d) {
    const older = await prisma.liftDesign.count({ where });
    return { calc, disegno, progetto: null, result: { ok: false, reason: older ? 'progettoVecchio' : 'noProgetto' } };
  }
  const progetto = { kind: 'lift' as const, id: d.id, createdAt: d.createdAt, label: d.label };
  return { calc, disegno, progetto, result: c.same ? liftBase(d) : { ok: false, reason: 'engineChanged' } };
}
