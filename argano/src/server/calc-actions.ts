'use server';

import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { rateLimit } from '@/lib/ratelimit';
import { calcLabelSchema, idSchema, reviewSchema } from '@/lib/schemas';
import { formValuesSchema } from '@/lib/calc-input';
import { snapshotHash } from '@/lib/snapshot-hash';
import { log } from '@/lib/log';
import { snapshotOf } from '@/calc/snapshot';
import { compute } from '@/calc/compute';
import { readInputs } from '@/calc/inputs';
import { mirrorRopes } from '@/lib/present/analysis';
import { verdictStatus } from '@/lib/present/texts';
import { makeFmt } from '@/lib/present/tr';

export type SaveResult = { ok: true; id: string } | { ok: false; error: string; fields?: string[] };

const VERDICT = { ok: 'OK', warn: 'WARN', fail: 'FAIL' } as const;
const fmt = makeFmt('it-IT');

// The browser only shows a preview: the server validates the values, recomputes everything with the same engine
// and stores the immutable snapshot with its hash. The browser's result is never trusted.
export async function saveCalculationAction(input: { projectId: unknown; values: unknown; label: unknown }): Promise<SaveResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: 'unauthorized' };
  if (user.mustChangePassword || !can(user.role, 'calc:create')) return { ok: false, error: 'forbidden' };
  if (!rateLimit(`calc:${user.id}`, 60, 10 * 60 * 1000)) return { ok: false, error: 'rateLimited' };
  const projectId = idSchema.safeParse(input.projectId), label = calcLabelSchema.safeParse(input.label ?? ''), values = formValuesSchema.safeParse(input.values);
  if (!projectId.success || !label.success) return { ok: false, error: 'invalidFields' };
  if (!values.success) return { ok: false, error: 'invalidFields', fields: values.error.issues.map((i) => String(i.path[0] ?? '')) };
  const project = await prisma.project.findFirst({ where: { id: projectId.data, companyId: user.companyId, archivedAt: null }, select: { id: true } });
  if (!project) return { ok: false, error: 'notFound' };

  const V = mirrorRopes(values.data);
  const ctx = readInputs(V);
  if (ctx.bad.length) return { ok: false, error: 'invalidInputs', fields: [...new Set(ctx.bad)] };
  const snapshot = snapshotOf(V), res = compute(ctx.I, ctx.N), N = ctx.N;
  const summary = `D ${fmt(N.D, 0)} mm · ${N.n} × Ø${fmt(N.d, Number.isInteger(N.d) ? 0 : 1)} · 1:${fmt(N.i, Number.isInteger(N.i) ? 0 : 1)} · ${fmt(N.Pn, 1)} kW`;
  const calc = await prisma.calculation.create({
    data: {
      companyId: user.companyId, projectId: project.id, userId: user.id, label: label.data,
      engineVersion: snapshot.engine, profileId: snapshot.profile, inputs: snapshot.values ?? {}, results: snapshot.results,
      sha256: snapshotHash(snapshot), verdict: VERDICT[verdictStatus(res)],
      failCount: res.fails.length, warnCount: res.checks.filter((c) => c.status === 'warn').length, summary,
    },
    select: { id: true },
  });
  await prisma.project.update({ where: { id: project.id }, data: { updatedAt: new Date() } });
  await audit({ companyId: user.companyId, userId: user.id, action: 'CALCULATION_SAVED', entity: 'Calculation', entityId: calc.id });
  log.info({ userId: user.id, calculationId: calc.id }, 'calculation saved');
  return { ok: true, id: calc.id };
}

/** Internal review ("visto") by an engineer of the company; the calculation itself stays untouched. */
export async function reviewCalculationAction(input: { calculationId: unknown; note: unknown }): Promise<{ ok: boolean; error?: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: 'unauthorized' };
  if (user.mustChangePassword || !can(user.role, 'calc:review')) return { ok: false, error: 'forbidden' };
  const id = idSchema.safeParse(input.calculationId), note = reviewSchema.safeParse({ note: input.note ?? '' });
  if (!id.success || !note.success) return { ok: false, error: 'invalidFields' };
  const calc = await prisma.calculation.findFirst({ where: { id: id.data, companyId: user.companyId }, select: { id: true } });
  if (!calc) return { ok: false, error: 'notFound' };
  await prisma.calculationReview.create({ data: { calculationId: calc.id, userId: user.id, note: note.data.note } });
  await audit({ companyId: user.companyId, userId: user.id, action: 'CALCULATION_REVIEWED', entity: 'Calculation', entityId: calc.id });
  return { ok: true };
}
