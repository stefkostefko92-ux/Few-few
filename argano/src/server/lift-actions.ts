'use server';

// The installation saved from the one form: the server validates what was entered, derives everything again with
// the same code (shaft, calculator values, the machine proposed), and stores in one transaction the shaft design, the
// calculation made from it and the lift design that ties them, each immutable with its hash. Nothing computed in the
// browser is taken.
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { rateLimit } from '@/lib/ratelimit';
import { calcLabelSchema, idSchema } from '@/lib/schemas';
import { liftInputsSchema } from '@/lib/lift-input';
import { shaftSourceSchema } from '@/lib/shaft-input';
import { shaftHash } from '@/lib/shaft-hash';
import { snapshotHash } from '@/lib/snapshot-hash';
import { liftHash } from '@/lib/lift-hash';
import { log } from '@/lib/log';
import { LIFT_ENGINE_VERSION, deriveLift } from '@/lib/lift';
import { verdictStatus } from '@/lib/present/texts';
import { makeFmt } from '@/lib/present/tr';
import { canon, snapshotOf } from '@/calc/snapshot';
import { shaftSnapshot, verdictOf } from '@/shaft';

export type LiftSaveResult = { ok: true; id: string } | { ok: false; error: string; fields?: string[] };

const VERDICT = { ok: 'OK', warn: 'WARN', fail: 'FAIL' } as const;
const fmt = makeFmt('it-IT');
const worse = (a: 'ok' | 'warn' | 'fail', b: 'ok' | 'warn' | 'fail'): 'ok' | 'warn' | 'fail' => (a === 'fail' || b === 'fail' ? 'fail' : a === 'warn' || b === 'warn' ? 'warn' : 'ok');

export async function saveLiftDesignAction(input: { projectId: unknown; inputs: unknown; source: unknown; label: unknown }): Promise<LiftSaveResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: 'unauthorized' };
  if (user.mustChangePassword || !can(user.role, 'calc:create')) return { ok: false, error: 'forbidden' };
  if (!rateLimit(`lift:${user.id}`, 60, 10 * 60 * 1000)) return { ok: false, error: 'rateLimited' };
  const projectId = idSchema.safeParse(input.projectId), label = calcLabelSchema.safeParse(input.label ?? '');
  const inputs = liftInputsSchema.safeParse(input.inputs), source = input.source == null ? null : shaftSourceSchema.safeParse(input.source);
  if (!projectId.success || !label.success || (source && !source.success)) return { ok: false, error: 'invalidFields' };
  if (!inputs.success) return { ok: false, error: 'invalidFields', fields: inputs.error.issues.map((i) => i.path.join('.')) };
  const project = await prisma.project.findFirst({ where: { id: projectId.data, companyId: user.companyId, archivedAt: null }, select: { id: true } });
  if (!project) return { ok: false, error: 'notFound' };

  const d = deriveLift(inputs.data);
  if (d.analysis.ctx.bad.length) return { ok: false, error: 'invalidInputs', fields: [...new Set(d.analysis.ctx.bad)] };
  const { snapshot: shaftSnap, layout: L } = shaftSnapshot(d.shaft), calcSnap = snapshotOf(d.values);
  const shaftSha = shaftHash(shaftSnap), calcSha = snapshotHash(calcSnap), res = d.analysis.res, N = d.analysis.ctx.N;
  const S = d.shaft, shaftWarns = L.checks.filter((c) => c.status === 'warn').length, shaftFails = L.checks.filter((c) => c.status === 'fail').length;
  const calcWarns = res.checks.filter((c) => c.status === 'warn').length;
  const machine = `D ${fmt(N.D, 0)} mm · ${N.n} × Ø${fmt(N.d, Number.isInteger(N.d) ? 0 : 1)} · 1:${fmt(N.i, Number.isInteger(N.i) ? 0 : 1)} · ${fmt(N.Pn, 1)} kW`;
  const hash = liftHash({ engine: LIFT_ENGINE_VERSION, inputs: canon(inputs.data), shaft: shaftSha, calc: calcSha });
  const source$ = source?.success ? (source.data as Prisma.InputJsonValue) : undefined;
  const created = await prisma.$transaction(async (tx) => {
    const shaft = await tx.shaftDesign.create({
      data: {
        companyId: user.companyId, projectId: project.id, userId: user.id, label: label.data, engineVersion: shaftSnap.engine, profileId: shaftSnap.profile,
        source: source$, inputs: shaftSnap.inputs ?? {}, results: shaftSnap.results ?? {}, sha256: shaftSha, verdict: VERDICT[verdictOf(L)],
        failCount: shaftFails, warnCount: shaftWarns, summary: `${S.W} × ${S.D} mm · ${L.A} × ${L.B} mm · ${L.Q} kg`,
      },
      select: { id: true },
    });
    const calc = await tx.calculation.create({
      data: {
        companyId: user.companyId, projectId: project.id, userId: user.id, label: label.data, engineVersion: calcSnap.engine, profileId: calcSnap.profile,
        inputs: calcSnap.values ?? {}, results: calcSnap.results, sha256: calcSha, verdict: VERDICT[verdictStatus(res)], failCount: res.fails.length,
        warnCount: calcWarns, summary: machine, shaftDesignId: shaft.id,
      },
      select: { id: true },
    });
    return tx.liftDesign.create({
      data: {
        companyId: user.companyId, projectId: project.id, userId: user.id, label: label.data, inputs: inputs.data as Prisma.InputJsonValue, source: source$,
        shaftDesignId: shaft.id, calculationId: calc.id, engineVersion: LIFT_ENGINE_VERSION, sha256: hash,
        verdict: VERDICT[worse(verdictStatus(res), verdictOf(L))], failCount: res.fails.length + shaftFails, warnCount: calcWarns + shaftWarns,
        summary: `${S.W} × ${S.D} mm · ${fmt(L.Q, 0)} kg · ${fmt(S.vertical.v, 2)} m/s · ${machine}`,
      },
      select: { id: true },
    });
  });
  await prisma.project.update({ where: { id: project.id }, data: { updatedAt: new Date() } });
  await audit({ companyId: user.companyId, userId: user.id, action: 'LIFT_DESIGN_SAVED', entity: 'LiftDesign', entityId: created.id });
  log.info({ userId: user.id, liftDesignId: created.id }, 'lift design saved');
  return { ok: true, id: created.id };
}
