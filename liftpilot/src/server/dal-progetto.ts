import 'server-only';
// «Calcolo argano» opened with ?dal=progetto (round 45, «Porta nel calcolo» / «Modifica nel calcolo argano»): the
// values the installation's drawing gives its calculation (src/lib/lift/porta.ts) — from the drawing being made (the
// Progetto's draft, composed on the calculation's values) when it is complete, else from the latest lift design saved.
// The travel, the rope beyond it, the diverting pulley, a machine below's head pulleys: each marked «dal progetto», with
// the value it replaces; a direct pull whose falls the plan hangs gives the sheave the machine must have. Nothing is
// saved here. Always the user's company (the draft and the designs are read by the project's id and the company).
import type { FormValues } from '@/calc/types';
import type { SessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { liftDraftSchema } from '@/lib/draft-input';
import { liftInputsReadSchema } from '@/lib/lift-input';
import { deriveLift, type LiftDerived } from '@/lib/lift';
import { missingOf } from '@/lib/lift/blank';
import { planFalls } from '@/lib/lift/direct';
import { composto } from '@/lib/lift/progetto';
import { chiaviDelDisegno, portaNelCalcolo, type PortaKey, type Portato } from '@/lib/lift/porta';
import { readDraft } from './drafts';

export interface DalProgetto extends Portato {
  /** when the drawing was kept (its draft) or saved (its lift design) */
  at: Date;
  /** a direct pull whose falls the drawn plan hangs: their spacing [mm], the sheave the machine must have; else null */
  sheave: number | null;
}

/** The derivation of a drawing, or null when it cannot be worked out (values still missing in the calculation). */
function derived(inputs: Parameters<typeof deriveLift>[0]): LiftDerived | null {
  try {
    return deriveLift(inputs);
  } catch {
    return null;
  }
}

const sheaveOf = (d: LiftDerived): number | null =>
  (d.values.layout === 'top' && d.calata !== null && planFalls(d.analysis.ctx) ? Math.round(d.calata) : null);

/** The keys a saved design gives: its switches; a diverting pulley's height when it differs from the calculation's
 *  (set on the plan, or entered on the one form before round 45); only the travel when the two hang the ropes
 *  differently (the rest is of another arrangement). */
function chiaviSalvate(V: FormValues, drawn: FormValues, auto: Parameters<typeof chiaviDelDisegno>[1]): PortaKey[] {
  if (drawn.layout !== V.layout) return chiaviDelDisegno(null, { L0: false, dx: false, Hv: false });
  const ownH = V.layout === 'topDefl' && String(drawn.h ?? '') !== String(V.h ?? '');
  return chiaviDelDisegno(V.layout, auto, ownH);
}

/** What the drawing gives the calculation's values `V` (the calculator's start), or null when there is no drawing to
 *  take them from. */
export async function dalProgetto(user: SessionUser, projectId: string, V: FormValues): Promise<DalProgetto | null> {
  const draft = await readDraft(user, projectId, 'lift', liftDraftSchema);
  if (draft) {
    const L = composto({ progetto: draft.data.progetto, blank: draft.data.blank }, { values: V });
    const d = missingOf(L).length ? null : derived(L.inputs);
    if (d) {
      const keys = chiaviDelDisegno(V.layout, L.inputs.auto, draft.data.progetto.h !== undefined);
      return { ...portaNelCalcolo(V, d.values, keys), at: new Date(draft.at), sheave: sheaveOf(d) };
    }
  }
  const lift = await prisma.liftDesign.findFirst({
    where: { projectId, companyId: user.companyId }, orderBy: { createdAt: 'desc' }, select: { inputs: true, createdAt: true },
  });
  const L = lift ? liftInputsReadSchema.safeParse(lift.inputs) : null, d = L?.success ? derived(L.data) : null;
  if (!lift || !L?.success || !d) return null;
  return { ...portaNelCalcolo(V, d.values, chiaviSalvate(V, d.values, L.data.auto)), at: lift.createdAt, sheave: sheaveOf(d) };
}
