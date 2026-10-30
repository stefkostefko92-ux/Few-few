import 'server-only';
// What the workspace of an RT after the owner's model opens with (round 52): the base now, the inputs — the draft kept
// (FormDraft scope 'rt2', its files deleted since dropped), else, for a revision, the inputs of the RT revised without
// its day and note, else a new start (the user as «Redatto da», the company's last «Verificato da», the company as
// «Ascensorista», the installation's documents in their order — photos, sketches and «other» files only when the
// technician adds them: GDPR art. 25(2)) —, the installation's files, the RTs issued and the revision prepared (only of
// the latest revision of a number of this installation). Company-scoped.
import type { SessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { rt2DraftDataSchema } from '@/lib/draft-input';
import { rt2InputsSchema, type Rt2Inputs } from '@/lib/rt2/input';
import { readDraft } from '../drafts';
import { latestVerificato, listProjectRts } from '../rt/queries';
import { SOLO_SU_SCELTA } from '../rt/workspace';
import { rt2BaseOf, type Rt2BaseState } from './base';

export interface Workspace2Data {
  state: Rt2BaseState;
  inputs: Rt2Inputs;
  draftAt: string | null;
  dropped: number;
  revisione: { id: string; number: string; revision: number } | null;
  files: { id: string; title: string; kind: string; pages: number; size: number; createdAt: Date }[];
  rts: Awaited<ReturnType<typeof listProjectRts>>;
}

async function revisioneDi(user: SessionUser, projectId: string, id: string | undefined) {
  if (!id) return null;
  const r = await prisma.technicalReport.findFirst({ where: { id, companyId: user.companyId, projectId }, select: { id: true, number: true, revision: true, year: true, seq: true, inputs: true } });
  if (!r) return null;
  const last = await prisma.technicalReport.findFirst({ where: { companyId: user.companyId, year: r.year, seq: r.seq }, orderBy: { revision: 'desc' }, select: { id: true } });
  return last?.id === r.id ? r : null;
}

export async function workspace2Of(user: SessionUser, projectId: string, askRevision: string | undefined, editable: boolean): Promise<Workspace2Data> {
  const [state, rts, files, draft] = await Promise.all([
    rt2BaseOf(user, projectId), listProjectRts(user, projectId),
    prisma.attachment.findMany({ where: { projectId, companyId: user.companyId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 200 }),
    editable ? readDraft(user, projectId, 'rt2', rt2DraftDataSchema) : Promise.resolve(null),
  ]);
  const alive = new Set(files.map((f) => f.id));
  const askedRev = await revisioneDi(user, projectId, askRevision ?? draft?.data.revisionOf);
  const draftFits = draft && (askRevision ? draft.data.revisionOf === askRevision : true);
  let inputs: Rt2Inputs, dropped = 0;
  if (draft && draftFits) {
    const all = draft.data.inputs.allegati ?? [], kept = all.filter((a) => alive.has(a.attachmentId));
    dropped = all.length - kept.length;
    inputs = { ...draft.data.inputs, ...(draft.data.inputs.allegati ? { allegati: kept } : {}) };
  } else if (askedRev) {
    const prev = rt2InputsSchema.safeParse(askedRev.inputs), p: Rt2Inputs = prev.success ? prev.data : {};
    const doc = p.doc ? { ...p.doc } : undefined;
    if (doc) delete doc.data;
    inputs = { ...p, ...(doc ? { doc } : {}), allegati: (p.allegati ?? []).filter((a) => alive.has(a.attachmentId)) };
    delete inputs.revisione;
  } else {
    const ver = await latestVerificato(user), documenti = files.filter((f) => !SOLO_SU_SCELTA.has(f.kind));
    inputs = {
      doc: { ascensorista: user.companyName }, firme: { redatto: { nome: user.name }, ...(ver ? { verificato: ver } : {}) },
      ...(documenti.length ? { allegati: documenti.map((f) => ({ attachmentId: f.id })) } : {}),
    };
  }
  return {
    state, inputs, draftAt: draft && draftFits ? draft.at : null, dropped,
    revisione: askedRev ? { id: askedRev.id, number: askedRev.number, revision: askedRev.revision } : null,
    files: files.map((f) => ({ id: f.id, title: f.title, kind: f.kind, pages: f.pages, size: f.size, createdAt: f.createdAt })), rts,
  };
}
