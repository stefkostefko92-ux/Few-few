'use server';

// «Aggiorna il progetto con l'ultimo calcolo» (round 45): a lift design drawn on an older «Calcolo argano» (or one of the
// one form before round 45, older than the installation's latest calculation) drawn again in one click on the latest
// step-2 calculation of its installation — its drawing as saved (progettoOf), composed on that calculation
// (liftInputsOf) and saved through the unchanged derivation (createLiftDesign, naming its new base). Whoever draws the
// project, not in read-only mode (can()); one at a time per design; a design already drawn again on that calculation
// is not copied; a calculation no longer reproduced, or a drawing that no longer passes on it, opens the Progetto on
// that calculation from this drawing.
import { redirect } from 'next/navigation';
import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { liftInputsReadSchema, liftInputsSchema } from '@/lib/lift-input';
import { liftInputsOf, progettoOf } from '@/lib/lift/progetto';
import { rateLimit } from '@/lib/ratelimit';
import { can } from '@/lib/rbac';
import { idSchema } from '@/lib/schemas';
import { shaftSourceSchema } from '@/lib/shaft-input';
import { calcoloBase } from './calcolo-base';
import { str } from './form';
import { madeFrom, once } from './remake';
import { createLiftDesign } from './save';

export async function ridisegnaDalCalcoloAction(fd: FormData): Promise<void> {
  const l = str(fd, 'locale'), locale = isLocale(l) ? l : DEFAULT_LOCALE, app = `/${locale}/app`;
  const user = await getSessionUser();
  if (!user) redirect(`/${locale}/login`);
  const id = idSchema.safeParse(str(fd, 'id'));
  // the Progetto's record: whoever draws the project, never in read-only mode
  if (user.mustChangePassword || !can(user, 'progetto:edit') || !id.success) redirect(app);
  const page = `${app}/lift-designs/${id.data}`;
  if (!rateLimit(`lift:${user.id}`, 60, 10 * 60 * 1000)) redirect(page);
  const d = await prisma.liftDesign.findFirst({
    where: { id: id.data, companyId: user.companyId, project: { archivedAt: null } },
    select: { id: true, projectId: true, label: true, inputs: true, source: true, baseCalculationId: true, createdAt: true },
  });
  if (!d) redirect(app);
  const latest = await calcoloBase(user, d.projectId);
  // nothing newer to draw on: the base is the latest; a design of the one form is drawn again only on a calculation
  // newer than it (the page's rule — an older one is the replacement an upgraded installation started from)
  if (!latest || (d.baseCalculationId ? latest.id === d.baseCalculationId : latest.createdAt <= d.createdAt)) redirect(page);
  const done = await madeFrom(user, 'LIFT_DESIGN_SAVED', d.id);
  const again = done ? await prisma.liftDesign.findFirst({ where: { id: done, companyId: user.companyId }, select: { id: true, baseCalculationId: true } }) : null;
  if (again && again.baseCalculationId === latest.id) redirect(`${app}/lift-designs/${again.id}`);
  const form = `${app}/projects/${d.projectId}/progetto?from=${d.id}&calc=${latest.id}`;
  const read = liftInputsReadSchema.safeParse(d.inputs), source = d.source ? shaftSourceSchema.safeParse(d.source) : null;
  const r = await once(d.id, async () => {
    if (!latest.same || !read.success) return null;
    const inputs = liftInputsSchema.safeParse(liftInputsOf(progettoOf(read.data), latest));
    // DM 236 added to the test in the calculation: its case is the drawing's to choose (never checked on 'none')
    if (!inputs.success || (latest.collaudo.aggiuntive?.includes('dm236') && inputs.data.shaft.access === 'none')) return null;
    return createLiftDesign(user, d.projectId, inputs.data, d.label, source?.success ? source.data : null, d.id,
      { id: latest.id, intervento: latest.dichiarato ? latest.tipo : null });
  });
  if (r === 'busy') redirect(page);
  if (!r?.ok) redirect(form);
  redirect(`${app}/lift-designs/${r.id}`);
}
