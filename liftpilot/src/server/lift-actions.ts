'use server';

// The Progetto saved (round 45): the drawing's geometry on a «Calcolo argano» of the installation. The server validates
// the drawing (strict: no calculation, test, catalogue or switches of the car's mass and the machine from the browser),
// takes the base as the company's step-2 calculation of this active installation, reproduced by the running engine,
// composes the one form's inputs from the two (liftInputsOf: the shaft's rated load and speed the base's) and stores in
// one transaction the shaft design, the calculation made from it and the lift design that names its base, each
// immutable with its hash (save.ts, unchanged derivation). Nothing computed in the browser is taken.
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { rateLimit } from '@/lib/ratelimit';
import { calcLabelSchema, idSchema } from '@/lib/schemas';
import { liftInputsSchema, progettoInputsSchema } from '@/lib/lift-input';
import { liftInputsOf } from '@/lib/lift/progetto';
import { shaftSourceSchema } from '@/lib/shaft-input';
import { calcoloBase } from './calcolo-base';
import { dropDraft } from './drafts';
import { createLiftDesign, type Created } from './save';

export type LiftSaveResult = Created;

export async function saveLiftDesignAction(input: { projectId: unknown; baseCalculationId: unknown; progetto: unknown; source: unknown; label: unknown }): Promise<LiftSaveResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: 'unauthorized' };
  // the Progetto is the installation's drawing: whoever draws the project
  if (user.mustChangePassword || !can(user, 'progetto:edit')) return { ok: false, error: 'forbidden' };
  if (!rateLimit(`lift:${user.id}`, 60, 10 * 60 * 1000)) return { ok: false, error: 'rateLimited' };
  const projectId = idSchema.safeParse(input.projectId), label = calcLabelSchema.safeParse(input.label ?? '');
  const progetto = progettoInputsSchema.safeParse(input.progetto), source = input.source == null ? null : shaftSourceSchema.safeParse(input.source);
  if (!projectId.success || !label.success || (source && !source.success)) return { ok: false, error: 'invalidFields' };
  if (!progetto.success) return { ok: false, error: 'invalidFields', fields: progetto.error.issues.map((i) => i.path.join('.')) };
  const project = await prisma.project.findFirst({ where: { id: projectId.data, companyId: user.companyId, archivedAt: null }, select: { id: true } });
  if (!project) return { ok: false, error: 'notFound' };
  // the drawing is made on a «Calcolo argano»: none sent — the calculation first
  if (input.baseCalculationId == null || input.baseCalculationId === '') return { ok: false, error: 'noCalc' };
  const baseId = idSchema.safeParse(input.baseCalculationId);
  const base = baseId.success ? await calcoloBase(user, project.id, baseId.data) : null;
  if (!base) return { ok: false, error: 'notFound' };
  if (!base.same) return { ok: false, error: 'engineChanged' };
  // DM 236 added to the test in the calculation: its case is the drawing's to choose (never checked on 'none')
  if (base.collaudo.aggiuntive?.includes('dm236') && progetto.data.shaft.access === 'none') return { ok: false, error: 'invalidFields', fields: ['access'] };
  const inputs = liftInputsSchema.safeParse(liftInputsOf(progetto.data, base));
  if (!inputs.success) return { ok: false, error: 'invalidFields', fields: inputs.error.issues.map((i) => i.path.join('.')) };
  // the derived calculation takes the type declared with the base (none before round 45: none, the documents' words of
  // that time)
  const r = await createLiftDesign(user, project.id, inputs.data, label.data, source?.success ? source.data : null, undefined,
    { id: base.id, intervento: base.dichiarato ? base.tipo : null });
  // the drawing's draft has become this record
  if (r.ok) await dropDraft(user.companyId, project.id, 'lift');
  return r;
}
