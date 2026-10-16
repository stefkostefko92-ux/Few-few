'use server';

import { after } from 'next/server';
import { redirect } from 'next/navigation';
import { Prisma, type PendingRegistration } from '@prisma/client';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/i18n/locales';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { startSession } from '@/lib/auth';
import { mailAccount } from '@/lib/account-mail';
import { betaInviteOf, type ValidBetaInvite } from '@/lib/beta-invites';
import { REGISTER_CONSENTS } from '@/lib/consents';
import { registrationMode } from '@/lib/env';
import { log } from '@/lib/log';
import { mailConfigured } from '@/lib/mail';
import { hashPassword, verifyPassword } from '@/lib/password';
import { pastConfirmDeadline, purgeStale } from '@/lib/purge';
import { clientIp, rateLimit } from '@/lib/ratelimit';
import { addPending, confirmPending, pendingOf, type Confirmed } from '@/lib/registrations';
import { betaTokenSchema, forgotSchema, inviteAcceptSchema, registerSchema, resetSchema, verifySchema, type RegisterInput } from '@/lib/schemas';
import { inviteOfToken } from '@/lib/invites';
import { hashToken } from '@/lib/token-hash';
import { consumeToken, issueToken, tokenShapeOk, tokenUser } from '@/lib/tokens';
import { lockCompany, seatAvailable } from './billing';
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

// The limits of one network (src/lib/ratelimit.ts): five registrations an hour, counted only when the form is right, so a
// tester who mistypes, or colleagues behind one NAT, are not locked out; the wrong submissions have their own, wider
// count against abuse.
const REGISTER_IP_MAX = 5, REGISTER_INVALID_MAX = 30;

/** The beta invitation the form carries (`invito`, the token of the link's fragment), when it is good for this address: during the beta by invitation
 *  (REGISTRATION_MODE=invite) one is required; with the registration open, a good one is still recorded. */
async function invitationFor(fd: FormData, email: string): Promise<ValidBetaInvite | null> {
  const token = betaTokenSchema.safeParse(str(fd, 'invito'));
  const invite = token.success && token.data ? await betaInviteOf(token.data) : null;
  // the invitation's address went through emailSchema when it was made: the same normalization as `email`
  return invite && invite.email === email ? invite : null;
}

export async function registerAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const locale = localeOf(fd);
  if (!mailConfigured()) return { error: 'mailUnavailable' };
  const ip = await clientIp();
  const parsed = registerSchema.safeParse({
    company: str(fd, 'company'), vatNumber: str(fd, 'vatNumber'), city: str(fd, 'city'), name: str(fd, 'name'), email: str(fd, 'email'),
    password: str(fd, 'password'), confirm: str(fd, 'confirm'), ...Object.fromEntries(REGISTER_CONSENTS.map((k) => [k, str(fd, k)])),
  });
  if (!parsed.success) return rateLimit(`register-invalid-ip:${ip}`, REGISTER_INVALID_MAX, HOUR) ? formError(parsed.error.issues) : { error: 'rateLimitedHour' };
  const d = parsed.data;
  const invite = await invitationFor(fd, d.email);
  if (!invite && registrationMode() === 'invite') {
    return rateLimit(`register-invalid-ip:${ip}`, REGISTER_INVALID_MAX, HOUR) ? { error: 'inviteRequired' } : { error: 'rateLimitedHour' };
  }
  if (!rateLimit(`register-ip:${ip}`, REGISTER_IP_MAX, HOUR)) return { error: 'rateLimitedHour' };
  // at most three mails an hour to one address, whatever the reason; the page answers the same
  if (rateLimit(`register-email:${d.email}`, 3, HOUR)) after(() => register(d, locale, invite?.id ?? null).catch(failed('registration failed')));
  return { ok: true, message: d.email };
}

/** The registration, after the answer. An address whose account is confirmed or was ever used: its owner hears that
 *  it exists. Otherwise the registration waits for the proof of the address beside any other (src/lib/registrations.ts):
 *  nothing changes until the inbox's owner confirms one with its password — then, and only then, an account of the
 *  address never confirmed nor used (a colleague a company added) is released, and the e-mail says so beforehand. */
async function register(d: RegisterInput, locale: Locale, betaInviteId: string | null): Promise<void> {
  await purgeStale();
  const old = await prisma.user.findUnique({ where: { email: d.email }, select: { emailVerifiedAt: true, lastLoginAt: true } });
  if (old && (old.emailVerifiedAt || old.lastLoginAt)) {
    mailAccount(d.email, locale, { kind: 'exists' });
    return;
  }
  const token = await addPending(d, await hashPassword(d.password), locale, betaInviteId);
  mailAccount(d.email, locale, { kind: 'verify', token, terms: true, releases: old !== null });
}

