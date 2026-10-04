'use server';

// The machine room of a machine replacement saved from its survey: the server validates the survey, takes the
// calculation it builds on (the company's, of a replacement, reproduced by the running engine), derives the room again
// with the same code and stores it immutable with its hash. Nothing computed in the browser is taken.
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { rateLimit } from '@/lib/ratelimit';
import { calcLabelSchema, idSchema } from '@/lib/schemas';
import { surveySchema } from '@/lib/room/survey';
import { createRoomDesign, type Created } from './save';

export type RoomSaveResult = Created;

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
    select: { id: true, inputs: true, sha256: true, collaudo: true, projectId: true, liftDesign: { select: { id: true } }, project: { select: { kind: true, archivedAt: true } } },
  });
  if (!c || c.project.archivedAt) return { ok: false, error: 'notFound' };
  // a whole project draws its machine room from its shaft design: this is the replacement's
  if (c.project.kind !== 'REPLACEMENT' || c.liftDesign) return { ok: false, error: 'notReplacement' };
  return createRoomDesign(user, c, survey.data, label.data);
}
