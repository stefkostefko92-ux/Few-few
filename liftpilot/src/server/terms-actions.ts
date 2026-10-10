'use server';
// The owner accepts the terms in force for the company (the terms' page, after a change of TERMS_VERSION or for an
// owner who never accepted one): the same four confirmations as at the registration, kept with the date, the version
// and the SHA-256 of the text accepted.
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { getSessionUser } from '@/lib/auth';
import { TERMS_VERSION } from '@/lib/legal';
import { legalSha256 } from '@/lib/legal-text';
import { CONSENTS } from '@/lib/consents';
import { str, type FormState } from './form';

const consentSchema = z.object(Object.fromEntries(CONSENTS.map((k) => [k, z.literal('on')])));

export async function acceptTermsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await getSessionUser();
  if (!me || me.mustChangePassword || me.role !== 'OWNER') return { error: 'unauthorized' };
  if (!consentSchema.safeParse(Object.fromEntries(CONSENTS.map((k) => [k, str(fd, k)]))).success) return { error: 'consentRequired' };
  const l = str(fd, 'locale'), locale = isLocale(l) ? l : DEFAULT_LOCALE;
  await prisma.user.update({ where: { id: me.id }, data: { termsAcceptedAt: new Date(), termsVersion: TERMS_VERSION } });
  await audit({ companyId: me.companyId, userId: me.id, action: 'TERMS_ACCEPTED', entity: 'User', entityId: me.id,
    meta: { version: TERMS_VERSION, sha256: legalSha256(locale), locale, consents: [...CONSENTS] } });
  revalidatePath(`/${locale}/app`, 'layout');
  return { ok: true };
}
