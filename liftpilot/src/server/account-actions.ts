'use server';

import { redirect } from 'next/navigation';
import { Prisma } from '@prisma/client';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/i18n/locales';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { startSession } from '@/lib/auth';
import { mailAccount } from '@/lib/account-mail';
import { TERMS_VERSION, UNCONFIRMED_DAYS } from '@/lib/legal';
import { log } from '@/lib/log';
import { mailConfigured } from '@/lib/mail';
import { hashPassword, verifyPassword } from '@/lib/password';
import { clientIp, rateLimit } from '@/lib/ratelimit';
import { forgotSchema, registerSchema, resetSchema, verifySchema } from '@/lib/schemas';
import { consumeToken, issueToken, tokenUser } from '@/lib/tokens';
import { str, type FormState } from './form';

// Accounts without an administrator: a company registers itself (its owner confirms the address by the link and the
// password chosen), and anyone who forgot the password chooses a new one through a link. The answers never tell
// whether an address has an account: the e-mail does, to its owner.

const HOUR = 60 * 60 * 1000, WINDOW = 15 * 60 * 1000;
const localeOf = (fd: FormData): Locale => { const l = str(fd, 'locale'); return isLocale(l) ? l : DEFAULT_LOCALE; };

/** The schemas name their own problems (weak password, consent…); anything else is a field to fix. */
const CODES = new Set(['weakPassword', 'passwordMismatch', 'consentRequired', 'invalidLink']);
function formError(issues: readonly { message: string; path: readonly (string | number)[] }[]): FormState {
  return { error: issues.map((i) => i.message).find((m) => CODES.has(m)) ?? 'invalidFields', fields: [...new Set(issues.map((i) => String(i.path[0])))] };
}

/** Self-registrations never confirmed go after UNCONFIRMED_DAYS, with their company (nobody else is in it). */
async function purgeUnconfirmed(): Promise<void> {
  const before = new Date(Date.now() - UNCONFIRMED_DAYS * 24 * HOUR);
  const stale = await prisma.user.findMany({
    where: { emailVerifiedAt: null, termsAcceptedAt: { not: null }, createdAt: { lt: before } }, select: { id: true, companyId: true }, take: 50,
  });
  for (const u of stale) {
    await prisma.$transaction([
      prisma.user.delete({ where: { id: u.id } }),
      prisma.company.deleteMany({ where: { id: u.companyId, users: { none: {} } } }),
    ]);
  }
}

export async function registerAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const locale = localeOf(fd);
  if (!mailConfigured()) return { error: 'mailUnavailable' };
  if (!rateLimit(`register-ip:${await clientIp()}`, 5, HOUR)) return { error: 'rateLimited' };
  const parsed = registerSchema.safeParse({
    company: str(fd, 'company'), vatNumber: str(fd, 'vatNumber'), city: str(fd, 'city'), name: str(fd, 'name'), email: str(fd, 'email'),
    password: str(fd, 'password'), confirm: str(fd, 'confirm'), privacy: str(fd, 'privacy'), terms: str(fd, 'terms'),
  });
  if (!parsed.success) return formError(parsed.error.issues);
  const d = parsed.data, sent: FormState = { ok: true, message: d.email };
  // at most three mails an hour to one address, whatever the reason; the page answers the same
  if (!rateLimit(`register-email:${d.email}`, 3, HOUR)) return sent;
  await purgeUnconfirmed();
  const passwordHash = await hashPassword(d.password), now = new Date();
  const accepted = { termsAcceptedAt: now, termsVersion: TERMS_VERSION };
  const existing = await prisma.user.findUnique({ where: { email: d.email }, select: { id: true, companyId: true, emailVerifiedAt: true, termsAcceptedAt: true } });
  let userId: string;
  if (existing && (existing.emailVerifiedAt || !existing.termsAcceptedAt)) {
    // the address already has an account: its owner hears it, nothing changes
    mailAccount(d.email, locale, { kind: 'exists' });
    return sent;
  } else if (existing) {
    // a registration never confirmed: the newest one takes its place (only the inbox's owner can confirm it)
    await prisma.$transaction([
      prisma.company.update({ where: { id: existing.companyId }, data: { name: d.company, vatNumber: d.vatNumber, city: d.city } }),
      prisma.user.update({ where: { id: existing.id }, data: { name: d.name, passwordHash, locale, ...accepted, tokenVersion: { increment: 1 } } }),
    ]);
    userId = existing.id;
  } else {
    try {
      const u = await prisma.$transaction(async (tx) => {
        const c = await tx.company.create({ data: { name: d.company, vatNumber: d.vatNumber, city: d.city } });
        return tx.user.create({
          data: { companyId: c.id, email: d.email, name: d.name, role: 'OWNER', passwordHash, mustChangePassword: false, locale, ...accepted },
        });
      });
      userId = u.id;
      await audit({ companyId: u.companyId, userId: u.id, action: 'USER_REGISTERED', entity: 'User', entityId: u.id });
      log.info({ userId: u.id }, 'registered');
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return sent; // the same address at the same moment
      throw e;
    }
  }
  mailAccount(d.email, locale, { kind: 'verify', token: await issueToken(userId, 'VERIFY_EMAIL') });
  return sent;
}

