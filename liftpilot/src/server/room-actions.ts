'use server';

// The machine room of a machine replacement saved from its survey: the server validates the survey, takes the
// calculation it builds on (the company's, of a replacement, reproduced by the running engine), derives the room again
// with the same code and stores it immutable with its hash. Nothing computed in the browser is taken.
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { rateLimit } from '@/lib/ratelimit';
import { calcLabelSchema, idSchema } from '@/lib/schemas';
import { formValuesSchema } from '@/lib/calc-input';
import { collaudoSchema } from '@/lib/lift-input';
import { collaudoOf } from '@/lib/lift/collaudo';
import { log } from '@/lib/log';
import { makeFmt } from '@/lib/present/tr';
import { roomHash } from '@/lib/room-hash';
import { deriveRoom } from '@/lib/room/derive';
import { roomSnapshot, roomVerdict } from '@/lib/room/snapshot';
import { surveySchema } from '@/lib/room/survey';
import { verifyStored } from '@/lib/snapshot-hash';
import { supportName } from '@/lib/tavole/survey-data';

export type RoomSaveResult = { ok: true; id: string } | { ok: false; error: string; fields?: string[] };

const fmt = makeFmt('it-IT');

export async function saveRoomDesignAction(input: { calculationId: unknown; survey: unknown; label: unknown }): Promise<RoomSaveResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: 'unauthorized' };
  if (user.mustChangePassword || !can(user, 'calc:create')) return { ok: false, error: 'forbidden' };
  if (!rateLimit(`room:${user.id}`, 60, 10 * 60 * 1000)) return { ok: false, error: 'rateLimited' };
  const calcId = idSchema.safeParse(input.calculationId), label = calcLabelSchema.safeParse(input.label ?? ''), survey = surveySchema.safeParse(input.survey);
  if (!calcId.success || !label.success) return { ok: false, error: 'invalidFields' };
  if (!survey.success) return { ok: false, error: 'invalidFields', fields: survey.error.issues.map((i) => i.path.join('.')) };
  const c = await prisma.calculation.findFirst({
    where: { id: calcId.data, companyId: user.companyId },
    select: { id: true, inputs: true, sha256: true, collaudo: true, liftDesign: { select: { id: true } }, project: { select: { id: true, kind: true, archivedAt: true } } },
  });
  if (!c || c.project.archivedAt) return { ok: false, error: 'notFound' };
  // a whole project draws its machine room from its shaft design: this is the replacement's
  if (c.project.kind !== 'REPLACEMENT' || c.liftDesign) return { ok: false, error: 'notReplacement' };
  const values = formValuesSchema.safeParse(c.inputs);
  if (!values.success || !verifyStored(values.data, c.sha256).same) return { ok: false, error: 'engineChanged' };
  const d = deriveRoom(values.data, survey.data);
  if (d.issues.length) return { ok: false, error: 'roomIssues', fields: d.issues };
  const chosen = c.collaudo ? collaudoSchema.safeParse(c.collaudo) : null, C = collaudoOf(values.data, chosen?.success ? chosen.data : undefined);
  const snap = roomSnapshot(survey.data, c.sha256, d), sha256 = roomHash(snap), v = roomVerdict(d.checks, C), R = survey.data.room;
  const machine = d.made ? `${d.made.brand} ${d.made.model}` : 'argano';
  const summary = `Locale ${fmt(R.W, 0)} × ${fmt(R.D, 0)} · ${machine} su ${supportName(d).toLowerCase()} · calate ${fmt(Math.round(d.calata.calc), 0)} mm`;
  const created = await prisma.roomDesign.create({
    data: {
      companyId: user.companyId, projectId: c.project.id, calculationId: c.id, userId: user.id, label: label.data, inputs: snap.inputs ?? {}, results: snap.results ?? {},
      engineVersion: snap.engine, sha256, verdict: v.verdict, failCount: v.failCount, warnCount: v.warnCount, summary,
    },
    select: { id: true },
  });
  await audit({ companyId: user.companyId, userId: user.id, action: 'ROOM_DESIGN_SAVED', entity: 'RoomDesign', entityId: created.id, meta: { calculationId: c.id, sha256 } });
  log.info({ userId: user.id, roomDesignId: created.id }, 'room design saved');
  return { ok: true, id: created.id };
}
