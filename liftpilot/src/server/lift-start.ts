import 'server-only';
// Where the one form of an installation starts: the saved lift design chosen (?from=); else the form's draft; else the
// latest lift design of the installation; an installation without one carries over its latest shaft design and
// calculation, entered as they were — a replacement become a whole project also the standards chosen for its test and
// the shaft and the machine room of its latest survey (a direct pull: the car and the counterweight under the drops it
// measured) — with the rest of the project still to enter (src/lib/lift/carry.ts); else empty (src/lib/lift/blank.ts).
// Always the user's company.
import { prisma } from '@/lib/db';
import type { SessionUser } from '@/lib/auth';
import { formValuesSchema } from '@/lib/calc-input';
import { liftInputsReadSchema } from '@/lib/lift-input';
import { surveySchema } from '@/lib/room/survey';
import { shaftInputsReadSchema } from '@/lib/shaft-input';
import { liftDraftSchema } from '@/lib/draft-input';
import type { LiftDraft } from '@/lib/lift/blank';
import { carriedOver } from '@/lib/lift/carry';
import { readDraft } from './drafts';
import { storedCollaudo } from './records';

export interface LiftStart extends LiftDraft {
  /** when the draft the form opens with was kept (ISO); null: none */
  draftAt: string | null;
}

export async function liftStart(user: SessionUser, projectId: string, fromId: string | null): Promise<LiftStart> {
  const find = (id: string | null) => prisma.liftDesign.findFirst({
    where: { projectId, companyId: user.companyId, ...(id ? { id } : {}) },
    orderBy: { createdAt: 'desc' },
    select: { inputs: true },
  });
  const record = async (id: string | null): Promise<LiftStart | null> => {
    const lift = await find(id), parsed = lift ? liftInputsReadSchema.safeParse(lift.inputs) : null;
    return parsed?.success ? { inputs: parsed.data, blank: [], draftAt: null } : null;
  };
  // the design chosen; an id not of this installation (or not the company's) counts as none
  const chosen = fromId ? await record(fromId) : null;
  if (chosen) return chosen;
  const draft = await readDraft(user, projectId, 'lift', liftDraftSchema);
  if (draft) return { ...draft.data, draftAt: draft.at };
  const newest = await record(null);
  if (newest) return newest;
  const mine = { projectId, companyId: user.companyId }, latest = { orderBy: { createdAt: 'desc' as const } };
  const [shaft, calc, room] = await Promise.all([
    prisma.shaftDesign.findFirst({ where: mine, ...latest, select: { inputs: true } }),
    prisma.calculation.findFirst({ where: mine, ...latest, select: { inputs: true, collaudo: true } }),
    prisma.roomDesign.findFirst({ where: mine, ...latest, select: { inputs: true } }),
  ]);
  const S = shaft ? shaftInputsReadSchema.safeParse(shaft.inputs) : null, C = calc ? formValuesSchema.safeParse(calc.inputs) : null;
  const R = room ? surveySchema.safeParse(room.inputs) : null;
  return {
    ...carriedOver({
      shaft: S?.success ? S.data : null,
      // the standards chosen for the replacement's test, normalised as its documents read them
      calc: C?.success ? { values: C.data, collaudo: calc?.collaudo ? storedCollaudo(C.data, calc.collaudo) : null } : null,
      survey: R?.success ? R.data : null,
    }),
    draftAt: null,
  };
}
