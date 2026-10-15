'use server';

// «Aggiorna con il software attuale»: a saved record the running engines no longer reproduce, made again in one click
// from what was entered (save.ts), keeping its label: a lift design with its shaft design and calculation (drawn on a
// «Calcolo argano» no longer reproduced: that calculation first, then the drawing on the new one); a «Calcolo argano»
// (step 2, of any installation) with the machine room surveyed on it; a machine room (on its calculation, or on the one
// that calculation was made again into). The new record's page says whether the result changed (?da=<old id>). A record
// still reproduced is not copied, nor one already made again (the audit keeps `updates`: a second tab or the back
// button finds the new one); when what was entered no longer passes (the software asks for something else now), the
// form opens on it instead, marked (src/lib/refresh-form.ts) so that it says why at its top. The archive of a whole
// project (a calculation made from a shaft design before the one form) is made again from the Progetto. Whoever makes
// the calculations makes a «Calcolo argano» again; a lift design or a machine room — records of the Progetto — only
// whoever also draws the project (rbac.ts remakes): the Tecnico's new calculation leaves the machine room where it was.
import { redirect } from 'next/navigation';
import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales';
import { getSessionUser, type SessionUser } from '@/lib/auth';
import { formValuesSchema } from '@/lib/calc-input';
import { prisma } from '@/lib/db';
import { collaudoReadSchema, collaudoSchema, liftInputsReadSchema, liftInputsSchema } from '@/lib/lift-input';
import { liftRecord } from '@/lib/lift-record';
import { rateLimit } from '@/lib/ratelimit';
import { REFRESH_QUERY } from '@/lib/refresh-form';
import { can, remakes } from '@/lib/rbac';
import { surveySchema } from '@/lib/room/survey';
import { liftInputsOf, progettoOf } from '@/lib/lift/progetto';
import { idSchema } from '@/lib/schemas';
import { shaftSourceSchema } from '@/lib/shaft-input';
import { DESIGN_SELECT } from './drawing-compose';
import { str } from './form';
import { calcRecord, readCalc, storedCollaudo } from './records';
import { reproduceRoomRecord } from './room-compose';
import { madeFrom, once } from './remake';
import { createCalculation, createLiftDesign, createRoomDesign } from './save';
import type { TipoIntervento } from '@/lib/lift/intervento';
import type { Collaudo } from '@/lib/lift/collaudo';
import type { FormValues } from '@/calc/types';

const localeOf = (fd: FormData): string => { const l = str(fd, 'locale'); return isLocale(l) ? l : DEFAULT_LOCALE; };

/** Where a record goes when it must be made again from a form: the form, or back to the record for whoever does not
 *  fill that form (read-only mode, or the right not given: the form would not save). The calculator is whoever makes
 *  the calculations'; the one form (/progetto) and the machine room's survey (/locale), whoever draws the project's. */
const formOr = (user: SessionUser, right: 'calc:create' | 'progetto:edit', form: string, record: string): string => (can(user, right) ? form : record);

/** The user who may make records again (in read-only mode too: rbac.ts), the record's id and the locale; else to the
 *  sign-in or the dashboard. */
async function refresher(fd: FormData): Promise<{ user: SessionUser; id: string; app: string }> {
  const locale = localeOf(fd), user = await getSessionUser();
  if (!user) redirect(`/${locale}/login`);
  const id = idSchema.safeParse(str(fd, 'id'));
  if (user.mustChangePassword || !can(user, 'records:refresh') || !id.success || !rateLimit(`refresh:${user.id}`, 30, 10 * 60 * 1000)) redirect(`/${locale}/app`);
  return { user, id: id.data, app: `/${locale}/app` };
}

