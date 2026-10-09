import 'server-only';
// The saves of the records, one way for the forms and for «Aggiorna con il software attuale»: from what was entered
// (already validated), everything is derived again on the server with the running engines and stored immutable with
// its hash. Nothing computed in the browser is taken.
import type { Prisma } from '@prisma/client';
import type { FormValues } from '@/calc/types';
import { canon, snapshotOf } from '@/calc/snapshot';
import { compute } from '@/calc/compute';
import { readInputs } from '@/calc/inputs';
import type { SessionUser } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { log } from '@/lib/log';
import { LIFT_ENGINE_VERSION, collaudoOf, collaudoVerdict, deriveLift, type Collaudo, type LiftInputs } from '@/lib/lift';
import { liftHash } from '@/lib/lift-hash';
import { mirrorRopes } from '@/lib/present/analysis';
import { verdictStatus } from '@/lib/present/texts';
import { makeFmt } from '@/lib/present/tr';
import { roomHash } from '@/lib/room-hash';
import { deriveRoom } from '@/lib/room/derive';
import { roomSnapshot, roomVerdict } from '@/lib/room/snapshot';
import { encodeRoomSummary, roomSummaryOf } from '@/lib/room/summary';
import type { Survey } from '@/lib/room/survey';
import { shaftHash } from '@/lib/shaft-hash';
import type { ShaftSource } from '@/lib/shaft-input';
import { snapshotHash } from '@/lib/snapshot-hash';
import { mergeChecks, shaftSnapshot, verdictOf } from '@/shaft';
import { readCalc, storedCollaudo } from './records';

export type Created = { ok: true; id: string } | { ok: false; error: string; fields?: string[] };

const VERDICT = { ok: 'OK', warn: 'WARN', fail: 'FAIL' } as const;
const fmt = makeFmt('it-IT');

/** «D 520 mm · 4 × Ø10 · 1:63 · 4 kW» */
const machineSummary = (N: ReturnType<typeof readInputs>['N']): string =>
  `D ${fmt(N.D, 0)} mm · ${N.n} × Ø${fmt(N.d, Number.isInteger(N.d) ? 0 : 1)} · 1:${fmt(N.i, Number.isInteger(N.i) ? 0 : 1)} · ${fmt(N.Pn, 1)} kW`;

const touch = (projectId: string) => prisma.project.update({ where: { id: projectId }, data: { updatedAt: new Date() } });

/** A calculation of a replacement from its values, with the standards of its acceptance test chosen with it (stored
 *  beside the snapshot, normalised as the documents read them). `from`: the record it updates (audit). */
export async function createCalculation(user: SessionUser, projectId: string, values: FormValues, label: string | null, chosen: Collaudo | null, from?: string): Promise<Created> {
  const V = mirrorRopes(values), ctx = readInputs(V);
  if (ctx.bad.length) return { ok: false, error: 'invalidInputs', fields: [...new Set(ctx.bad)] };
  const snapshot = snapshotOf(V), res = compute(ctx.I, ctx.N);
  const calc = await prisma.calculation.create({
    data: {
      companyId: user.companyId, projectId, userId: user.id, label, engineVersion: snapshot.engine, profileId: snapshot.profile, inputs: snapshot.values ?? {},
      results: snapshot.results, sha256: snapshotHash(snapshot), verdict: VERDICT[verdictStatus(res)], failCount: res.fails.length,
      warnCount: res.checks.filter((c) => c.status === 'warn').length, summary: machineSummary(ctx.N),
      ...(chosen ? { collaudo: { ...collaudoOf(V, chosen) } } : {}),
    },
    select: { id: true },
  });
  await touch(projectId);
  await audit({ companyId: user.companyId, userId: user.id, action: 'CALCULATION_SAVED', entity: 'Calculation', entityId: calc.id, ...(from ? { meta: { updates: from } } : {}) });
  log.info({ userId: user.id, calculationId: calc.id }, 'calculation saved');
  return { ok: true, id: calc.id };
}

/** An installation from the one form: in one transaction the shaft design, the calculation made from it and the lift
 *  design that ties them. Refused while the derivation has issues (a distance to be measured, a machine that does not
 *  fit the plan). */
