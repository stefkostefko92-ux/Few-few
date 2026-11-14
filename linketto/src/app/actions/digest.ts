'use server';

import { redirect } from 'next/navigation';
import { dash } from '@/lib/dashboard-url';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { isLocale } from '@/i18n/locales';

// Включване/изключване на седмичния отчет „езикова дупка“ от таблото.
export async function setDigestAction(formData: FormData): Promise<void> {
  const rawLocale = String(formData.get('uiLocale') ?? 'en');
  const uiLocale = isLocale(rawLocale) ? rawLocale : 'en';
  const user = await getSessionUser();
  if (!user) redirect(`/${uiLocale}/login`);
  await prisma.user.update({
    where: { id: user.id },
    data: { digestOptOut: formData.get('digest') !== 'on' },
  });
  redirect(await dash(uiLocale));
}
