import 'server-only';
// The RT after the owner's model while it is prepared (round 52): the same composition as the issue (compose.ts) with no
// number — the document says «BOZZA — non emessa, non valida per la firma» on every page and appends no file — from the
// draft kept (FormDraft scope 'rt2'; ranges checked, nothing required yet). The route
// /api/projects/[id]/relazione-tecnica/anteprima reads it. Only an active installation of the company with an eligible,
// reproduced base.
import type { SessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { rt2DraftDataSchema } from '@/lib/draft-input';
import type { Rt2Inputs } from '@/lib/rt2/input';
import { readDraft } from '../drafts';
import { allegatiRt, filesOf } from '../rt/compose';
import { logoImage } from '../rt/record';
import { rt2BaseOf } from './base';
import { composeRt2, type Rt2Composed } from './compose';

export type Preview2 = { ok: true; composed: Rt2Composed; name: string } | { ok: false; error: 'notFound' | 'archived' | 'rtNotEligible' | 'rtBaseOutdated' };

export async function draftPreview2(user: SessionUser, projectId: string): Promise<Preview2> {
  const project = await prisma.project.findFirst({ where: { id: projectId, companyId: user.companyId }, select: { archivedAt: true, name: true, address: true, city: true,
    province: true, plantNumber: true, client: true } });
  if (!project) return { ok: false, error: 'notFound' };
  if (project.archivedAt) return { ok: false, error: 'archived' };
  const state = await rt2BaseOf(user, projectId);
  if (!state.result.ok) return { ok: false, error: state.result.reason === 'engineChanged' ? 'rtBaseOutdated' : 'rtNotEligible' };
  const d = await readDraft(user, projectId, 'rt2', rt2DraftDataSchema), raw: Rt2Inputs = d?.data.inputs ?? {};
  const named = (raw.allegati ?? []).map((a) => a.attachmentId), rows = await filesOf(prisma, user, projectId, named);
  const inputs: Rt2Inputs = { ...raw, allegati: (raw.allegati ?? []).filter((a) => rows.some((r) => r.id === a.attachmentId)) };
  const company = await prisma.company.findUnique({ where: { id: user.companyId }, select: { name: true, logo: { select: { mime: true, data: true, sha256: true } } } });
  const logo = logoImage(company?.logo);
  const composed = composeRt2({
    number: null, revision: 0, revisions: [], base: state.result.base, inputs,
    project: { name: project.name, address: project.address, city: project.city, province: project.province, plantNumber: project.plantNumber, client: project.client },
    company: { name: company?.name ?? user.companyName, logo, logoSha256: logo ? company?.logo?.sha256 ?? null : null }, allegati: allegatiRt(inputs.allegati, rows) ?? [],
  });
  return { ok: true, composed, name: project.name };
}
