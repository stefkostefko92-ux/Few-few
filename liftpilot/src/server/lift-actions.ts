'use server';

// The installation saved from the one form: the server validates what was entered, derives everything again with
// the same code (shaft, calculator values, the machine proposed), and stores in one transaction the shaft design, the
// calculation made from it and the lift design that ties them, each immutable with its hash. Nothing computed in the
// browser is taken.
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { rateLimit } from '@/lib/ratelimit';
import { calcLabelSchema, idSchema } from '@/lib/schemas';
import { liftInputsSchema } from '@/lib/lift-input';
import { shaftSourceSchema } from '@/lib/shaft-input';
import { createLiftDesign, type Created } from './save';

export type LiftSaveResult = Created;

export async function saveLiftDesignAction(input: { projectId: unknown; inputs: unknown; source: unknown; label: unknown }): Promise<LiftSaveResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: 'unauthorized' };
  if (user.mustChangePassword || !can(user, 'calc:create')) return { ok: false, error: 'forbidden' };
  if (!rateLimit(`lift:${user.id}`, 60, 10 * 60 * 1000)) return { ok: false, error: 'rateLimited' };
  const projectId = idSchema.safeParse(input.projectId), label = calcLabelSchema.safeParse(input.label ?? '');
  const inputs = liftInputsSchema.safeParse(input.inputs), source = input.source == null ? null : shaftSourceSchema.safeParse(input.source);
  if (!projectId.success || !label.success || (source && !source.success)) return { ok: false, error: 'invalidFields' };
  if (!inputs.success) return { ok: false, error: 'invalidFields', fields: inputs.error.issues.map((i) => i.path.join('.')) };
  const project = await prisma.project.findFirst({ where: { id: projectId.data, companyId: user.companyId, archivedAt: null }, select: { id: true } });
  if (!project) return { ok: false, error: 'notFound' };
  return createLiftDesign(user, project.id, inputs.data, label.data, source?.success ? source.data : null);
}
