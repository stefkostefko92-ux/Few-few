'use server';

import { after } from 'next/server';
import { redirect } from 'next/navigation';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/i18n/locales';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { endSession, getSessionUser, startSession } from '@/lib/auth';
import { TERMS_VERSION } from '@/lib/legal';
import { mailAccount } from '@/lib/account-mail';
import { mailConfigured } from '@/lib/mail';
import { pastConfirmDeadline, purgeStale } from '@/lib/purge';
import { burnPasswordCheck, hashPassword, verifyPassword } from '@/lib/password';
import { clientIp, rateLimit, rateReset } from '@/lib/ratelimit';
import { newestPending, renewPending } from '@/lib/registrations';
import { loginSchema, newPasswordSchema } from '@/lib/schemas';
import { issueToken } from '@/lib/tokens';
import { log } from '@/lib/log';
import { str, type FormState } from './form';

const WINDOW = 15 * 60 * 1000, HOUR = 60 * 60 * 1000;
const localeOf = (fd: FormData): Locale => { const l = str(fd, 'locale'); return isLocale(l) ? l : DEFAULT_LOCALE; };

export async function loginAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const locale = localeOf(fd);
  after(purgeStale); // accounts never confirmed, registrations and sessions over, at most every 6 h, after the answer
  const parsed = loginSchema.safeParse({ email: str(fd, 'email'), password: str(fd, 'password') });
  if (!parsed.success) return { error: 'invalidLogin' };
  const { email, password } = parsed.data;
  const ip = await clientIp();
  if (!rateLimit(`login-ip:${ip}`, 30, WINDOW) || !rateLimit(`login-email:${email}`, 8, WINDOW)) return { error: 'rateLimited' };

  const user = await prisma.user.findUnique({ where: { email }, include: { company: { select: { active: true } } } });
  if (!user) return signInPending(email, password, locale);
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok || !user.active || !user.company.active) {
    await audit({ companyId: user.companyId, userId: user.id, action: 'LOGIN_FAILED', entity: 'User', entityId: user.id });
    return { error: 'invalidLogin' };
  }
  rateReset(`login-email:${email}`);
  // an account whose address is not confirmed yet: a new link instead of a session (at most 3 an hour); none after
  // UNCONFIRMED_DAYS, when the account goes (src/lib/purge.ts)
  if (!user.emailVerifiedAt) {
    if (pastConfirmDeadline(user.createdAt)) return { error: 'unverifiedExpired' };
    if (mailConfigured() && rateLimit(`verify-mail:${user.id}`, 3, HOUR)) {
      mailAccount(user.email, locale, { kind: 'verify', token: await issueToken(user.id, 'VERIFY_EMAIL'), terms: user.termsVersion === TERMS_VERSION });
    }
    return { error: 'unverified' };
  }
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await startSession(user);
  await audit({ companyId: user.companyId, userId: user.id, action: 'LOGIN', entity: 'User', entityId: user.id });
  log.info({ userId: user.id }, 'login');
  // a password issued by someone else is replaced first
  redirect(user.mustChangePassword ? `/${locale}/app/account?first=1` : `/${locale}/app`);
}

/** No account with the address: a registration still waiting for it, with its password, gets a new link (the newest
 *  registration of the address only: one password check, as for every address). */
async function signInPending(email: string, password: string, locale: Locale): Promise<FormState> {
  const p = await newestPending(email);
  if (!p) {
    await burnPasswordCheck(password);
    return { error: 'invalidLogin' };
  }
  if (!(await verifyPassword(password, p.passwordHash))) return { error: 'invalidLogin' };
  rateReset(`login-email:${email}`);
  if (mailConfigured() && rateLimit(`verify-mail:${p.id}`, 3, HOUR)) {
    const token = await renewPending(p);
    if (token) mailAccount(email, locale, { kind: 'verify', token, terms: p.termsVersion === TERMS_VERSION });
  }
  return { error: 'unverified' };
}

export async function logoutAction(fd: FormData): Promise<void> {
  const locale = localeOf(fd);
  const user = await getSessionUser();
  await endSession();
  if (user) await audit({ companyId: user.companyId, userId: user.id, action: 'LOGOUT', entity: 'User', entityId: user.id });
  redirect(`/${locale}/login`);
}

// Own password: the current one is required; every session ends (a new tokenVersion, the sessions deleted), this one
// is opened again.
export async function changePasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const locale = localeOf(fd);
  const me = await getSessionUser();
  if (!me) redirect(`/${locale}/login`);
  if (!rateLimit(`pw:${me.id}`, 10, WINDOW)) return { error: 'rateLimited' };
  const parsed = newPasswordSchema.safeParse({ current: str(fd, 'current'), next: str(fd, 'next'), confirm: str(fd, 'confirm') });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message === 'passwordMismatch' ? 'passwordMismatch' : 'weakPassword' };
  const user = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
  if (!(await verifyPassword(parsed.data.current, user.passwordHash))) return { error: 'wrongPassword' };
  if (parsed.data.current === parsed.data.next) return { error: 'samePassword' };
  const passwordHash = await hashPassword(parsed.data.next);
  const [updated] = await prisma.$transaction([
    prisma.user.update({ where: { id: me.id }, data: { passwordHash, mustChangePassword: false, tokenVersion: { increment: 1 } } }),
    prisma.session.deleteMany({ where: { userId: me.id } }),
  ]);
  await startSession(updated);
  await audit({ companyId: me.companyId, userId: me.id, action: 'PASSWORD_CHANGED', entity: 'User', entityId: me.id });
  return { ok: true };
}