async function refreshLift(user: SessionUser, id: string, app: string): Promise<never> {
  const d = await prisma.liftDesign.findFirst({
    where: { id, companyId: user.companyId, project: { archivedAt: null } },
    select: {
      id: true, projectId: true, label: true, inputs: true, source: true, engineVersion: true, shaftDesign: { select: { sha256: true } }, calculation: { select: { sha256: true } },
      baseCalculation: { select: CALC_ROW },
    },
  });
  if (!d) redirect(app);
  if (liftRecord(d, d.shaftDesign.sha256, d.calculation.sha256)?.same) redirect(`${app}/lift-designs/${d.id}`);
  const done = await madeFrom(user, 'LIFT_DESIGN_SAVED', d.id);
  if (done) redirect(`${app}/lift-designs/${done}?da=${d.id}`);
  // a new lift design is the Progetto's: not for whoever only makes the calculations
  if (!remakes(user, 'lift')) redirect(`${app}/lift-designs/${d.id}`);
  const read = liftInputsReadSchema.safeParse(d.inputs), stored = read.success ? liftInputsSchema.safeParse(read.data) : null;
  const source = d.source ? shaftSourceSchema.safeParse(d.source) : null, src = source?.success ? source.data : null, b = d.baseCalculation;
  // drawn on a «Calcolo argano» (round 45): on the same one while it is reproduced; else that calculation is made again
  // first (or the one it already was made again into) and the drawing is composed on the new one; one of the one form
  // before round 45 is made again from what it stored
  const r = !stored?.success ? null : await once(d.id, async () => {
    if (!b || readCalc(b)?.same) return createLiftDesign(user, d.projectId, stored.data, d.label, src, d.id, b ? { id: b.id, intervento: b.intervento } : null);
    const base = await rebase(user, b);
    const inputs = base ? liftInputsSchema.safeParse(liftInputsOf(progettoOf(stored.data), base)) : null;
    return base && inputs?.success ? createLiftDesign(user, d.projectId, inputs.data, d.label, src, d.id, { id: base.id, intervento: base.intervento }) : null;
  });
  if (r === 'busy') redirect(`${app}/lift-designs/${d.id}`);
  if (!r?.ok) redirect(formOr(user, 'progetto:edit', `${app}/projects/${d.projectId}/progetto?from=${d.id}&${REFRESH_QUERY}`, `${app}/lift-designs/${d.id}`));
  redirect(`${app}/lift-designs/${r.id}?da=${d.id}`);
}

const CALC_ROW = { id: true, projectId: true, label: true, inputs: true, sha256: true, collaudo: true, intervento: true } as const;
interface CalcRow { id: string; projectId: string; label: string | null; inputs: unknown; sha256: string; collaudo: unknown; intervento: TipoIntervento | null }
interface RoomRow { id: string; label: string | null; inputs: unknown }

/** A «Calcolo argano» made again from its values, the standards chosen with it and its intervention as stored
 *  (none before round 45: none on the new one either), and the machine room given
 *  on the new one (`room` null: a survey the new calculation no longer takes, or a user who does not draw the project's —
 *  it stays where it was, to be made again on the new calculation by whoever does). */
async function remakeCalc(user: SessionUser, c: CalcRow, room: RoomRow | null): Promise<{ calc: string; room: string | null } | null> {
  // the standards chosen as stored, taken again only as today's rules take them: else the form opens on the record
  const read = c.collaudo ? collaudoReadSchema.safeParse(c.collaudo) : null, chosen = read?.success ? collaudoSchema.safeParse(read.data) : null;
  if (chosen && !chosen.success) return null;
  const values = formValuesSchema.safeParse(c.inputs);
  const r = values.success ? await createCalculation(user, c.projectId, values.data, c.label, chosen?.success ? chosen.data : null, c.intervento, c.id) : null;
  if (!r?.ok) return null;
  if (!room || !remakes(user, 'room')) return { calc: r.id, room: null };
  const fresh = await prisma.calculation.findFirst({ where: { id: r.id, companyId: user.companyId }, select: CALC_ROW });
  return { calc: r.id, room: fresh ? await placeRoom(user, fresh, room) : null };
}

/** The «Calcolo argano» a drawing is composed on again, its own being no longer reproduced: the calculation it was
 *  already made again into, else made again now (without its machine room: the drawing is the Progetto); null when its
 *  values no longer pass (its form opens). */
