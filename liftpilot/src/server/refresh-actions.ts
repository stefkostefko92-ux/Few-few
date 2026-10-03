'use server';

// «Aggiorna con il software attuale»: a saved record the running engines no longer reproduce, made again in one click
// from what was entered (save.ts), keeping its label: a lift design with its shaft design and calculation; a
// replacement's calculation with the machine room surveyed on it; a replacement's machine room (on its calculation, or
// on the one that calculation was made again into). The new record's page says whether the result changed (?da=<old
// id>). A record still reproduced is not copied, nor one already made again (the audit keeps `updates`: a second tab or
// the back button finds the new one); when what was entered no longer passes (the software asks for something else
// now), the form opens on it instead. A whole project is made again from its form: the calculations and rooms of its
// archive are not copied into it.
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

/** The record a saved one was already made again into (the audit of the save keeps `updates`), if any. */
async function madeFrom(user: SessionUser, action: 'LIFT_DESIGN_SAVED' | 'CALCULATION_SAVED' | 'ROOM_DESIGN_SAVED', id: string): Promise<string | null> {
  const a = await prisma.auditLog.findFirst({
    where: { companyId: user.companyId, action, meta: { path: ['updates'], equals: id } }, orderBy: { createdAt: 'desc' }, select: { entityId: true },
  });
  return a?.entityId ?? null;
}

const making = new Set<string>();

/** One update of a record at a time in the process: a second one at the same moment gets 'busy'. */
async function once<T>(id: string, make: () => Promise<T>): Promise<T | 'busy'> {
  if (making.has(id)) return 'busy';
  making.add(id);
  try {
    return await make();
  } finally {
    making.delete(id);
  }
}

async function refreshLift(user: SessionUser, id: string, app: string): Promise<never> {
  const d = await prisma.liftDesign.findFirst({
    where: { id, companyId: user.companyId, project: { archivedAt: null } },
    select: { id: true, projectId: true, label: true, inputs: true, source: true, engineVersion: true, shaftDesign: { select: { sha256: true } }, calculation: { select: { sha256: true } } },
  });
  if (!d) redirect(app);
  if (liftRecord(d, d.shaftDesign.sha256, d.calculation.sha256)?.same) redirect(`${app}/lift-designs/${d.id}`);
  const done = await madeFrom(user, 'LIFT_DESIGN_SAVED', d.id);
  if (done) redirect(`${app}/lift-designs/${done}?da=${d.id}`);
  const read = liftInputsReadSchema.safeParse(d.inputs), inputs = read.success ? liftInputsSchema.safeParse(read.data) : null;
  const source = d.source ? shaftSourceSchema.safeParse(d.source) : null;
  const r = inputs?.success ? await once(d.id, () => createLiftDesign(user, d.projectId, inputs.data, d.label, source?.success ? source.data : null, d.id)) : null;
  if (r === 'busy') redirect(`${app}/lift-designs/${d.id}`);
  if (!r?.ok) redirect(`${app}/projects/${d.projectId}/progetto?from=${d.id}`);
  redirect(`${app}/lift-designs/${r.id}?da=${d.id}`);
}

const CALC_ROW = { id: true, projectId: true, label: true, inputs: true, sha256: true, collaudo: true } as const;
interface CalcRow { id: string; projectId: string; label: string | null; inputs: unknown; sha256: string; collaudo: unknown }
interface RoomRow { id: string; label: string | null; inputs: unknown }

/** A replacement's calculation made again from its values and the standards chosen with it, and the machine room given
 *  on the new one (`room` null: a survey the new calculation no longer takes, which stays where it was). */
