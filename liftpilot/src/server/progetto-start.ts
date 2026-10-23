import 'server-only';
// Where the Progetto of an installation starts (round 45): the drawing of a saved lift design chosen (?from=, of any
// time: its geometry, progettoOf); else the drawing's draft; else the latest lift design's drawing; an installation
// without one carries over its latest shaft design (the archive before the one form), else the shaft and the machine
// room of its latest survey — a direct pull with the car and the counterweight under the drops it measured
// (src/lib/lift/carry.ts) —, with the rest of the drawing still to enter; else empty (blankProgetto). A drawing started
// anew takes the drawn values on (the diverting pulley's distance from the plan only for a transformation). The
// calculation's values are the base's, never the start's. Always the user's company.
import { prisma } from '@/lib/db';
import type { SessionUser } from '@/lib/auth';
import { liftInputsReadSchema } from '@/lib/lift-input';
import { surveySchema } from '@/lib/room/survey';
import { shaftInputsReadSchema } from '@/lib/shaft-input';
import { liftDraftSchema } from '@/lib/draft-input';
import { carriedOver } from '@/lib/lift/carry';
import { autoNuovo, blankProgetto, dalComposto, progettoOf, type BaseCalcolo, type ProgettoDraft } from '@/lib/lift/progetto';
import { readDraft } from './drafts';

export interface ProgettoStart extends ProgettoDraft {
  /** when the draft the form opens with was kept (ISO); null: none */
  draftAt: string | null;
  /** the start carries over saved records of the installation (its values are the user's) */
  carried?: true;
  /** the draft's fields still marked «dal rilievo» (round 44, src/server/collega/forms.ts) */
  rilievo?: string[];
  /** the draft's form started from the survey */
  parte?: true;
}

export async function progettoStart(user: SessionUser, projectId: string, base: BaseCalcolo, fromId: string | null): Promise<ProgettoStart> {
  const find = (id: string | null) => prisma.liftDesign.findFirst({
    where: { projectId, companyId: user.companyId, ...(id ? { id } : {}) },
    orderBy: { createdAt: 'desc' },
    select: { inputs: true },
  });
  const record = async (id: string | null): Promise<ProgettoStart | null> => {
    const lift = await find(id), parsed = lift ? liftInputsReadSchema.safeParse(lift.inputs) : null;
    return parsed?.success ? { progetto: progettoOf(parsed.data), blank: [], draftAt: null } : null;
  };
  // the design chosen; an id not of this installation (or not the company's) counts as none
  const chosen = fromId ? await record(fromId) : null;
  if (chosen) return chosen;
  const draft = await readDraft(user, projectId, 'lift', liftDraftSchema);
  if (draft) {
    const { base: _base, ...kept } = draft.data;
    void _base;
    return { ...kept, draftAt: draft.at };
  }
  const newest = await record(null);
  if (newest) return newest;
  const mine = { projectId, companyId: user.companyId }, latest = { orderBy: { createdAt: 'desc' as const } };
  const [shaft, room] = await Promise.all([
    prisma.shaftDesign.findFirst({ where: mine, ...latest, select: { inputs: true } }),
    prisma.roomDesign.findFirst({ where: mine, ...latest, select: { inputs: true } }),
  ]);
  const S = shaft ? shaftInputsReadSchema.safeParse(shaft.inputs) : null, R = room ? surveySchema.safeParse(room.inputs) : null;
  const shaftIn = S?.success ? S.data : null, survey = R?.success ? R.data : null;
  if (!shaftIn && !survey) {
    const b = blankProgetto();
    return { progetto: { ...b.progetto, auto: autoNuovo(base) }, blank: b.blank, draftAt: null };
  }
  // the base's values place the drops of a direct pull under the survey's; nothing of them is the drawing's
  const c = dalComposto(carriedOver({ shaft: shaftIn, calc: { values: base.values, collaudo: base.collaudo ?? null }, survey }), undefined);
  return { progetto: { ...c.progetto, auto: autoNuovo(base) }, blank: c.blank, draftAt: null, carried: true };
}
