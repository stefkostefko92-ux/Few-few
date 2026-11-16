'use server';

import { redirect } from 'next/navigation';
import { dash } from '@/lib/dashboard-url';
import { prisma } from '@/lib/db';
import { profileHasActiveBlock } from '@/lib/profile-blocks';
import { RETENTION_DAYS, daysAgo } from '@/lib/retention-days';
import { getSessionUser } from '@/lib/auth';
import { isLocale } from '@/i18n/locales';
import { isValidEmail, normalizeEmail } from '@/lib/newsletter';
import { clientIp, rateLimit } from '@/lib/rate-limit';

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
  // Само профил с активен BOOKING блок приема заявки; лимит по IP.
  if (
    !(await profileHasActiveBlock(profile.id, 'BOOKING')) ||
    !rateLimit(`booking:${await clientIp()}`, 5, 10 * 60_000)
  ) {
    redirect(`${back}${sep}bookError=1`);
  }

  // Срок на съхранение (чл. 13 ОРЗД): заявки по-стари от 12 месеца се
  // чистят при всяко ново изпращане — без отделен cron (като ContactMessage).
  await prisma.booking
    .deleteMany({
      where: {
        createdAt: { lt: daysAgo(RETENTION_DAYS.booking) },
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
  redirect(await dash(uiLocale));
}
