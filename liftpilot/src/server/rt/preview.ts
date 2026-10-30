import 'server-only';
// The relazione tecnica di modifica while it is prepared (RT plan §7, «Preview»): the same composition as the issue
// (compose.ts) with no number — the document says «BOZZA — non emessa, non valida per la firma» on every page and
// appends no file — from the inputs as typed (the draft's schema: ranges checked, nothing required yet). The workspace's
// live summary (summary.ts) and the draft's PDF (the route /api/projects/[id]/relazione-tecnica/anteprima, from the
// draft kept) read it. Only an active installation of the company with an eligible, reproduced base.
import type { SessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { plantData } from '@/lib/plant';
import { anagraficaData } from '@/lib/rt/anagrafica';
import { rtDraftSchema, type RtInputs } from '@/lib/rt/input';
import { rtBaseOf, type RtBaseState } from './base';
import { allegatiRt, composeRt, filesOf, setsCitati, type RtComposed } from './compose';
import { readRtDraft } from './queries';
import { logoImage } from './record';
import { confermaOf, summaryOf, type Conferma, type RtSummary } from './summary';

export type PreviewError = 'notFound' | 'archived' | 'invalidFields' | 'rtNotEligible' | 'rtBaseOutdated';
export type Preview = { ok: true; composed: RtComposed; state: RtBaseState } | { ok: false; error: PreviewError; state?: RtBaseState };

/** The draft of the RT composed on the installation's base now; `inputs` as the draft's schema reads them. */
export async function previewOf(user: SessionUser, projectId: string, rawInputs: unknown): Promise<Preview> {
  const project = await prisma.project.findFirst({ where: { id: projectId, companyId: user.companyId }, select: { archivedAt: true, name: true, address: true, city: true,
    province: true, plantNumber: true, client: true, plant: true, anagrafica: true } });
  if (!project) return { ok: false, error: 'notFound' };
  if (project.archivedAt) return { ok: false, error: 'archived' };
  const parsed = rtDraftSchema.safeParse(rawInputs ?? {});
  if (!parsed.success) return { ok: false, error: 'invalidFields' };
  const state = await rtBaseOf(user, projectId);
  if (!state.result.ok) return { ok: false, error: state.result.reason === 'engineChanged' ? 'rtBaseOutdated' : 'rtNotEligible', state };
  const base = state.result.base;
  // the files still there, in the order chosen (one deleted meanwhile is left out of the draft)
  const named = (parsed.data.allegati ?? []).map((a) => a.attachmentId), rows = await filesOf(prisma, user, projectId, named);
  const inputs: RtInputs = { ...parsed.data, allegati: (parsed.data.allegati ?? []).filter((a) => rows.some((r) => r.id === a.attachmentId)) };
  const company = await prisma.company.findUnique({ where: { id: user.companyId }, select: { name: true, logo: { select: { mime: true, data: true, sha256: true } } } });
  const logo = logoImage(company?.logo);
  const composed = composeRt({
    number: null, revision: 0, revisions: [], base, inputs, anagrafica: anagraficaData(project.anagrafica), plant: plantData(project.plant),
    project: { name: project.name, address: project.address, city: project.city, province: project.province, plantNumber: project.plantNumber, client: project.client },
    company: { name: company?.name ?? user.companyName, logo, logoSha256: logo ? company?.logo?.sha256 ?? null : null },
    allegati: allegatiRt(inputs.allegati, rows) ?? [], sets: await setsCitati(prisma, user.companyId, base, new Date()),
  });
  return { ok: true, composed, state };
}

/** The workspace's live summary: what the document will say, and what the issue will ask to confirm. */
export async function summaryPreview(user: SessionUser, projectId: string, rawInputs: unknown): Promise<{ ok: true; summary: RtSummary; conferma: Conferma } | { ok: false; error: PreviewError }> {
  const p = await previewOf(user, projectId, rawInputs);
  if (!p.ok) return { ok: false, error: p.error };
  const summary = summaryOf(p.composed.input);
  return { ok: true, summary, conferma: confermaOf(summary) };
}

/** The draft kept for the installation (its inputs), composed: the preview's PDF. */
export async function draftPreview(user: SessionUser, projectId: string): Promise<Preview> {
  const d = await readRtDraft(user, projectId);
  return previewOf(user, projectId, d?.data.inputs ?? {});
}
