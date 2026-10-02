'use server';
// The owner accepts the terms in force for the company (the terms' page after a change of TERMS_VERSION): the same
// three confirmations as at the registration, kept with their date and version.
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { getSessionUser } from '@/lib/auth';
import { TERMS_VERSION } from '@/lib/legal';
import { str, type FormState } from './form';

const on = z.literal('on');
const consentSchema = z.object({ privacy: on, terms: on, clauses: on });

export async function acceptTermsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await getSessionUser();
  if (!me || me.mustChangePassword) return { error: 'unauthorized' };
  if (!consentSchema.safeParse({ privacy: str(fd, 'privacy'), terms: str(fd, 'terms'), clauses: str(fd, 'clauses') }).success) return { error: 'consentRequired' };
  await prisma.user.update({ where: { id: me.id }, data: { termsAcceptedAt: new Date(), termsVersion: TERMS_VERSION } });
  await audit({ companyId: me.companyId, userId: me.id, action: 'TERMS_ACCEPTED', entity: 'User', entityId: me.id, meta: { version: TERMS_VERSION } });
  const l = str(fd, 'locale');
  revalidatePath(`/${isLocale(l) ? l : DEFAULT_LOCALE}/app`, 'layout');
  return { ok: true };
}
