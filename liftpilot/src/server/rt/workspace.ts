import 'server-only';
// What the workspace of an installation's relazione tecnica di modifica opens with (RT plan §7): the base now, the inputs
// — the draft kept (its files deleted since dropped), else, for a revision, the inputs of the RT revised without its day
// and note, else a new start (the user as «Redatto da», the company's last «Verificato da», the installation's documents
// in the order they were uploaded — photos and «other» files only when the technician adds them: they may show people,
// signatures or internal notes, and the fascicolo goes to the owner and the inspection body; GDPR art. 25(2)) —, the
// summary of their derivation, the installation's files, the RTs issued and the revision prepared (only of the latest
// revision of a number of this installation). Company-scoped.
import type { SessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { rtInputsSchema, type RtInputs } from '@/lib/rt/input';
import { rtBaseOf, type RtBaseState } from './base';
import { previewOf } from './preview';
import { latestVerificato, listProjectRts, readRtDraft } from './queries';
import { confermaOf, summaryOf, type Conferma, type RtSummary } from './summary';

/** The kinds a new relazione does not take on its own: the technician adds them («Allega»). */
export const SOLO_SU_SCELTA: ReadonlySet<string> = new Set(['FOTO', 'ALTRO']);

export interface WorkspaceData {
  state: RtBaseState;
  inputs: RtInputs;
  draftAt: string | null;
  /** files of the draft deleted since it was kept */
  dropped: number;
  revisione: { id: string; number: string; revision: number } | null;
  live: { summary: RtSummary; conferma: Conferma } | null;
  files: { id: string; title: string; kind: string; pages: number; size: number; createdAt: Date }[];
  rts: Awaited<ReturnType<typeof listProjectRts>>;
}

/** The revision asked (or the draft's): an RT of this installation that is the latest revision of its number. */
async function revisioneDi(user: SessionUser, projectId: string, id: string | undefined) {
  if (!id) return null;
  const r = await prisma.technicalReport.findFirst({ where: { id, companyId: user.companyId, projectId }, select: { id: true, number: true, revision: true, year: true, seq: true, inputs: true } });
  if (!r) return null;
  const last = await prisma.technicalReport.findFirst({ where: { companyId: user.companyId, year: r.year, seq: r.seq }, orderBy: { revision: 'desc' }, select: { id: true } });
  return last?.id === r.id ? r : null;
}

export async function workspaceOf(user: SessionUser, projectId: string, askRevision: string | undefined, editable: boolean): Promise<WorkspaceData> {
  const [state, rts, files, draft] = await Promise.all([
    rtBaseOf(user, projectId), listProjectRts(user, projectId),
    // (every scalar column, never the bytes: AttachmentBlob is a relation)
    prisma.attachment.findMany({ where: { projectId, companyId: user.companyId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 200 }),
    editable ? readRtDraft(user, projectId) : Promise.resolve(null),
  ]);
  // the draft of the revision asked, or of another (it is that one's revision that continues), or none
  const askedRev = await revisioneDi(user, projectId, askRevision ?? draft?.data.revisionOf);
  const draftFits = draft && (askRevision ? draft.data.revisionOf === askRevision : true);
  let inputs: RtInputs;
  if (draft && draftFits) inputs = draft.data.inputs;
  else if (askedRev) {
    const prev = rtInputsSchema.safeParse(askedRev.inputs), p: RtInputs = prev.success ? prev.data : {};
    const doc = p.doc ? { ...p.doc } : undefined;
    if (doc) delete doc.data;
    inputs = { ...p, ...(doc ? { doc } : {}), revisione: undefined };
    delete inputs.revisione;
  } else {
    const ver = await latestVerificato(user);
    const documenti = files.filter((f) => !SOLO_SU_SCELTA.has(f.kind));
    inputs = { firme: { redatto: { nome: user.name }, ...(ver ? { verificato: ver } : {}) }, ...(documenti.length ? { allegati: documenti.map((f) => ({ attachmentId: f.id })) } : {}) };
  }
  let live: WorkspaceData['live'] = null;
  if (state.result.ok) {
    const p = await previewOf(user, projectId, inputs);
    if (p.ok) { const summary = summaryOf(p.composed.input); live = { summary, conferma: confermaOf(summary) }; }
  }
  return {
    state, inputs, draftAt: draft && draftFits ? draft.at : null, dropped: draft && draftFits ? draft.dropped : 0,
    revisione: askedRev ? { id: askedRev.id, number: askedRev.number, revision: askedRev.revision } : null, live,
    files: files.map((f) => ({ id: f.id, title: f.title, kind: f.kind, pages: f.pages, size: f.size, createdAt: f.createdAt })), rts,
  };
}
