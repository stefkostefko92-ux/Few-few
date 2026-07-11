'use server';

import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { isLocale } from '@/i18n/locales';
import { isValidEmail, normalizeEmail } from '@/lib/newsletter';

// Публично: посетител заявява час/среща (BOOKING блок). Само заявка — без
// плащане; създателят потвърждава извън платформата. Honeypot срещу ботове.
export async function submitBookingAction(formData: FormData): Promise<void> {
  const slug = String(formData.get('slug') ?? '');
  const hl = String(formData.get('hl') ?? '');
  const back = `/u/${slug}${hl ? `?hl=${encodeURIComponent(hl)}` : ''}`;
  if (String(formData.get('company') ?? '').trim()) redirect(back);

  const email = normalizeEmail(String(formData.get('email') ?? ''));
  const sep = back.includes('?') ? '&' : '?';
  if (!isValidEmail(email)) redirect(`${back}${sep}bookError=1`);

  const profile = await prisma.profile.findFirst({
    where: { slug, published: true, bannedAt: null },
    select: { id: true },
  });
  if (!profile) redirect(`${back}${sep}bookError=1`);

  // Срок на съхранение (чл. 13 ОРЗД): заявки по-стари от 12 месеца се
  // чистят при всяко ново изпращане — без отделен cron (като ContactMessage).
  await prisma.booking
    .deleteMany({
      where: {
        createdAt: { lt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) },
      },
    })
    .catch(() => undefined);

  await prisma.booking.create({
    data: {
      profileId: profile.id,
      name: String(formData.get('name') ?? '').trim().slice(0, 100) || null,
      email,
      preferredAt:
        String(formData.get('preferredAt') ?? '').trim().slice(0, 40) || null,
      message:
        String(formData.get('message') ?? '').trim().slice(0, 1000) || null,
      locale: isLocale(hl) ? hl : null,
    },
  });
  redirect(`${back}${sep}booked=1`);
}

// Създателят маркира заявка като обработена.
export async function resolveBookingAction(formData: FormData): Promise<void> {
  const rawLocale = String(formData.get('uiLocale') ?? 'en');
  const uiLocale = isLocale(rawLocale) ? rawLocale : 'en';
  const user = await getSessionUser();
  if (!user) redirect(`/${uiLocale}/login`);
  const bookingId = String(formData.get('bookingId') ?? '');
  await prisma.booking.updateMany({
    where: { id: bookingId, profile: { userId: user.id } },
    data: { status: 'done' },
  });
  redirect(`/${uiLocale}/dashboard`);
}
