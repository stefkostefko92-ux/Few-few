'use server';

import { after } from 'next/server';
import { redirect } from 'next/navigation';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/i18n/locales';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { endSession, getSessionUser, startSession } from '@/lib/auth';
import { mailAccount } from '@/lib/account-mail';
import { mailConfigured } from '@/lib/mail';
import { purgeUnconfirmed } from '@/lib/purge';
import { burnPasswordCheck, hashPassword, verifyPassword } from '@/lib/password';
import { clientIp, rateLimit, rateReset } from '@/lib/ratelimit';
import { loginSchema, newPasswordSchema } from '@/lib/schemas';
import { issueToken } from '@/lib/tokens';
import { log } from '@/lib/log';
import { str, type FormState } from './form';

const WINDOW = 15 * 60 * 1000;
const localeOf = (fd: FormData): Locale => { const l = str(fd, 'locale'); return isLocale(l) ? l : DEFAULT_LOCALE; };

export async function loginAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const locale = localeOf(fd);
  after(purgeUnconfirmed); // accounts never confirmed, at most every 6 h, after the answer
  const parsed = loginSchema.safeParse({ email: str(fd, 'email'), password: str(fd, 'password') });
  if (!parsed.success) return { error: 'invalidLogin' };
  const { email, password } = parsed.data;
  const ip = await clientIp();
  if (!rateLimit(`login-ip:${ip}`, 30, WINDOW) || !rateLimit(`login-email:${email}`, 8, WINDOW)) return { error: 'rateLimited' };

  const user = await prisma.user.findUnique({ where: { email }, include: { company: { select: { active: true } } } });
  if (!user) {
    await burnPasswordCheck(password);
    return { error: 'invalidLogin' };
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok || !user.active || !user.company.active) {
    await audit({ companyId: user.companyId, userId: user.id, action: 'LOGIN_FAILED', entity: 'User', entityId: user.id });
    return { error: 'invalidLogin' };
  }
  rateReset(`login-email:${email}`);
  // a self-registered account whose address is not confirmed yet: a new link instead of a session (at most 3 an hour)
  if (!user.emailVerifiedAt) {
    if (mailConfigured() && rateLimit(`verify-mail:${user.id}`, 3, 60 * 60 * 1000)) {
      mailAccount(user.email, locale, { kind: 'verify', token: await issueToken(user.id, 'VERIFY_EMAIL') });
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

export async function logoutAction(fd: FormData): Promise<void> {
  const locale = localeOf(fd);
  const user = await getSessionUser();
  await endSession();
  if (user) await audit({ companyId: user.companyId, userId: user.id, action: 'LOGOUT', entity: 'User', entityId: user.id });
  redirect(`/${locale}/login`);
}

// Own password: the current one is required; a new tokenVersion ends the other sessions, this one is renewed.
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
  const updated = await prisma.user.update({
    where: { id: me.id },
    data: { passwordHash: await hashPassword(parsed.data.next), mustChangePassword: false, tokenVersion: { increment: 1 } },
  });
  await startSession(updated);
  await audit({ companyId: me.companyId, userId: me.id, action: 'PASSWORD_CHANGED', entity: 'User', entityId: me.id });
  return { ok: true };
}