async function rebase(user: SessionUser, b: CalcRow): Promise<(CalcRow & { values: FormValues; collaudo: Collaudo }) | null> {
  const done = await madeFrom(user, 'CALCULATION_SAVED', b.id);
  const id = done ?? (await remakeCalc(user, b, null))?.calc;
  const c = id ? await prisma.calculation.findFirst({ where: { id, companyId: user.companyId }, select: CALC_ROW }) : null, read = c ? readCalc(c) : null;
  return c && read?.same ? { ...c, values: read.values, collaudo: storedCollaudo(read.values, c.collaudo) } : null;
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

/** A calculation: that of a lift design is the design's to make again; a «Calcolo argano», with its latest machine room. */
export async function refreshCalculationAction(fd: FormData): Promise<void> {
  const { user, id, app } = await refresher(fd);
  const c = await prisma.calculation.findFirst({
    where: { id, companyId: user.companyId, project: { archivedAt: null } },
    select: {
      ...CALC_ROW, liftDesign: { select: { id: true } }, shaftDesign: { select: DESIGN_SELECT },
      roomDesigns: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, label: true, inputs: true } },
    },
  });
  if (!c) redirect(app);
  if (c.liftDesign) await refreshLift(user, c.liftDesign.id, app);
  if (calcRecord({ ...c, liftDesign: null })?.ok) redirect(`${app}/calculations/${c.id}`);
  // the archive of a whole project (a shaft design's calculation before the one form): the project is made again from the
  // Progetto; a «Calcolo argano» of any installation is made again in place (round 45)
  if (c.shaftDesign) redirect(formOr(user, 'progetto:edit', `${app}/projects/${c.projectId}/progetto`, `${app}/calculations/${c.id}`));
  const done = await madeFrom(user, 'CALCULATION_SAVED', c.id);
  if (done) redirect(`${app}/calculations/${done}?da=${c.id}`);
  const r = await once(c.id, () => remakeCalc(user, c, c.roomDesigns[0] ?? null));
  if (r === 'busy') redirect(`${app}/calculations/${c.id}`);
  if (!r) redirect(formOr(user, 'calc:create', `${app}/projects/${c.projectId}/calc?from=${c.id}&${REFRESH_QUERY}`, `${app}/calculations/${c.id}`));
  redirect(`${app}/calculations/${r.calc}?da=${c.id}`);
}

/** A machine room (of any installation, round 45): on its calculation while that is reproduced, else on the calculation
 *  that one was made again into, else on a new one. */
export async function refreshRoomDesignAction(fd: FormData): Promise<void> {
  const { user, id, app } = await refresher(fd);
  const r = await prisma.roomDesign.findFirst({
    where: { id, companyId: user.companyId, project: { archivedAt: null } },
    select: { id: true, label: true, inputs: true, sha256: true, calculation: { select: CALC_ROW } },
  });
  if (!r) redirect(app);
  const c = r.calculation;
  if (reproduceRoomRecord(r, c).ok) redirect(`${app}/room-designs/${r.id}`);
  const done = await madeFrom(user, 'ROOM_DESIGN_SAVED', r.id);
  if (done) redirect(`${app}/room-designs/${done}?da=${r.id}`);
  // a new machine room is the Progetto's: not for whoever only makes the calculations
  if (!remakes(user, 'room')) redirect(`${app}/room-designs/${r.id}`);
  const newer = readCalc(c)?.same ? null : await madeFrom(user, 'CALCULATION_SAVED', c.id);
  const fresh = newer ? await prisma.calculation.findFirst({ where: { id: newer, companyId: user.companyId }, select: CALC_ROW }) : null;
  const on = readCalc(c)?.same ? c : fresh && readCalc(fresh)?.same ? fresh : null;
  const m = await once(r.id, async () => (on ? { calc: on.id, room: await placeRoom(user, on, r) } : remakeCalc(user, c, r)));
  if (m === 'busy') redirect(`${app}/room-designs/${r.id}`);
  if (!m) redirect(formOr(user, 'calc:create', `${app}/projects/${c.projectId}/calc?from=${c.id}&${REFRESH_QUERY}`, `${app}/room-designs/${r.id}`));
  // a survey the calculation no longer takes: its form, on that calculation, from this survey
  redirect(m.room ? `${app}/room-designs/${m.room}?da=${r.id}` : formOr(user, 'progetto:edit', `${app}/calculations/${m.calc}/locale?from=${r.id}&${REFRESH_QUERY}`, `${app}/calculations/${m.calc}`));
}
