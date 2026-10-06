'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Prisma, type Role } from '@prisma/client';
import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { getSessionUser, type SessionUser } from '@/lib/auth';
import { MEMBER_ROLES, assignableRoles, can, outranks, type Capability } from '@/lib/rbac';
import { mailConfigured } from '@/lib/mail';
import { hashPassword, temporaryPassword } from '@/lib/password';
import { rateLimit } from '@/lib/ratelimit';
import { companyCreateSchema, idSchema, roleSchema, userCreateSchema } from '@/lib/schemas';
import { BILLING_SELECT, accessOf } from '@/lib/billing-access';
import { enforceSeats, lockCompany, seatAvailable } from './billing';
import { str, type FormState } from './form';

const localeOf = (fd: FormData): string => { const l = str(fd, 'locale'); return isLocale(l) ? l : DEFAULT_LOCALE; };
/** Two requests with the same e-mail at once: the second meets the unique index. */
const emailTaken = (e: unknown): boolean => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

async function actor(capability: Capability): Promise<SessionUser | null> {
  const user = await getSessionUser();
  if (!user || user.mustChangePassword || !can(user, capability)) return null;
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
  // A company's own users confirm the address at their first sign-in (the link by e-mail + the temporary password):
  // a company that registered itself cannot make a confirmed account for an address it does not own. The platform's
  // administrator vouches for the addresses it enters.
  const vouched = me.role === 'SUPERADMIN';
  if (!vouched && !mailConfigured()) return { error: 'mailUnavailable' };
  // the slots before the address: without a free one the answer is the same for any address, so a company without
  // slots cannot probe which addresses have an account elsewhere (audit 2026-10-06); the creation re-checks it locked
  if (!(await prisma.$transaction((tx) => seatAvailable(tx, me.companyId)))) return { error: 'noSeats' };
  if (await prisma.user.findUnique({ where: { email: parsed.data.email }, select: { id: true } })) return { error: 'emailTaken' };
  const password = temporaryPassword(), passwordHash = await hashPassword(password);
  let user;
  try {
    // every colleague takes a slot of the subscription: the company is locked while the slots are counted
    user = await prisma.$transaction(async (tx) => {
      if (!(await seatAvailable(tx, me.companyId))) return null;
      return tx.user.create({
        data: { ...parsed.data, companyId: me.companyId, passwordHash, mustChangePassword: true, locale: localeOf(fd), emailVerifiedAt: vouched ? new Date() : null },
      });
    });
  } catch (e) {
    if (emailTaken(e)) return { error: 'emailTaken' };
    throw e;
  }
  if (!user) return { error: 'noSeats' };
  await audit({ companyId: me.companyId, userId: me.id, action: 'USER_CREATED', entity: 'User', entityId: user.id, meta: { role: user.role } });
  revalidatePath(`/${localeOf(fd)}/app/team`);
  return { ok: true, secret: password, message: user.email, pending: !vouched };
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
  const done = await prisma.$transaction(async (tx) => {
    // a colleague brought back takes a slot again: decided on the user as it is once the company is locked
    await lockCompany(tx, me.companyId);
    const now = await tx.user.findFirst({ where: { id: target.id, companyId: me.companyId }, select: { active: true, role: true } });
    if (!now) return true;
    const seat = data.active === true && !now.active && MEMBER_ROLES.includes(data.role ?? now.role);
    if (seat && !(await seatAvailable(tx, me.companyId))) return false;
    await tx.user.update({ where: { id: target.id }, data });
    if (data.active === false) await tx.session.deleteMany({ where: { userId: target.id } });
    return true;
  });
  if (!done) redirect(`/${localeOf(fd)}/app/team?e=noSeats`);
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
  const passwordHash = await hashPassword(password);
  await prisma.$transaction([
    prisma.user.update({ where: { id: target.id }, data: { passwordHash, mustChangePassword: true, tokenVersion: { increment: 1 } } }),
    prisma.session.deleteMany({ where: { userId: target.id } }),
  ]);
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

/** Platform: a company that is never billed (a partner, the platform's own) or billed again. */
export async function setCompanyExemptAction(fd: FormData): Promise<void> {
  const me = await actor('platform:admin');
  const id = idSchema.safeParse(str(fd, 'id'));
  if (!me || !id.success || id.data === me.companyId) return;
  const exempt = str(fd, 'exempt') === '1';
  await prisma.company.updateMany({ where: { id: id.data }, data: { billingExempt: exempt } });
  await audit({ companyId: id.data, userId: me.id, action: 'COMPANY_UPDATED', entity: 'Company', entityId: id.data, meta: { billingExempt: exempt } });
  // billed again: its trial starts now if it never had one, and the colleagues beyond the slots it pays are deactivated
  if (!exempt) {
    const c = await prisma.company.findUnique({ where: { id: id.data }, select: BILLING_SELECT });
    if (c) await accessOf(id.data, c);
    await enforceSeats(id.data);
  }
  revalidatePath(`/${localeOf(fd)}/app/admin`);
}
