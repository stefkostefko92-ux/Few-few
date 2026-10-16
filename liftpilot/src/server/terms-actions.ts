'use server';
// The owner accepts the terms in force for the company (the terms' page, after a change of TERMS_VERSION or for an
// owner who never accepted one): the same four confirmations as the registration asks (three on its form, the clauses
// with the e-mail link), kept with the date, the version and the SHA-256 of the text accepted. The specific approval of
// the clauses (arts. 1341–1342 c.c.) is signed with the current password, not a bare tick (docs/terms-changes.md).
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { getSessionUser } from '@/lib/auth';
import { TERMS_VERSION } from '@/lib/legal';
import { legalSha256 } from '@/lib/legal-text';
import { CONSENTS } from '@/lib/consents';
import { verifyPassword } from '@/lib/password';
import { rateLimit } from '@/lib/ratelimit';
import { str, type FormState } from './form';

const WINDOW = 15 * 60 * 1000;
const consentSchema = z.object(Object.fromEntries(CONSENTS.map((k) => [k, z.literal('on')])));
const passwordSchema = z.string().min(1).max(200);

export async function acceptTermsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await getSessionUser();
  if (!me || me.mustChangePassword || me.role !== 'OWNER') return { error: 'unauthorized' };
  // its own count per user: the password is tried here as at the sign-in
  if (!rateLimit(`terms-user:${me.id}`, 8, WINDOW)) return { error: 'rateLimited' };
  const missing = CONSENTS.filter((k) => str(fd, k) !== 'on');
  if (!consentSchema.safeParse(Object.fromEntries(CONSENTS.map((k) => [k, str(fd, k)]))).success) return { error: 'consentRequired', fields: missing };
  const password = passwordSchema.safeParse(str(fd, 'password'));
  if (!password.success) return { error: 'termsPasswordRequired', fields: ['password'] };
  const row = await prisma.user.findUnique({ where: { id: me.id }, select: { passwordHash: true } });
  if (!row || !(await verifyPassword(password.data, row.passwordHash))) return { error: 'termsWrongPassword', fields: ['password'] };
  const l = str(fd, 'locale'), locale = isLocale(l) ? l : DEFAULT_LOCALE, now = new Date();
  await prisma.user.update({ where: { id: me.id }, data: { termsAcceptedAt: now, termsVersion: TERMS_VERSION } });
  await audit({ companyId: me.companyId, userId: me.id, action: 'TERMS_ACCEPTED', entity: 'User', entityId: me.id,
    meta: { version: TERMS_VERSION, sha256: legalSha256(locale), locale, consents: [...CONSENTS], clausesApprovedAt: now.toISOString(), clausesVia: 'password' } });
  revalidatePath(`/${locale}/app`, 'layout');
  return { ok: true };
}
