'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { getSessionUser, type SessionUser } from '@/lib/auth';
import { can, type Capability } from '@/lib/rbac';
import { idSchema, projectKindSchema, projectSchema } from '@/lib/schemas';
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

// a new installation opens straight on its work: the replacement on the calculation, a whole project on its one form
export async function createProjectAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const a = await actor(fd, 'projects:edit');
  if (!a) return { error: 'forbidden' };
  const parsed = readProject(fd), kind = projectKindSchema.safeParse(str(fd, 'kind'));
  if (!kind.success) return { error: 'invalidFields', fields: ['kind'] };
  if (!parsed.success) return { error: 'invalidFields', fields: parsed.error.issues.map((i) => String(i.path[0])) };
  const project = await prisma.project.create({ data: { ...parsed.data, kind: kind.data, companyId: a.user.companyId, createdById: a.user.id } });
  await audit({ companyId: a.user.companyId, userId: a.user.id, action: 'PROJECT_CREATED', entity: 'Project', entityId: project.id, meta: { kind: kind.data } });
  redirect(`/${a.locale}/app/projects/${project.id}/${kind.data === 'REPLACEMENT' ? 'calc' : 'progetto'}`);
}

/** A machine replacement becomes a whole project: its one form starts from the latest calculation (lift-start.ts). */
export async function upgradeProjectAction(fd: FormData): Promise<void> {
  const a = await actor(fd, 'projects:edit');
  const id = idSchema.safeParse(str(fd, 'id'));
  if (!a || !id.success) return;
  const res = await prisma.project.updateMany({ where: { id: id.data, companyId: a.user.companyId, archivedAt: null, kind: 'REPLACEMENT' }, data: { kind: 'FULL' } });
  if (res.count !== 1) return;
  await audit({ companyId: a.user.companyId, userId: a.user.id, action: 'PROJECT_UPGRADED', entity: 'Project', entityId: id.data });
  redirect(`/${a.locale}/app/projects/${id.data}/progetto`);
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