// The link of the registration and the password chosen there: the address is proven by the inbox, the account by the
// password (a link alone would confirm an account somebody else made with this address).
export async function verifyEmailAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const locale = localeOf(fd);
  if (!rateLimit(`verify-ip:${await clientIp()}`, 20, WINDOW)) return { error: 'rateLimited' };
  const parsed = verifySchema.safeParse({ token: str(fd, 'token'), password: str(fd, 'password') });
  if (!parsed.success) return { error: 'invalidLink' };
  const { token, password } = parsed.data;
  const id = await tokenUser(token, 'VERIFY_EMAIL');
  if (!id) return { error: 'invalidLink' };
  if (!rateLimit(`verify-user:${id}`, 8, WINDOW)) return { error: 'rateLimited' };
  const user = await prisma.user.findUnique({ where: { id }, include: { company: { select: { active: true } } } });
  if (!user || !user.active || !user.company.active) return { error: 'invalidLink' };
  if (!(await verifyPassword(password, user.passwordHash))) return { error: 'verifyWrongPassword' };
  const done = await prisma.$transaction(async (tx) => {
    if ((await consumeToken(tx, token, 'VERIFY_EMAIL')) !== user.id) return false;
    await tx.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date(), lastLoginAt: new Date() } });
    return true;
  });
  if (!done) return { error: 'invalidLink' };
  await startSession(user);
  await audit({ companyId: user.companyId, userId: user.id, action: 'EMAIL_VERIFIED', entity: 'User', entityId: user.id });
  redirect(`/${locale}/app`);
}

export async function forgotPasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const locale = localeOf(fd);
  if (!mailConfigured()) return { error: 'mailUnavailable' };
  if (!rateLimit(`forgot-ip:${await clientIp()}`, 10, WINDOW)) return { error: 'rateLimited' };
  const parsed = forgotSchema.safeParse({ email: str(fd, 'email') });
  if (!parsed.success) return { error: 'invalidFields', fields: ['email'] };
  const { email } = parsed.data;
  if (rateLimit(`forgot-email:${email}`, 3, HOUR)) {
    const user = await prisma.user.findUnique({ where: { email }, include: { company: { select: { active: true } } } });
    if (user && user.active && user.company.active) {
      mailAccount(email, locale, { kind: 'reset', token: await issueToken(user.id, 'RESET_PASSWORD') });
      await audit({ companyId: user.companyId, userId: user.id, action: 'PASSWORD_RESET_REQUESTED', entity: 'User', entityId: user.id });
    }
  }
  return { ok: true, message: email };
}

// A new password through the link: every session ends (tokenVersion) and every other link of the user stops; the
// link proves the address too.
export async function resetPasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const locale = localeOf(fd);
  if (!rateLimit(`reset-ip:${await clientIp()}`, 20, WINDOW)) return { error: 'rateLimited' };
  const parsed = resetSchema.safeParse({ token: str(fd, 'token'), next: str(fd, 'next'), confirm: str(fd, 'confirm') });
  if (!parsed.success) return formError(parsed.error.issues);
  const passwordHash = await hashPassword(parsed.data.next), now = new Date();
  const user = await prisma.$transaction(async (tx) => {
    const id = await consumeToken(tx, parsed.data.token, 'RESET_PASSWORD');
    if (!id) return null;
    const u = await tx.user.update({ where: { id }, data: { passwordHash, mustChangePassword: false, tokenVersion: { increment: 1 } } });
    if (!u.emailVerifiedAt) await tx.user.update({ where: { id }, data: { emailVerifiedAt: now } });
    await tx.authToken.deleteMany({ where: { userId: id } });
    return u;
  });
  if (!user) return { error: 'invalidLink' };
  await audit({ companyId: user.companyId, userId: user.id, action: 'PASSWORD_RESET', entity: 'User', entityId: user.id });
  redirect(`/${locale}/login?reset=1`);
}
