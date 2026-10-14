'use server';

// The machine room surveyed on a «Calcolo argano» of an existing lift, saved: the server validates the survey, takes the
// calculation it builds on (the company's, a step-2 calculation with an existing lift's context, reproduced by the running
// engine), derives the room again with the same code and stores it immutable with its hash. Nothing computed in the
// browser is taken.
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { rateLimit } from '@/lib/ratelimit';
import { calcLabelSchema, idSchema } from '@/lib/schemas';
import { surveySaveSchema } from '@/lib/room/survey';
import { dropDraft } from './drafts';
import { rilevaLocale } from './calcolo-base';
import { createRoomDesign, type Created } from './save';

export type RoomSaveResult = Created;

export async function saveRoomDesignAction(input: { calculationId: unknown; survey: unknown; label: unknown }): Promise<RoomSaveResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: 'unauthorized' };
  // the survey of the machine room is drawn: whoever draws the project
  if (user.mustChangePassword || !can(user, 'progetto:edit')) return { ok: false, error: 'forbidden' };
  if (!rateLimit(`room:${user.id}`, 60, 10 * 60 * 1000)) return { ok: false, error: 'rateLimited' };
  const calcId = idSchema.safeParse(input.calculationId), label = calcLabelSchema.safeParse(input.label ?? ''), survey = surveySaveSchema.safeParse(input.survey);
  if (!calcId.success || !label.success) return { ok: false, error: 'invalidFields' };
  if (!survey.success) return { ok: false, error: 'invalidFields', fields: survey.error.issues.map((i) => i.path.join('.')) };
  const c = await prisma.calculation.findFirst({
    where: { id: calcId.data, companyId: user.companyId },
    select: {
      id: true, inputs: true, sha256: true, collaudo: true, projectId: true, shaftDesignId: true, liftDesign: { select: { id: true } }, project: { select: { archivedAt: true } },
    },
  });
  if (!c || c.project.archivedAt) return { ok: false, error: 'notFound' };
  // the machine room of an existing lift, on its «Calcolo argano»: a lift design draws its own from its shaft design, a
  // transformation is drawn whole, an archive calculation is made again from the form (round 45)
  if (!rilevaLocale(c)) return { ok: false, error: 'notLocale' };
  const r = await createRoomDesign(user, c, survey.data, label.data);
  // the survey's draft has become this record
  if (r.ok) await dropDraft(user.companyId, c.projectId, `room:${c.id}`);
  return r;
}
