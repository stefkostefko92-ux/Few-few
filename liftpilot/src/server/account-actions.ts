'use server';

import { after } from 'next/server';
import { redirect } from 'next/navigation';
import { Prisma } from '@prisma/client';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/i18n/locales';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { startSession } from '@/lib/auth';
import { mailAccount } from '@/lib/account-mail';
import { TERMS_VERSION } from '@/lib/legal';
import { log } from '@/lib/log';
import { mailConfigured } from '@/lib/mail';
import { hashPassword, verifyPassword } from '@/lib/password';
import { purgeUnconfirmed } from '@/lib/purge';
import { clientIp, rateLimit } from '@/lib/ratelimit';
import { forgotSchema, registerSchema, resetSchema, verifySchema, type RegisterInput } from '@/lib/schemas';
import { consumeToken, issueToken, tokenUser } from '@/lib/tokens';
import { str, type FormState } from './form';

// Accounts without an administrator: a company registers itself (its owner confirms the address by the link and the
// password chosen), and anyone who forgot the password chooses a new one through a link. The answers never tell
// whether an address has an account, neither by their words nor by their time: the work on the address (hash,
// records, e-mail) runs after the answer (`after`), and the e-mail tells the truth to the inbox's owner.

const HOUR = 60 * 60 * 1000, WINDOW = 15 * 60 * 1000;
const localeOf = (fd: FormData): Locale => { const l = str(fd, 'locale'); return isLocale(l) ? l : DEFAULT_LOCALE; };
const failed = (what: string) => (err: unknown): void => { log.error({ err: err instanceof Error ? err.message : String(err) }, what); };

/** The schemas name their own problems (weak password, consent…); anything else is a field to fix. */
const CODES = new Set(['weakPassword', 'passwordMismatch', 'consentRequired', 'invalidLink']);
function formError(issues: readonly { message: string; path: readonly (string | number)[] }[]): FormState {
  return { error: issues.map((i) => i.message).find((m) => CODES.has(m)) ?? 'invalidFields', fields: [...new Set(issues.map((i) => String(i.path[0])))] };
}

export async function registerAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const locale = localeOf(fd);
  if (!mailConfigured()) return { error: 'mailUnavailable' };
  if (!rateLimit(`register-ip:${await clientIp()}`, 5, HOUR)) return { error: 'rateLimited' };
  const parsed = registerSchema.safeParse({
    company: str(fd, 'company'), vatNumber: str(fd, 'vatNumber'), city: str(fd, 'city'), name: str(fd, 'name'), email: str(fd, 'email'),
    password: str(fd, 'password'), confirm: str(fd, 'confirm'), privacy: str(fd, 'privacy'), terms: str(fd, 'terms'), clauses: str(fd, 'clauses'),
  });
  if (!parsed.success) return formError(parsed.error.issues);
  const d = parsed.data;
  // at most three mails an hour to one address, whatever the reason; the page answers the same
  if (rateLimit(`register-email:${d.email}`, 3, HOUR)) after(() => register(d, locale).catch(failed('registration failed')));
  return { ok: true, message: d.email };
}

/** The registration, after the answer. An account that is confirmed or was ever used never changes: its owner hears
 *  that it exists. A registration never confirmed is replaced by the newest one, and a user added by a company who
 *  never confirmed gives the address back: only the inbox's owner can confirm either. */
async function register(d: RegisterInput, locale: Locale): Promise<void> {
  await purgeUnconfirmed();
  const passwordHash = await hashPassword(d.password);
  const accepted = { termsAcceptedAt: new Date(), termsVersion: TERMS_VERSION };
  const company = { name: d.company, vatNumber: d.vatNumber, city: d.city };
  const unused = { emailVerifiedAt: null, lastLoginAt: null };
  let made: { id: string; companyId: string; created: boolean } | null;
  try {
    made = await prisma.$transaction(async (tx) => {
      const old = await tx.user.findUnique({ where: { email: d.email }, select: { id: true, companyId: true, emailVerifiedAt: true, lastLoginAt: true, termsAcceptedAt: true } });
      if (old && (old.emailVerifiedAt || old.lastLoginAt)) return null;
      if (old?.termsAcceptedAt) {
        const n = await tx.user.updateMany({ where: { id: old.id, ...unused }, data: { name: d.name, passwordHash, locale, ...accepted, tokenVersion: { increment: 1 } } });
        if (n.count !== 1) return null;
        await tx.company.update({ where: { id: old.companyId }, data: company });
        await tx.authToken.deleteMany({ where: { userId: old.id } });
        return { id: old.id, companyId: old.companyId, created: false };
      }
      if (old && (await tx.user.deleteMany({ where: { id: old.id, ...unused } })).count !== 1) return null;
      const c = await tx.company.create({ data: company });
      const u = await tx.user.create({
        data: { companyId: c.id, email: d.email, name: d.name, role: 'OWNER', passwordHash, mustChangePassword: false, locale, ...accepted },
      });
      return { id: u.id, companyId: c.id, created: true };
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return; // the same address at the same moment
    throw e;
  }
  if (!made) {
    mailAccount(d.email, locale, { kind: 'exists' });
    return;
  }
  if (made.created) {
    await audit({ companyId: made.companyId, userId: made.id, action: 'USER_REGISTERED', entity: 'User', entityId: made.id });
    log.info({ userId: made.id }, 'registered');
  }
  mailAccount(d.email, locale, { kind: 'verify', token: await issueToken(made.id, 'VERIFY_EMAIL') });
}

// The link of the e-mail and the account's password: the address is proven by the inbox, the account by the password
// (a link alone would confirm an account somebody else made with this address).
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
  const now = new Date();
  const done = await prisma.$transaction(async (tx) => {
    if ((await consumeToken(tx, token, 'VERIFY_EMAIL')) !== user.id) return false;
    // the password checked above must still be the account's: a registration replaced meanwhile confirms nothing
    const n = await tx.user.updateMany({ where: { id: user.id, emailVerifiedAt: null, passwordHash: user.passwordHash }, data: { emailVerifiedAt: now, lastLoginAt: now } });
    return n.count === 1;
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
  if (rateLimit(`forgot-email:${email}`, 3, HOUR)) after(() => sendReset(email, locale).catch(failed('password reset failed')));
  return { ok: true, message: email };
}

/** A link for a new password, after the answer, only to an active account that is its owner's own: confirmed, or
 *  registered by that person. A user added by a company who never confirmed gets none: the link would put the inbox's
 *  owner inside somebody else's company. */
async function sendReset(email: string, locale: Locale): Promise<void> {
  await purgeUnconfirmed();
  const user = await prisma.user.findUnique({ where: { email }, include: { company: { select: { active: true } } } });
  if (!user || !user.active || !user.company.active || !(user.emailVerifiedAt || user.termsAcceptedAt)) return;
  mailAccount(email, locale, { kind: 'reset', token: await issueToken(user.id, 'RESET_PASSWORD') });
  await audit({ companyId: user.companyId, userId: user.id, action: 'PASSWORD_RESET_REQUESTED', entity: 'User', entityId: user.id });
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