/** What the link of the confirmation e-mail opens: a waiting registration (its page asks the specific approval of the
 *  clauses with the password), an account's link (the password only), or nothing good. Reading it changes nothing; its
 *  own count, so reading links never uses up the tries of confirming one. */
export async function verifyInfoAction(token: unknown): Promise<'registration' | 'account' | 'invalid' | 'limited'> {
  if (!rateLimit(`verify-info-ip:${await clientIp()}`, 40, WINDOW)) return 'limited';
  if (typeof token !== 'string' || !tokenShapeOk(token)) return 'invalid';
  if (await tokenUser(token, 'VERIFY_EMAIL')) return 'account';
  return (await pendingOf(token)) ? 'registration' : 'invalid';
}

// The link of the e-mail and the password: the address is proven by the inbox, the account or the registration by the
// password (a link alone would confirm what somebody else made with this address). A link of an account (a colleague
// a company added, a registration from before they waited apart) confirms it; a link of a waiting registration makes
// the company and its owner, with the specific approval of the clauses (arts. 1341–1342 c.c.) given there: the link
// and the password are its simple electronic signature (docs/terms-changes.md).
export async function verifyEmailAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const locale = localeOf(fd);
  if (!rateLimit(`verify-ip:${await clientIp()}`, 20, WINDOW)) return { error: 'rateLimited' };
  const parsed = verifySchema.safeParse({ token: str(fd, 'token'), password: str(fd, 'password'), clauses: str(fd, 'clauses') });
  if (!parsed.success) return { error: 'invalidLink' };
  const { token, password, clauses } = parsed.data;
  const id = await tokenUser(token, 'VERIFY_EMAIL');
  if (id) return confirmAccount(id, token, password, locale);
  const pending = await pendingOf(token);
  if (!pending) return { error: 'invalidLink' };
  // the approval before anything else: without it nothing is checked nor used
  if (clauses !== 'on') return { error: 'consentRequired', fields: ['clauses'] };
  return confirmRegistration(pending, token, password, locale);
}

async function confirmAccount(id: string, token: string, password: string, locale: Locale): Promise<FormState> {
  if (!rateLimit(`verify-user:${id}`, 8, WINDOW)) return { error: 'rateLimited' };
  const user = await prisma.user.findUnique({ where: { id }, include: { company: { select: { active: true } } } });
  if (!user || !user.active || !user.company.active) return { error: 'invalidLink' };
  if (!(await verifyPassword(password, user.passwordHash))) return { error: 'verifyWrongPassword' };
  const now = new Date();
  const done = await prisma.$transaction(async (tx) => {
    if ((await consumeToken(tx, token, 'VERIFY_EMAIL')) !== user.id) return false;
    // the password checked above must still be the account's: one changed meanwhile confirms nothing
    const n = await tx.user.updateMany({ where: { id: user.id, emailVerifiedAt: null, passwordHash: user.passwordHash }, data: { emailVerifiedAt: now, lastLoginAt: now } });
    return n.count === 1;
  });
  if (!done) return { error: 'invalidLink' };
  await startSession(user);
  await audit({ companyId: user.companyId, userId: user.id, action: 'EMAIL_VERIFIED', entity: 'User', entityId: user.id });
  redirect(`/${locale}/app`);
}

async function confirmRegistration(p: PendingRegistration, token: string, password: string, locale: Locale): Promise<FormState> {
  if (!rateLimit(`verify-pending:${p.id}`, 8, WINDOW)) return { error: 'rateLimited' };
  if (!(await verifyPassword(password, p.passwordHash))) return { error: 'verifyWrongPassword' };
  let done: Confirmed;
  try {
    done = await confirmPending(p, token);
  } catch (e) {
    // two registrations of the address confirmed at the same moment: the other one made the account
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { error: 'emailTaken' };
    throw e;
  }
  if (!done.ok) return { error: done.reason === 'taken' ? 'emailTaken' : 'invalidLink' };
  const { user, released } = done, approvedAt = new Date();
  // the company that had added the address hears why its colleague is gone
  if (released?.companyId) await audit({ companyId: released.companyId, userId: null, action: 'USER_RELEASED', entity: 'User', entityId: released.id });
  // what was accepted at the registration, and the clauses approved through the link with the password, kept with the
  // account (the version is the registration's: an owner who registered under an earlier one accepts the one in force
  // on the terms' page, src/lib/legal.ts termsStateOf)
  await audit({ companyId: user.companyId, userId: user.id, action: 'USER_REGISTERED', entity: 'User', entityId: user.id,
    meta: { terms: p.termsVersion, sha256: p.termsSha256, locale: p.locale, consents: [...REGISTER_CONSENTS], clausesApprovedAt: approvedAt.toISOString(),
      clausesVia: 'email-link+password', registeredAt: p.createdAt.toISOString(), released: released !== null, betaInvite: p.betaInviteId !== null } });
  await audit({ companyId: user.companyId, userId: user.id, action: 'EMAIL_VERIFIED', entity: 'User', entityId: user.id });
  log.info({ userId: user.id }, 'registered');
  await startSession(user);
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
  await purgeStale();
  const user = await prisma.user.findUnique({ where: { email }, include: { company: { select: { active: true } } } });
  if (!user || !user.active || !user.company.active || !(user.emailVerifiedAt || user.termsAcceptedAt)) return;
  // a registration never confirmed is past its time: no link keeps it (src/lib/purge.ts)
  if (!user.emailVerifiedAt && pastConfirmDeadline(user.createdAt)) return;
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
    await tx.session.deleteMany({ where: { userId: id } });
    return u;
  });
  if (!user) return { error: 'invalidLink' };
  await audit({ companyId: user.companyId, userId: user.id, action: 'PASSWORD_RESET', entity: 'User', entityId: user.id });
  redirect(`/${locale}/login?reset=1`);
}

