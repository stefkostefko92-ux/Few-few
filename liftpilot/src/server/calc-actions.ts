'use server';

import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { rateLimit } from '@/lib/ratelimit';
import { REVIEW_MAX } from '@/lib/review';
import { calcLabelSchema, idSchema, reviewSchema } from '@/lib/schemas';
import { formValuesSchema } from '@/lib/calc-input';
import { collaudoSchema, tipoInterventoSchema } from '@/lib/lift-input';
import { interventoValido } from '@/lib/lift/intervento';
import { dropDraft } from './drafts';
import { createCalculation, type Created } from './save';

export type SaveResult = Created;

// The browser only shows a preview: the server validates the values, recomputes everything with the same engine
// and stores the immutable snapshot with its hash (save.ts). The browser's result is never trusted. The intervention
// declared and the standards of the acceptance test chosen with it are stored beside the snapshot (they are what the
// documents set out, not the physics); the type, the values and the test must agree (interventoValido: 'invalidIntervento'
// with the keys they disagree on).
export async function saveCalculationAction(input: { projectId: unknown; values: unknown; label: unknown; collaudo?: unknown; intervento?: unknown }): Promise<SaveResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: 'unauthorized' };
  if (user.mustChangePassword || !can(user, 'calc:create')) return { ok: false, error: 'forbidden' };
  if (!rateLimit(`calc:${user.id}`, 60, 10 * 60 * 1000)) return { ok: false, error: 'rateLimited' };
  const projectId = idSchema.safeParse(input.projectId), label = calcLabelSchema.safeParse(input.label ?? ''), values = formValuesSchema.safeParse(input.values);
  const collaudo = input.collaudo == null ? null : collaudoSchema.safeParse(input.collaudo);
  const tipo = input.intervento == null ? null : tipoInterventoSchema.safeParse(input.intervento);
  if (!projectId.success || !label.success || (collaudo && !collaudo.success) || (tipo && !tipo.success)) return { ok: false, error: 'invalidFields' };
  // «Calcolo argano» declares its type of intervention (round 45): none, nothing saved
  if (!tipo) return { ok: false, error: 'invalidIntervento', fields: ['intervento'] };
  if (!values.success) return { ok: false, error: 'invalidFields', fields: values.error.issues.map((i) => String(i.path[0] ?? '')) };
  // an empty roping reads as 1:1 in the calculation: a new calculation has it chosen
  if (String(values.data.r ?? '').trim() === '') return { ok: false, error: 'invalidFields', fields: ['r'] };
  const chosen = collaudo?.success ? collaudo.data : null;
  const disagree = tipo.success ? interventoValido(tipo.data, values.data, chosen) : [];
  if (!tipo.success || disagree.length) return { ok: false, error: 'invalidIntervento', fields: disagree };
  // every installation of the company, active, whatever it was created as (round 45): its «Calcolo argano»
  const project = await prisma.project.findFirst({ where: { id: projectId.data, companyId: user.companyId, archivedAt: null }, select: { id: true } });
  if (!project) return { ok: false, error: 'notFound' };
  const r = await createCalculation(user, project.id, values.data, label.data, chosen, tipo.data);
  // the calculator's draft has become this record
  if (r.ok) await dropDraft(user.companyId, project.id, 'calc');
  return r;
}

/** Internal review ("visto") by an engineer of the company; the calculation itself stays untouched. Not on an archived
 *  installation (read-only, as its calculations). */
export async function reviewCalculationAction(input: { calculationId: unknown; note: unknown }): Promise<{ ok: boolean; error?: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: 'unauthorized' };
  if (user.mustChangePassword || !can(user, 'calc:review')) return { ok: false, error: 'forbidden' };
  if (!rateLimit(`review:${user.id}`, 30, 10 * 60 * 1000)) return { ok: false, error: 'rateLimited' };
  const id = idSchema.safeParse(input.calculationId), note = reviewSchema.safeParse({ note: input.note ?? '' });
  if (!id.success || !note.success) return { ok: false, error: 'invalidFields' };
  const calc = await prisma.calculation.findFirst({
    where: { id: id.data, companyId: user.companyId, project: { archivedAt: null } },
    select: { id: true, _count: { select: { reviews: true } } },
  });
  if (!calc) return { ok: false, error: 'notFound' };
  if (calc._count.reviews >= REVIEW_MAX) return { ok: false, error: 'tooManyReviews' };
  await prisma.calculationReview.create({ data: { calculationId: calc.id, userId: user.id, note: note.data.note } });
  await audit({ companyId: user.companyId, userId: user.id, action: 'CALCULATION_REVIEWED', entity: 'Calculation', entityId: calc.id });
  return { ok: true };
}
