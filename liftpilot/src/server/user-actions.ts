'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Prisma, type Role } from '@prisma/client';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/i18n/locales';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { getSessionUser, type SessionUser } from '@/lib/auth';
import { mailAccount } from '@/lib/account-mail';
import { MEMBER_ROLES, assignableRoles, can, outranks, type Capability } from '@/lib/rbac';
import { mailConfigured } from '@/lib/mail';
import { hashPassword, temporaryPassword } from '@/lib/password';
import { rateLimit } from '@/lib/ratelimit';
import { companyCreateSchema, idSchema, roleSchema, userCreateSchema } from '@/lib/schemas';
import { BILLING_SELECT, accessOf } from '@/lib/billing-access';
import { TOKEN_TTL_MS, issueToken, newToken } from '@/lib/tokens';
import { enforceSeats, lockCompany, seatAvailable } from './billing';
import { str, type FormState } from './form';

const HOUR = 60 * 60 * 1000;
const localeOf = (fd: FormData): Locale => { const l = str(fd, 'locale'); return isLocale(l) ? l : DEFAULT_LOCALE; };
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
  if (!rateLimit(`users:${me.id}`, 30, HOUR)) return { error: 'rateLimited' };
  const parsed = userCreateSchema.safeParse({ email: str(fd, 'email'), name: str(fd, 'name'), role: str(fd, 'role') });
  if (!parsed.success) return { error: 'invalidFields', fields: parsed.error.issues.map((i) => String(i.path[0])) };
  if (!assignableRoles(me.role).includes(parsed.data.role)) return { error: 'forbidden' };
  // A company invites its colleagues by e-mail: the colleague chooses the password from the link, so no account exists
  // for an address its owner never opened. The platform's administrator vouches for the addresses it enters and makes
  // the account at once, with a temporary password.
  const vouched = me.role === 'SUPERADMIN';
  if (!vouched) return mailConfigured() ? invite(me, parsed.data, localeOf(fd)) : { error: 'mailUnavailable' };
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

/** The owner's invitation of a colleague. The answer is the same for any address outside the company: an address with
 *  an account in another company (one address, one company) gets a notice instead of the link, and the invitation
 *  waits like any other until its end — the owner cannot tell which addresses have an account elsewhere (audit
 *  2026-10-06). Inviting an address again sends a new link and ends the earlier one. One address gets a few letters an
 *  hour whoever invites it: beyond them the invitation is kept with the link already sent (a first one waits for the
 *  owner to send it again), no letter goes, and the answer does not change. */
async function invite(me: SessionUser, d: { email: string; name: string; role: Role }, locale: Locale): Promise<FormState> {
  const { token, tokenHash } = newToken(), expiresAt = new Date(Date.now() + TOKEN_TTL_MS.INVITE);
  const outcome = await prisma.$transaction(async (tx) => {
    // the slots first, under the company's lock: without a free one the answer is the same for any address; an
    // invitation still waiting keeps its slot, one past its end takes a new one
    await lockCompany(tx, me.companyId);
    const waiting = await tx.invite.findFirst({ where: { companyId: me.companyId, email: d.email, expiresAt: { gt: new Date() } }, select: { id: true } });
    if (!waiting && !(await seatAvailable(tx, me.companyId))) return 'noSeats' as const;
    const user = await tx.user.findUnique({ where: { email: d.email }, select: { companyId: true } });
    if (user?.companyId === me.companyId) return 'emailTaken' as const;
    const mail = rateLimit(`invite-mail:${d.email}`, 3, HOUR);
    const row = await tx.invite.upsert({
      where: { companyId_email: { companyId: me.companyId, email: d.email } },
      create: { companyId: me.companyId, email: d.email, name: d.name, role: d.role, tokenHash, expiresAt, locale },
      update: { name: d.name, role: d.role, locale, ...(mail ? { tokenHash, expiresAt } : {}) },
      select: { id: true },
    });
    return { id: row.id, elsewhere: !!user, mail };
  });
  if (outcome === 'noSeats' || outcome === 'emailTaken') return { error: outcome };
  if (outcome.mail) mailAccount(d.email, locale, outcome.elsewhere ? { kind: 'inviteExists' } : { kind: 'invite', token });
  await audit({ companyId: me.companyId, userId: me.id, action: 'INVITE_SENT', entity: 'Invite', entityId: outcome.id, meta: { role: d.role, mailed: outcome.mail } });
  revalidatePath(`/${locale}/app/team`);
  return { ok: true, pending: true, message: d.email };
}

/** A waiting invitation of the company, sent again (a new link, a new week) or revoked. */
export async function inviteAgainAction(fd: FormData): Promise<void> {
  const me = await actor('users:manage');
  const id = idSchema.safeParse(str(fd, 'id'));
  if (!me || !id.success || !mailConfigured() || !rateLimit(`users:${me.id}`, 30, HOUR)) return;
  const row = await prisma.invite.findFirst({ where: { id: id.data, companyId: me.companyId }, select: { email: true, name: true, role: true } });
  if (row) await invite(me, row, localeOf(fd));
}

export async function revokeInviteAction(fd: FormData): Promise<void> {
  const me = await actor('users:manage');
  const id = idSchema.safeParse(str(fd, 'id'));
  if (!me || !id.success) return;
  const { count } = await prisma.invite.deleteMany({ where: { id: id.data, companyId: me.companyId } });
  if (count) await audit({ companyId: me.companyId, userId: me.id, action: 'INVITE_REVOKED', entity: 'Invite', entityId: id.data });
  revalidatePath(`/${localeOf(fd)}/app/team`);
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

/** A colleague deactivated first, then deleted for good (privacy notice, «retention»): the account, its sessions and
 *  links go; the company's records stay without their author (the link becomes empty, the triggers allow only that),
 *  and the activity log keeps the bare id, no personal data. */
export async function deleteUserAction(fd: FormData): Promise<void> {
  const me = await actor('users:manage');
  const id = idSchema.safeParse(str(fd, 'id'));
  if (!me || !id.success) return;
  const target = await manageable(me, id.data);
  if (!target || target.active || target.role === 'OWNER') return;
  const { count } = await prisma.user.deleteMany({ where: { id: target.id, companyId: me.companyId, active: false } });
  if (count) await audit({ companyId: me.companyId, userId: me.id, action: 'USER_DELETED', entity: 'User', entityId: target.id, meta: { role: target.role } });
  revalidatePath(`/${localeOf(fd)}/app/team`);
}

export async function resetUserPasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await actor('users:manage');
  const id = idSchema.safeParse(str(fd, 'id'));
  if (!me || !id.success) return { error: 'forbidden' };
  if (!rateLimit(`reset:${me.id}`, 20, HOUR)) return { error: 'rateLimited' };
  const target = await manageable(me, id.data);
  if (!target) return { error: 'forbidden' };
  if (mailConfigured() && me.role !== 'SUPERADMIN') {
    // the colleague chooses it from the link of the e-mail; the current one works until then
    mailAccount(target.email, isLocale(target.locale) ? target.locale : localeOf(fd), { kind: 'reset', token: await issueToken(target.id, 'RESET_PASSWORD') });
    await audit({ companyId: me.companyId, userId: me.id, action: 'PASSWORD_RESET_REQUESTED', entity: 'User', entityId: target.id });
    return { ok: true, pending: true, message: target.email };
  }
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
