'use server';
// The platform administrator's invitations to the beta (/app/admin, «Inviti alla beta»): a tester's address with the
// administrator's own note; the link goes by e-mail and is shown once on the screen, so the administrator can also hand
// it over another way. Sent again: a new link and a new month, the earlier link stops. Withdrawn: the invitation and the
// registrations waiting with it go. A used invitation stays as the record of the company it made.
import { revalidatePath } from 'next/cache';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/i18n/locales';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { getSessionUser, type SessionUser } from '@/lib/auth';
import { mailAccount } from '@/lib/account-mail';
import { betaInviteLink, createBetaInvite, renewBetaInvite, revokeBetaInvite } from '@/lib/beta-invites';
import { mailConfigured } from '@/lib/mail';
import { can } from '@/lib/rbac';
import { rateLimit } from '@/lib/ratelimit';
import { betaInviteSchema, idSchema } from '@/lib/schemas';
import { str, type FormState } from './form';

const HOUR = 60 * 60 * 1000;
const localeOf = (fd: FormData): Locale => { const l = str(fd, 'locale'); return isLocale(l) ? l : DEFAULT_LOCALE; };

async function admin(): Promise<SessionUser | null> {
  const user = await getSessionUser();
  return user && !user.mustChangePassword && can(user, 'platform:admin') ? user : null;
}

/** The invitation's e-mail, when the mail is on: whether it went (the screen shows the link either way). */
function mailInvite(email: string, token: string): boolean {
  if (!mailConfigured()) return false;
  mailAccount(email, DEFAULT_LOCALE, { kind: 'betaInvite', token });
  return true;
}

/** A new invitation: `secret` is its link, shown once; `pending` tells that no e-mail went (mail off). */
export async function createBetaInviteAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await admin();
  if (!me) return { error: 'forbidden' };
  if (!rateLimit(`beta-invites:${me.id}`, 60, HOUR)) return { error: 'rateLimited' };
  const parsed = betaInviteSchema.safeParse({ email: str(fd, 'email'), note: str(fd, 'note') });
  if (!parsed.success) return { error: 'invalidFields', fields: [...new Set(parsed.error.issues.map((i) => String(i.path[0])))] };
  const { email, note } = parsed.data;
  // the administrator may know: an address with an account would only get the «already registered» e-mail
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) return { error: 'emailTaken', fields: ['email'] };
  const { id, token } = await createBetaInvite(email, note, me.id);
  const mailed = mailInvite(email, token);
  await audit({ companyId: me.companyId, userId: me.id, action: 'BETA_INVITE_SENT', entity: 'BetaInvite', entityId: id, meta: { mailed } });
  revalidatePath(`/${localeOf(fd)}/app/admin`);
  return { ok: true, secret: betaInviteLink(token), message: email, pending: !mailed };
}

/** The same invitation with a new link (the earlier one stops) and BETA_INVITE_DAYS from now. */
export async function resendBetaInviteAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await admin();
  if (!me) return { error: 'forbidden' };
  if (!rateLimit(`beta-invites:${me.id}`, 60, HOUR)) return { error: 'rateLimited' };
  const id = idSchema.safeParse(str(fd, 'id'));
  if (!id.success) return { error: 'notFound' };
  const renewed = await renewBetaInvite(id.data);
  if (!renewed) return { error: 'notFound' };
  const mailed = mailInvite(renewed.email, renewed.token);
  await audit({ companyId: me.companyId, userId: me.id, action: 'BETA_INVITE_RESENT', entity: 'BetaInvite', entityId: id.data, meta: { mailed } });
  revalidatePath(`/${localeOf(fd)}/app/admin`);
  return { ok: true, secret: betaInviteLink(renewed.token), message: renewed.email, pending: !mailed };
}

export async function revokeBetaInviteAction(fd: FormData): Promise<void> {
  const me = await admin();
  const id = idSchema.safeParse(str(fd, 'id'));
  if (!me || !id.success) return;
  if (await revokeBetaInvite(id.data)) await audit({ companyId: me.companyId, userId: me.id, action: 'BETA_INVITE_REVOKED', entity: 'BetaInvite', entityId: id.data });
  revalidatePath(`/${localeOf(fd)}/app/admin`);
}
