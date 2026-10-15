// The falls of a direct pull that stay where they hang (round 46): an existing lift whose existing machine is compared
// keeps its hitches — the car and the counterweight stay — and the derivation checks the plan's falls against the
// existing sheave, whatever the new one (derive.ts, registry impianto.calata; the calculation inclines the ropes). The
// plan's drop starts at them — once the drawing is complete, in place of the software's placement — and is set to them
// again with one click beside the hint. Pure; the derivation is not changed.
import { readInputs } from '@/calc/inputs';
import type { FormValues } from '@/calc/types';
import type { Edit } from '@/drawing';
import { valueOf, type ShaftInputs } from '@/shaft';
import { calataEdit } from '@/shaft/drop';
import { editShaft } from '../shaft-edit';
import { missingOf } from './blank';
import { deriveLift } from './derive';
import type { LiftDerived } from './derive-types';
import { planFalls } from './direct';
import { composto, type BaseCalcolo, type ProgettoDraft } from './progetto';

/** The existing falls' spacing a calculation keeps [mm] — its existing sheave, on a direct pull compared on an existing
 *  lift —, else null. */
export function calateEsistenti(V: FormValues): number | null {
  const c = readInputs(V);
  return c.I.layout === 'top' && !planFalls(c) ? c.O.D : null;
}

/** The plan's drop dimension and the length that hangs the falls `Do` apart (the falls move with the drop); null without
 *  a direct pull. */
export function calataVerso(S: ShaftInputs, d: Pick<LiftDerived, 'layout' | 'calata'>, Do: number): { e: Edit; length: number } | null {
  const e = d.calata === null ? null : calataEdit(d.layout, 0, false, true), v = e ? valueOf(S, e.key) : null;
  if (!e || v === null || d.calata === null) return null;
  const along = (v - e.base) / e.k, now = e.across ? Math.hypot(along, e.across) - (e.plus ?? 0) : along;
  return { e, length: Math.round(now + Do - d.calata) };
}

/** The shaft with the plan's falls at the existing ones; null when the drop cannot be set there (out of the ranges the
 *  save takes). */
export function conCalateEsistenti(S: ShaftInputs, d: Pick<LiftDerived, 'layout' | 'calata'>, Do: number): ShaftInputs | null {
  const t = calataVerso(S, d, Do), r = t ? editShaft(S, t.e, t.length) : null;
  return r?.ok ? r.inputs : null;
}

/** A drawing on a calculation with existing falls, completed by the change from `prev` to `next`: its plan's drop at
 *  the existing falls when the placement left them elsewhere; any other change as it is. */
export function calateAlCompleto(prev: ProgettoDraft, next: ProgettoDraft, base: BaseCalcolo): ProgettoDraft {
  const Do = calateEsistenti(base.values);
  if (Do === null || !missingOf(composto(prev, base)).length) return next;
  const L = composto(next, base);
  if (missingOf(L).length) return next;
  const d = deriveLift(L.inputs);
  const S = d.issues.includes('calata') ? conCalateEsistenti(next.progetto.shaft, d, Do) : null;
  return S ? { ...next, progetto: { ...next.progetto, shaft: S } } : next;
}
