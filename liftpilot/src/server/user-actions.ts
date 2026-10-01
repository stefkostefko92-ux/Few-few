'use server';

import { revalidatePath } from 'next/cache';
import { Prisma, type Role } from '@prisma/client';
import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { getSessionUser, type SessionUser } from '@/lib/auth';
import { assignableRoles, can, outranks, type Capability } from '@/lib/rbac';
import { hashPassword, temporaryPassword } from '@/lib/password';
import { rateLimit } from '@/lib/ratelimit';
import { companyCreateSchema, idSchema, roleSchema, userCreateSchema } from '@/lib/schemas';
import { str, type FormState } from './form';

const localeOf = (fd: FormData): string => { const l = str(fd, 'locale'); return isLocale(l) ? l : DEFAULT_LOCALE; };
/** Two requests with the same e-mail at once: the second meets the unique index. */
const emailTaken = (e: unknown): boolean => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

async function actor(capability: Capability): Promise<SessionUser | null> {
  const user = await getSessionUser();
  if (!user || user.mustChangePassword || !can(user.role, capability)) return null;
  return user;
}

/** A user of the same company that the actor strictly outranks (never the actor). */
async function manageable(me: SessionUser, id: string) {
  const target = await prisma.user.findFirst({ where: { id, companyId: me.companyId } });
  return target && target.id !== me.id && outranks(me.role, target.role) ? target : null;
}

export async function createUserAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await actor('users:manage');
  if (!me) return { error: 'forbidden' };
  if (!rateLimit(`users:${me.id}`, 30, 60 * 60 * 1000)) return { error: 'rateLimited' };
  const parsed = userCreateSchema.safeParse({ email: str(fd, 'email'), name: str(fd, 'name'), role: str(fd, 'role') });
  if (!parsed.success) return { error: 'invalidFields', fields: parsed.error.issues.map((i) => String(i.path[0])) };
  if (!assignableRoles(me.role).includes(parsed.data.role)) return { error: 'forbidden' };
  if (await prisma.user.findUnique({ where: { email: parsed.data.email }, select: { id: true } })) return { error: 'emailTaken' };
  const password = temporaryPassword();
  let user;
  try {
    user = await prisma.user.create({
      data: { ...parsed.data, companyId: me.companyId, passwordHash: await hashPassword(password), mustChangePassword: true, locale: localeOf(fd), emailVerifiedAt: new Date() },
    });
  } catch (e) {
    if (emailTaken(e)) return { error: 'emailTaken' };
    throw e;
  }
  await audit({ companyId: me.companyId, userId: me.id, action: 'USER_CREATED', entity: 'User', entityId: user.id, meta: { role: user.role } });
  revalidatePath(`/${localeOf(fd)}/app/team`);
  return { ok: true, secret: password, message: user.email };
}

export async function updateUserAction(fd: FormData): Promise<void> {
  const me = await actor('users:manage');
  const id = idSchema.safeParse(str(fd, 'id'));
  if (!me || !id.success) return;
  const target = await manageable(me, id.data);
  if (!target) return;
  const data: { role?: Role; active?: boolean; tokenVersion?: { increment: number } } = {};
  const role = roleSchema.safeParse(str(fd, 'role'));
  if (role.success && role.data !== target.role && assignableRoles(me.role).includes(role.data)) data.role = role.data;
  const active = str(fd, 'active');
  if (active === '0' || active === '1') {
    data.active = active === '1';
    if (!data.active) data.tokenVersion = { increment: 1 }; // ends the sessions of a deactivated user at once
  }
  if (!Object.keys(data).length) return;
  await prisma.user.update({ where: { id: target.id }, data });
  await audit({ companyId: me.companyId, userId: me.id, action: 'USER_UPDATED', entity: 'User', entityId: target.id,
    meta: { ...(data.role ? { role: data.role } : {}), ...(data.active !== undefined ? { active: data.active } : {}) } });
  revalidatePath(`/${localeOf(fd)}/app/team`);
}

export async function resetUserPasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await actor('users:manage');
  const id = idSchema.safeParse(str(fd, 'id'));
  if (!me || !id.success) return { error: 'forbidden' };
  if (!rateLimit(`reset:${me.id}`, 20, 60 * 60 * 1000)) return { error: 'rateLimited' };
  const target = await manageable(me, id.data);
  if (!target) return { error: 'forbidden' };
  const password = temporaryPassword();
  await prisma.user.update({ where: { id: target.id }, data: { passwordHash: await hashPassword(password), mustChangePassword: true, tokenVersion: { increment: 1 } } });
  await audit({ companyId: me.companyId, userId: me.id, action: 'USER_PASSWORD_RESET', entity: 'User', entityId: target.id });
  return { ok: true, secret: password, message: target.email };
}

// Platform: a new installer company with its owner (temporary password shown once). An account made by an
// administrator counts as confirmed: the administrator vouches for the address.
export async function createCompanyAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await actor('platform:admin');
  if (!me) return { error: 'forbidden' };
  const parsed = companyCreateSchema.safeParse({ name: str(fd, 'name'), vatNumber: str(fd, 'vatNumber'), city: str(fd, 'city'),
    ownerEmail: str(fd, 'ownerEmail'), ownerName: str(fd, 'ownerName') });
  if (!parsed.success) return { error: 'invalidFields', fields: parsed.error.issues.map((i) => String(i.path[0])) };
  const d = parsed.data;
  if (await prisma.user.findUnique({ where: { email: d.ownerEmail }, select: { id: true } })) return { error: 'emailTaken' };
  const password = temporaryPassword(), passwordHash = await hashPassword(password);
  let company;
  try {
    company = await prisma.$transaction(async (tx) => {
      const c = await tx.company.create({ data: { name: d.name, vatNumber: d.vatNumber, city: d.city } });
      await tx.user.create({ data: { companyId: c.id, email: d.ownerEmail, name: d.ownerName, role: 'OWNER', passwordHash, mustChangePassword: true, locale: localeOf(fd), emailVerifiedAt: new Date() } });
      return c;
    });
  } catch (e) {
    if (emailTaken(e)) return { error: 'emailTaken' };
    throw e;
  }
  await audit({ companyId: company.id, userId: me.id, action: 'COMPANY_CREATED', entity: 'Company', entityId: company.id });
  revalidatePath(`/${localeOf(fd)}/app/admin`);
  return { ok: true, secret: password, message: d.ownerEmail };
}

export async function setCompanyActiveAction(fd: FormData): Promise<void> {
  const me = await actor('platform:admin');
  const id = idSchema.safeParse(str(fd, 'id'));
  if (!me || !id.success || id.data === me.companyId) return;
  const active = str(fd, 'active') === '1';
  await prisma.$transaction([
    prisma.company.updateMany({ where: { id: id.data }, data: { active } }),
    // deactivating a company ends the sessions of all its users
    ...(active ? [] : [prisma.user.updateMany({ where: { companyId: id.data }, data: { tokenVersion: { increment: 1 } } })]),
  ]);
  await audit({ companyId: id.data, userId: me.id, action: 'COMPANY_UPDATED', entity: 'Company', entityId: id.data, meta: { active } });
  revalidatePath(`/${localeOf(fd)}/app/admin`);
}