export async function createLiftDesign(user: SessionUser, projectId: string, inputs: LiftInputs, label: string | null, source: ShaftSource | null, from?: string): Promise<Created> {
  const d = deriveLift(inputs);
  if (d.analysis.ctx.bad.length || d.issues.length) return { ok: false, error: 'invalidInputs', fields: [...new Set([...d.analysis.ctx.bad, ...d.issues])] };
  const { snapshot: shaftSnap, layout: L } = shaftSnapshot(d.shaft), calcSnap = snapshotOf(d.values);
  const shaftSha = shaftHash(shaftSnap), calcSha = snapshotHash(calcSnap), res = d.analysis.res, S = d.shaft;
  // the lift's verdict is its acceptance test's: the checks of the machine, of the shaft and of the beams under the
  // machine that the intervention touches (all of them for a new lift; collaudo.ts)
  const test = collaudoVerdict(d.collaudo, [...res.checks, ...mergeChecks(L.checks, d.supportChecks)]);
  const machine = machineSummary(d.analysis.ctx.N);
  const hash = liftHash({ engine: LIFT_ENGINE_VERSION, inputs: canon(inputs), shaft: shaftSha, calc: calcSha });
  const source$ = source ? (source as Prisma.InputJsonValue) : undefined;
  const created = await prisma.$transaction(async (tx) => {
    const shaft = await tx.shaftDesign.create({
      data: {
        companyId: user.companyId, projectId, userId: user.id, label, engineVersion: shaftSnap.engine, profileId: shaftSnap.profile, source: source$,
        inputs: shaftSnap.inputs ?? {}, results: shaftSnap.results ?? {}, sha256: shaftSha, verdict: VERDICT[verdictOf(L)],
        failCount: L.checks.filter((c) => c.status === 'fail').length, warnCount: L.checks.filter((c) => c.status === 'warn').length,
        summary: `${S.W} × ${S.D} mm · ${L.A} × ${L.B} mm · ${L.Q} kg`,
      },
      select: { id: true },
    });
    const calc = await tx.calculation.create({
      data: {
        companyId: user.companyId, projectId, userId: user.id, label, engineVersion: calcSnap.engine, profileId: calcSnap.profile, inputs: calcSnap.values ?? {},
        results: calcSnap.results, sha256: calcSha, verdict: VERDICT[verdictStatus(res)], failCount: res.fails.length,
        warnCount: res.checks.filter((c) => c.status === 'warn').length, summary: machine, shaftDesignId: shaft.id, collaudo: { ...d.collaudo },
      },
      select: { id: true },
    });
    return tx.liftDesign.create({
      data: {
        // the form as entered (validated), stored as is
        companyId: user.companyId, projectId, userId: user.id, label, inputs: inputs as unknown as Prisma.InputJsonValue, source: source$,
        shaftDesignId: shaft.id, calculationId: calc.id, engineVersion: LIFT_ENGINE_VERSION, sha256: hash,
        verdict: VERDICT[test.verdict], failCount: test.fails, warnCount: test.warns,
        summary: `${S.W} × ${S.D} mm · ${fmt(L.Q, 0)} kg · ${fmt(S.vertical.v, 2)} m/s · ${machine}`,
      },
      select: { id: true },
    });
  });
  await touch(projectId);
  await audit({ companyId: user.companyId, userId: user.id, action: 'LIFT_DESIGN_SAVED', entity: 'LiftDesign', entityId: created.id, ...(from ? { meta: { updates: from } } : {}) });
  log.info({ userId: user.id, liftDesignId: created.id }, 'lift design saved');
  return { ok: true, id: created.id };
}

/** The machine room of a replacement on its calculation (the company's, of a replacement, reproduced by the running
 *  engine), from its survey. */
export async function createRoomDesign(
  user: SessionUser, c: { id: string; inputs: unknown; sha256: string; collaudo: unknown; projectId: string }, survey: Survey, label: string | null, from?: string,
): Promise<Created> {
  const calc = readCalc(c);
  if (!calc?.same) return { ok: false, error: 'engineChanged' };
  const d = deriveRoom(calc.values, survey);
  if (d.issues.length) return { ok: false, error: 'roomIssues', fields: d.issues };
  const C = storedCollaudo(calc.values, c.collaudo);
  const snap = roomSnapshot(survey, c.sha256, d), sha256 = roomHash(snap), v = roomVerdict(d.checks, C);
  // the line that names it in the lists: data, written in the reader's language where it is shown (room/summary.ts)
  const summary = encodeRoomSummary(roomSummaryOf(d, survey.room));
  const created = await prisma.roomDesign.create({
    data: {
      companyId: user.companyId, projectId: c.projectId, calculationId: c.id, userId: user.id, label, inputs: snap.inputs ?? {}, results: snap.results ?? {},
      engineVersion: snap.engine, sha256, verdict: v.verdict, failCount: v.failCount, warnCount: v.warnCount, summary,
    },
    select: { id: true },
  });
  await audit({ companyId: user.companyId, userId: user.id, action: 'ROOM_DESIGN_SAVED', entity: 'RoomDesign', entityId: created.id, meta: { calculationId: c.id, sha256, ...(from ? { updates: from } : {}) } });
  log.info({ userId: user.id, roomDesignId: created.id }, 'room design saved');
  return { ok: true, id: created.id };
}
