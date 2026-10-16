'use server';
// The owner accepts the terms in force for the company (the terms' page, after a change of TERMS_VERSION or for an
// owner who never accepted one): the same four confirmations as the registration asks (three on its form, the clauses
// with the e-mail link), kept with the date, the version and the SHA-256 of the text accepted. The specific approval of
// the clauses (arts. 1341–1342 c.c.) is signed with the current password, not a bare tick (docs/terms-changes.md).
// An owner who accepted the version in force with a bare tick (before round 48) approves the clauses once more, alone,
// with the password (approveClausesAction, the same page). The acceptance and its record in the activity log — with the
// SHA-256 of the clauses as shown and their articles — commit together or not at all.
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/i18n/locales';
import { prisma } from '@/lib/db';
import { auditTx } from '@/lib/audit';
import { getSessionUser, type SessionUser } from '@/lib/auth';
import { TERMS_VERSION } from '@/lib/legal';
import { clausesProof, legalSha256 } from '@/lib/legal-text';
import { CONSENTS } from '@/lib/consents';
import { verifyPassword } from '@/lib/password';
import { rateLimit } from '@/lib/ratelimit';
import { str, type FormState } from './form';

const WINDOW = 15 * 60 * 1000;
const consentSchema = z.object(Object.fromEntries(CONSENTS.map((k) => [k, z.literal('on')])));
const passwordSchema = z.string().min(1).max(200);

const localeOf = (fd: FormData): Locale => { const l = str(fd, 'locale'); return isLocale(l) ? l : DEFAULT_LOCALE; };

/** The owner, signed in and not asked to change the password first; null for anyone else. */
async function owner(): Promise<SessionUser | null> {
  const me = await getSessionUser();
  return me && !me.mustChangePassword && me.role === 'OWNER' ? me : null;
}

/** The password of the form checked against the owner's: null when right, else the answer. Its own count per user (the
 *  same for both actions): the password is tried here as at the sign-in. */
async function passwordFault(me: SessionUser, fd: FormData): Promise<FormState | null> {
  const password = passwordSchema.safeParse(str(fd, 'password'));
  if (!password.success) return { error: 'termsPasswordRequired', fields: ['password'] };
  const row = await prisma.user.findUnique({ where: { id: me.id }, select: { passwordHash: true } });
  return row && (await verifyPassword(password.data, row.passwordHash)) ? null : { error: 'termsWrongPassword', fields: ['password'] };
}

export async function acceptTermsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await owner();
  if (!me) return { error: 'unauthorized' };
  if (!rateLimit(`terms-user:${me.id}`, 8, WINDOW)) return { error: 'rateLimited' };
  const missing = CONSENTS.filter((k) => str(fd, k) !== 'on');
  if (!consentSchema.safeParse(Object.fromEntries(CONSENTS.map((k) => [k, str(fd, k)]))).success) return { error: 'consentRequired', fields: str(fd, 'password') ? missing : [...missing, 'password'] };
  const fault = await passwordFault(me, fd);
  if (fault) return fault;
  const locale = localeOf(fd), now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: me.id }, data: { termsAcceptedAt: now, termsVersion: TERMS_VERSION, clausesApprovedAt: now } });
    await auditTx(tx, { companyId: me.companyId, userId: me.id, action: 'TERMS_ACCEPTED', entity: 'User', entityId: me.id,
      meta: { version: TERMS_VERSION, sha256: legalSha256(locale), locale, consents: [...CONSENTS], clausesApprovedAt: now.toISOString(), clausesVia: 'password',
        ...clausesProof(locale) } });
  });
  revalidatePath(`/${locale}/app`, 'layout');
  return { ok: true };
}

/** The clauses approved once more, alone, with the password: an owner who accepted the version in force with a bare tick
 *  (clausesApprovedAt null). Only for the version in force — an owner bound by an earlier one accepts the new one with
 *  the clauses (acceptTermsAction) —; approved already, nothing more is written. */
export async function approveClausesAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await owner();
  if (!me) return { error: 'unauthorized' };
  if (!rateLimit(`terms-user:${me.id}`, 8, WINDOW)) return { error: 'rateLimited' };
  if (str(fd, 'clauses') !== 'on') return { error: 'consentRequired', fields: str(fd, 'password') ? ['clauses'] : ['clauses', 'password'] };
  const fault = await passwordFault(me, fd);
  if (fault) return fault;
  const locale = localeOf(fd), now = new Date();
  const done = await prisma.$transaction(async (tx) => {
    const n = await tx.user.updateMany({ where: { id: me.id, role: 'OWNER', termsVersion: TERMS_VERSION, clausesApprovedAt: null }, data: { clausesApprovedAt: now } });
    if (n.count !== 1) return false;
    await auditTx(tx, { companyId: me.companyId, userId: me.id, action: 'CLAUSES_APPROVED', entity: 'User', entityId: me.id,
      meta: { version: TERMS_VERSION, locale, clausesApprovedAt: now.toISOString(), clausesVia: 'password', ...clausesProof(locale) } });
    return true;
  });
  if (!done) {
    // approved meanwhile (another tab): nothing to do; bound by an earlier version: the terms' page asks for all of it
    const row = await prisma.user.findUnique({ where: { id: me.id }, select: { clausesApprovedAt: true, termsVersion: true } });
    if (!(row?.clausesApprovedAt && row.termsVersion === TERMS_VERSION)) return { error: 'unauthorized' };
  }
  revalidatePath(`/${locale}/app`, 'layout');
  return { ok: true };
}
