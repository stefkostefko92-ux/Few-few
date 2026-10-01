'use server';

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { rateLimit } from '@/lib/ratelimit';
import { calcLabelSchema, idSchema } from '@/lib/schemas';
import { shaftInputsSchema, shaftSourceSchema } from '@/lib/shaft-input';
import { shaftHash } from '@/lib/shaft-hash';
import { log } from '@/lib/log';
import { shaftSnapshot, verdictOf } from '@/shaft';

export type ShaftSaveResult = { ok: true; id: string } | { ok: false; error: string; fields?: string[] };

const VERDICT = { ok: 'OK', warn: 'WARN', fail: 'FAIL' } as const;

// As for calculations: the browser shows a preview; the server validates the inputs, lays the shaft out again with the
// same engine and stores the immutable record with its hash. The drawing never reaches the server, only the measure.
export async function saveShaftDesignAction(input: { projectId: unknown; inputs: unknown; source: unknown; label: unknown }): Promise<ShaftSaveResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: 'unauthorized' };
  if (user.mustChangePassword || !can(user.role, 'calc:create')) return { ok: false, error: 'forbidden' };
  if (!rateLimit(`shaft:${user.id}`, 60, 10 * 60 * 1000)) return { ok: false, error: 'rateLimited' };
  const projectId = idSchema.safeParse(input.projectId), label = calcLabelSchema.safeParse(input.label ?? '');
  const inputs = shaftInputsSchema.safeParse(input.inputs), source = input.source == null ? null : shaftSourceSchema.safeParse(input.source);
  if (!projectId.success || !label.success || (source && !source.success)) return { ok: false, error: 'invalidFields' };
  if (!inputs.success) return { ok: false, error: 'invalidFields', fields: inputs.error.issues.map((i) => String(i.path[0] ?? '')) };
  const project = await prisma.project.findFirst({ where: { id: projectId.data, companyId: user.companyId, archivedAt: null }, select: { id: true } });
  if (!project) return { ok: false, error: 'notFound' };

  const { snapshot, layout: L } = shaftSnapshot(inputs.data);
  const I = inputs.data;
  const design = await prisma.shaftDesign.create({
    data: {
      companyId: user.companyId, projectId: project.id, userId: user.id, label: label.data,
      engineVersion: snapshot.engine, profileId: snapshot.profile,
      source: source?.success ? (source.data as Prisma.InputJsonValue) : undefined,
      inputs: snapshot.inputs ?? {}, results: snapshot.results ?? {}, sha256: shaftHash(snapshot), verdict: VERDICT[verdictOf(L)],
      failCount: L.checks.filter((c) => c.status === 'fail').length, warnCount: L.checks.filter((c) => c.status === 'warn').length,
      summary: `${I.W} × ${I.D} mm · ${L.A} × ${L.B} mm · ${L.Q} kg`,
    },
    select: { id: true },
  });
  await prisma.project.update({ where: { id: project.id }, data: { updatedAt: new Date() } });
  await audit({ companyId: user.companyId, userId: user.id, action: 'SHAFT_DESIGN_SAVED', entity: 'ShaftDesign', entityId: design.id });
  log.info({ userId: user.id, shaftDesignId: design.id }, 'shaft design saved');
  return { ok: true, id: design.id };
}