async function remakeCalc(user: SessionUser, c: CalcRow, room: RoomRow | null): Promise<{ calc: string; room: string | null } | null> {
  const values = formValuesSchema.safeParse(c.inputs), chosen = c.collaudo ? collaudoSchema.safeParse(c.collaudo) : null;
  const r = values.success ? await createCalculation(user, c.projectId, values.data, c.label, chosen?.success ? chosen.data : null, c.id) : null;
  if (!r?.ok) return null;
  if (!room) return { calc: r.id, room: null };
  const fresh = await prisma.calculation.findFirst({ where: { id: r.id, companyId: user.companyId }, select: CALC_ROW });
  return { calc: r.id, room: fresh ? await placeRoom(user, fresh, room) : null };
}

/** A survey saved on a calculation the running engine reproduces; null when it no longer passes there. */
async function placeRoom(user: SessionUser, c: CalcRow, room: RoomRow): Promise<string | null> {
  const survey = surveySchema.safeParse(room.inputs);
  const made = survey.success ? await createRoomDesign(user, c, survey.data, room.label, room.id) : null;
  return made?.ok ? made.id : null;
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
      ...CALC_ROW, liftDesign: { select: { id: true } }, shaftDesign: { select: DESIGN_SELECT }, project: { select: { kind: true } },
      roomDesigns: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, label: true, inputs: true } },
    },
  });
  if (!c) redirect(app);
  if (c.liftDesign) await refreshLift(user, c.liftDesign.id, app);
  if (calcRecord({ ...c, liftDesign: null })?.ok) redirect(`${app}/calculations/${c.id}`);
  // the archive of a whole project (a shaft design's calculation before the one form, a replacement's before it became
  // a whole project): the project is made again from its form
  if (c.shaftDesign || c.project.kind !== 'REPLACEMENT') redirect(`${app}/projects/${c.projectId}/progetto`);
  const done = await madeFrom(user, 'CALCULATION_SAVED', c.id);
  if (done) redirect(`${app}/calculations/${done}?da=${c.id}`);
  const r = await once(c.id, () => remakeCalc(user, c, c.roomDesigns[0] ?? null));
  if (r === 'busy') redirect(`${app}/calculations/${c.id}`);
  if (!r) redirect(`${app}/projects/${c.projectId}/calc?from=${c.id}`);
  redirect(`${app}/calculations/${r.calc}?da=${c.id}`);
}

/** A replacement's machine room: on its calculation while that is reproduced, else on the calculation that one was made
 *  again into, else on a new one. */
export async function refreshRoomDesignAction(fd: FormData): Promise<void> {
  const { user, id, app } = await refresher(fd);
  const r = await prisma.roomDesign.findFirst({
    where: { id, companyId: user.companyId, project: { archivedAt: null } },
    select: { id: true, label: true, inputs: true, sha256: true, project: { select: { kind: true } }, calculation: { select: CALC_ROW } },
  });
  if (!r) redirect(app);
  const c = r.calculation;
  if (reproduceRoomRecord(r, c).ok) redirect(`${app}/room-designs/${r.id}`);
  if (r.project.kind !== 'REPLACEMENT') redirect(`${app}/projects/${c.projectId}/progetto`);
  const done = await madeFrom(user, 'ROOM_DESIGN_SAVED', r.id);
  if (done) redirect(`${app}/room-designs/${done}?da=${r.id}`);
  const newer = readCalc(c)?.same ? null : await madeFrom(user, 'CALCULATION_SAVED', c.id);
  const fresh = newer ? await prisma.calculation.findFirst({ where: { id: newer, companyId: user.companyId }, select: CALC_ROW }) : null;
  const on = readCalc(c)?.same ? c : fresh && readCalc(fresh)?.same ? fresh : null;
  const m = await once(r.id, async () => (on ? { calc: on.id, room: await placeRoom(user, on, r) } : remakeCalc(user, c, r)));
  if (m === 'busy') redirect(`${app}/room-designs/${r.id}`);
  if (!m) redirect(`${app}/projects/${c.projectId}/calc?from=${c.id}`);
  // a survey the calculation no longer takes: its form, on that calculation, from this survey
  redirect(m.room ? `${app}/room-designs/${m.room}?da=${r.id}` : `${app}/calculations/${m.calc}/locale?from=${r.id}`);
}