/** What the link of an invitation opens: the inviting company, the address and the role; nothing for a link that is not
 *  good (unknown, ended, malformed). Reading it changes nothing. */
export async function inviteInfoAction(token: string): Promise<{ company: string; email: string; name: string; role: string } | null> {
  // its own count: reading links never uses up the tries of accepting one
  if (!rateLimit(`invite-info-ip:${await clientIp()}`, 40, WINDOW)) return null;
  const invite = await inviteOfToken(token);
  return invite ? { company: invite.company.name, email: invite.email, name: invite.name, role: invite.role } : null;
}

/** What a beta invitation's link opens (src/components/RegisterEntry.tsx): the invited address, or null for a link that
 *  is not good (unknown, used, past its end, malformed) or past this network's count. Reading it changes nothing; the
 *  registration checks the invitation again (registerAction). */
export async function betaInviteInfoAction(token: unknown): Promise<string | null> {
  // its own count, like inviteInfoAction: reading links never uses up the tries of registering
  if (!rateLimit(`beta-info-ip:${await clientIp()}`, 40, WINDOW)) return null;
  const parsed = betaTokenSchema.safeParse(token);
  if (!parsed.success || !parsed.data) return null;
  return (await betaInviteOf(parsed.data))?.email ?? null;
}

class NoSeat extends Error {}

/** The colleague accepts the invitation with the password chosen: the account is made confirmed (the link proved the
 *  address) and the invitation goes. Other companies' invitations of the address stay until their end — taking one
 *  meets the account (one address, one company) —, so no company learns that the address joined another. An address
 *  that has an account meanwhile cannot take it; a company without a free slot keeps the invitation waiting; the same
 *  link taken twice at once makes one account. */
export async function acceptInviteAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const locale = localeOf(fd);
  if (!rateLimit(`invite-accept-ip:${await clientIp()}`, 20, WINDOW)) return { error: 'rateLimited' };
  const parsed = inviteAcceptSchema.safeParse({ token: str(fd, 'token'), next: str(fd, 'next'), confirm: str(fd, 'confirm') });
  if (!parsed.success) return formError(parsed.error.issues);
  const passwordHash = await hashPassword(parsed.data.next), now = new Date();
  let user;
  try {
    user = await prisma.$transaction(async (tx) => {
      const invite = await tx.invite.findUnique({ where: { tokenHash: hashToken(parsed.data.token) }, include: { company: { select: { active: true } } } });
      if (!invite || invite.expiresAt <= now || !invite.company.active) return null;
      // the company first, as everything that counts its slots locks it (billing.ts), then the invitation: its own slot
      // becomes the colleague's, without it the company must still have one free; gone meanwhile, the link is used
      await lockCompany(tx, invite.companyId);
      if ((await tx.invite.deleteMany({ where: { id: invite.id } })).count !== 1) return null;
      if (!(await seatAvailable(tx, invite.companyId))) throw new NoSeat();
      return tx.user.create({ data: { companyId: invite.companyId, email: invite.email, name: invite.name, role: invite.role,
        // an invitation made in English or Bulgarian (before 2026-10-12) still gives an account in Italian, the only language
        passwordHash, mustChangePassword: false, locale: isLocale(invite.locale) ? invite.locale : DEFAULT_LOCALE, emailVerifiedAt: now, lastLoginAt: now } });
    });
  } catch (e) {
    // the invitee can neither buy seats nor free one: their own words (errors.inviteNoSeats), the link stays valid
    if (e instanceof NoSeat) return { error: 'inviteNoSeats' };
    // the address got an account meanwhile (a registration, another invitation): one address, one company
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { error: 'inviteTaken' };
    throw e;
  }
  if (!user) return { error: 'invalidLink' };
  await startSession(user);
  await audit({ companyId: user.companyId, userId: user.id, action: 'USER_CREATED', entity: 'User', entityId: user.id, meta: { role: user.role, invite: true } });
  redirect(`/${locale}/app`);
}
