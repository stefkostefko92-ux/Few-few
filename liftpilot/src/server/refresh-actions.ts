'use server';

// «Aggiorna con il software attuale»: a saved record the running engines no longer reproduce, made again in one click
// from what was entered (save.ts), keeping its label: a lift design with its shaft design and calculation; a
// replacement's calculation with the machine room surveyed on it; a machine room (on its calculation, or on a new one
// when that is not reproduced either). The new record's page says whether the result changed (?da=<old id>). A record
// still reproduced is not copied; when what was entered no longer passes (the software asks for something else now),
// the form opens on it instead.
import { redirect } from 'next/navigation';
import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales';
import { getSessionUser, type SessionUser } from '@/lib/auth';
import { formValuesSchema } from '@/lib/calc-input';
import { prisma } from '@/lib/db';
import { collaudoSchema, liftInputsReadSchema, liftInputsSchema } from '@/lib/lift-input';
import { liftRecord } from '@/lib/lift-record';
import { rateLimit } from '@/lib/ratelimit';
import { can } from '@/lib/rbac';
import { surveySchema } from '@/lib/room/survey';
import { idSchema } from '@/lib/schemas';
import { shaftSourceSchema } from '@/lib/shaft-input';
import { DESIGN_SELECT } from './drawing-compose';
import { str } from './form';
import { calcRecord, readCalc } from './records';
import { reproduceRoomRecord } from './room-compose';
import { createCalculation, createLiftDesign, createRoomDesign } from './save';

const localeOf = (fd: FormData): string => { const l = str(fd, 'locale'); return isLocale(l) ? l : DEFAULT_LOCALE; };

/** The user who may save records, the record's id and the locale; else to the sign-in or the dashboard. */
async function refresher(fd: FormData): Promise<{ user: SessionUser; id: string; app: string }> {
  const locale = localeOf(fd), user = await getSessionUser();
  if (!user) redirect(`/${locale}/login`);
  const id = idSchema.safeParse(str(fd, 'id'));
  if (user.mustChangePassword || !can(user, 'calc:create') || !id.success || !rateLimit(`refresh:${user.id}`, 30, 10 * 60 * 1000)) redirect(`/${locale}/app`);
  return { user, id: id.data, app: `/${locale}/app` };
}

async function refreshLift(user: SessionUser, id: string, app: string): Promise<never> {
  const d = await prisma.liftDesign.findFirst({
    where: { id, companyId: user.companyId, project: { archivedAt: null } },
    select: { id: true, projectId: true, label: true, inputs: true, source: true, engineVersion: true, shaftDesign: { select: { sha256: true } }, calculation: { select: { sha256: true } } },
  });
  if (!d) redirect(app);
  if (liftRecord(d, d.shaftDesign.sha256, d.calculation.sha256)?.same) redirect(`${app}/lift-designs/${d.id}`);
  const read = liftInputsReadSchema.safeParse(d.inputs), inputs = read.success ? liftInputsSchema.safeParse(read.data) : null;
  const source = d.source ? shaftSourceSchema.safeParse(d.source) : null;
  const r = inputs?.success ? await createLiftDesign(user, d.projectId, inputs.data, d.label, source?.success ? source.data : null, d.id) : null;
  if (!r?.ok) redirect(`${app}/projects/${d.projectId}/progetto?from=${d.id}`);
  redirect(`${app}/lift-designs/${r.id}?da=${d.id}`);
}

interface CalcRow { id: string; projectId: string; label: string | null; inputs: unknown; collaudo: unknown }
interface RoomRow { id: string; label: string | null; inputs: unknown }

/** A replacement's calculation made again from its values and the standards chosen with it, and the machine room given
 *  on the new one (`room` null: a survey the new calculation no longer takes, which stays where it was). */
async function remakeCalc(user: SessionUser, c: CalcRow, room: RoomRow | null): Promise<{ calc: string; room: string | null } | null> {
  const values = formValuesSchema.safeParse(c.inputs), chosen = c.collaudo ? collaudoSchema.safeParse(c.collaudo) : null;
  const r = values.success ? await createCalculation(user, c.projectId, values.data, c.label, chosen?.success ? chosen.data : null, c.id) : null;
  if (!r?.ok) return null;
  const survey = room ? surveySchema.safeParse(room.inputs) : null;
  if (!room || !survey?.success) return { calc: r.id, room: null };
  const fresh = await prisma.calculation.findUniqueOrThrow({ where: { id: r.id }, select: { id: true, inputs: true, sha256: true, collaudo: true, projectId: true } });
  const made = await createRoomDesign(user, fresh, survey.data, room.label, room.id);
  return { calc: r.id, room: made.ok ? made.id : null };
}

export async function refreshLiftDesignAction(fd: FormData): Promise<void> {
  const { user, id, app } = await refresher(fd);
  await refreshLift(user, id, app);
}

/** A calculation: that of a lift design is the design's to make again; a replacement's, with its latest machine room. */
export async function refreshCalculationAction(fd: FormData): Promise<void> {
  const { user, id, app } = await refresher(fd);
  const c = await prisma.calculation.findFirst({
    where: { id, companyId: user.companyId, project: { archivedAt: null } },
    select: {
      id: true, projectId: true, label: true, inputs: true, sha256: true, collaudo: true, liftDesign: { select: { id: true } },
      shaftDesign: { select: DESIGN_SELECT },
      roomDesigns: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, label: true, inputs: true } },
    },
  });
  if (!c) redirect(app);
  if (c.liftDesign) await refreshLift(user, c.liftDesign.id, app);
  if (calcRecord({ ...c, liftDesign: null })?.ok) redirect(`${app}/calculations/${c.id}`);
  // a calculation of a shaft design saved before the installation design: the design is made again from the form
  if (c.shaftDesign) redirect(`${app}/projects/${c.projectId}/progetto`);
  const room = c.roomDesigns[0] ?? null, r = await remakeCalc(user, c, room);
  if (!r) redirect(`${app}/projects/${c.projectId}/calc?from=${c.id}`);
  redirect(`${app}/calculations/${r.calc}?da=${c.id}${room && !r.room ? `&rilievo=${room.id}` : ''}`);
}

/** A replacement's machine room: on its calculation while that is reproduced, else on the calculation made again. */
export async function refreshRoomDesignAction(fd: FormData): Promise<void> {
  const { user, id, app } = await refresher(fd);
  const r = await prisma.roomDesign.findFirst({
    where: { id, companyId: user.companyId, project: { archivedAt: null } },
    select: { id: true, label: true, inputs: true, sha256: true, calculation: { select: { id: true, projectId: true, label: true, inputs: true, sha256: true, collaudo: true } } },
  });
  if (!r) redirect(app);
  const c = r.calculation;
  if (reproduceRoomRecord(r, c).ok) redirect(`${app}/room-designs/${r.id}`);
  if (readCalc(c)?.same) {
    const survey = surveySchema.safeParse(r.inputs);
    const made = survey.success ? await createRoomDesign(user, c, survey.data, r.label, r.id) : null;
    if (!made?.ok) redirect(`${app}/calculations/${c.id}/locale?from=${r.id}`);
    redirect(`${app}/room-designs/${made.id}?da=${r.id}`);
  }
  const m = await remakeCalc(user, c, r);
  if (!m) redirect(`${app}/projects/${c.projectId}/calc?from=${c.id}`);
  redirect(m.room ? `${app}/room-designs/${m.room}?da=${r.id}` : `${app}/calculations/${m.calc}?da=${c.id}&rilievo=${r.id}`);
}
