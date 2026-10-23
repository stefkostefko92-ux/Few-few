'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { getSessionUser, type SessionUser } from '@/lib/auth';
import { RIGHT_OF_STEP, can, type Capability } from '@/lib/rbac';
import { idSchema, projectSchema } from '@/lib/schemas';
import { schedaIdSchema } from '@/lib/rilievi/inputs';
import { creaDaRilievo } from './collega/service';
import { str, type FormState } from './form';

const localeOf = (fd: FormData): string => { const l = str(fd, 'locale'); return isLocale(l) ? l : DEFAULT_LOCALE; };

async function actor(fd: FormData, capability: Capability): Promise<{ user: SessionUser; locale: string } | null> {
  const locale = localeOf(fd), user = await getSessionUser();
  if (!user) redirect(`/${locale}/login`);
  if (user.mustChangePassword || !can(user, capability)) return null;
  return { user, locale };
}

const readProject = (fd: FormData) => projectSchema.safeParse({
  name: str(fd, 'name'), address: str(fd, 'address'), city: str(fd, 'city'), province: str(fd, 'province'),
  plantNumber: str(fd, 'plantNumber'), client: str(fd, 'client'), notes: str(fd, 'notes'),
});

// a new installation opens straight on its first step, «Calcolo argano» (round 45: the type of intervention is chosen
// there, never on the installation) — for whoever makes the calculations; whoever only creates installations lands on
// its page, which says whose the calculation is. Created from a survey («Crea impianto», round 44: `rilievo`), it is
// linked to it in the same transaction — which also needs 'rilievi:link' — and its form starts from the survey's values
// (src/lib/collega/prefill.ts).
export async function createProjectAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await actor(fd, 'impianti:create');
  if (!a) return { error: 'forbidden' };
  const parsed = readProject(fd);
  if (!parsed.success) return { error: 'invalidFields', fields: parsed.error.issues.map((i) => String(i.path[0])) };
  const form = can(a.user, RIGHT_OF_STEP.calcolo) ? '/calc' : '';
  const rilievo = str(fd, 'rilievo');
  if (rilievo) {
    const id = schedaIdSchema.safeParse(rilievo);
    if (!id.success || !can(a.user, 'rilievi:link')) return { error: 'forbidden' };
    const made = await creaDaRilievo(a.user.companyId, a.user.id, parsed.data, id.data);
    if (made.esito !== 'ok' || !made.id) return { error: made.esito === 'alreadyLinked' ? 'rilievoLinked' : 'notFound' };
    redirect(`/${a.locale}/app/projects/${made.id}${form}`);
  }
  const project = await prisma.project.create({ data: { ...parsed.data, companyId: a.user.companyId, createdById: a.user.id }, select: { id: true } });
  await audit({ companyId: a.user.companyId, userId: a.user.id, action: 'PROJECT_CREATED', entity: 'Project', entityId: project.id });
  redirect(`/${a.locale}/app/projects/${project.id}${form}`);
}

export async function updateProjectAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await actor(fd, 'projects:edit');
  if (!a) return { error: 'forbidden' };
  const id = idSchema.safeParse(str(fd, 'id'));
  const parsed = readProject(fd);
  if (!id.success) return { error: 'notFound' };
  if (!parsed.success) return { error: 'invalidFields', fields: parsed.error.issues.map((i) => String(i.path[0])) };
  // an archived installation is read only: restore it first
  const res = await prisma.project.updateMany({ where: { id: id.data, companyId: a.user.companyId, archivedAt: null }, data: parsed.data });
  if (res.count !== 1) return { error: 'notFound' };
  await audit({ companyId: a.user.companyId, userId: a.user.id, action: 'PROJECT_UPDATED', entity: 'Project', entityId: id.data });
  redirect(`/${a.locale}/app/projects/${id.data}`);
}

export async function setProjectArchivedAction(fd: FormData): Promise<void> {
  const a = await actor(fd, 'projects:archive');
  const id = idSchema.safeParse(str(fd, 'id'));
  if (!a || !id.success) return;
  const archive = str(fd, 'archive') === '1';
  const res = await prisma.project.updateMany({ where: { id: id.data, companyId: a.user.companyId }, data: { archivedAt: archive ? new Date() : null } });
  if (res.count === 1) {
    await audit({ companyId: a.user.companyId, userId: a.user.id, action: archive ? 'PROJECT_ARCHIVED' : 'PROJECT_RESTORED', entity: 'Project', entityId: id.data });
  }
  revalidatePath(`/${a.locale}/app/projects/${id.data}`);
}
