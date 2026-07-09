'use server';

import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { isLocale } from '@/i18n/locales';
import {
  generateSubscriberToken,
  isValidEmail,
  normalizeEmail,
} from '@/lib/newsletter';
import {
  broadcastHtml,
  broadcastSubject,
  sendEmail,
  subscribeConfirmHtml,
  subscribeConfirmSubject,
} from '@/lib/email';

function baseUrl(): string {
  return process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000';
}

function sellerName(
  translations: { locale: string; displayName: string }[],
  defaultLocale: string,
  slug: string,
): string {
  return (
    translations.find((t) => t.locale === defaultLocale)?.displayName ??
    translations[0]?.displayName ??
    slug
  );
}

// Публично: посетител се записва за бюлетина на създателя. GDPR двойно
// съгласие — създаваме непотвърден абонат и пращаме имейл за потвърждение.
export async function subscribeAction(formData: FormData): Promise<void> {
  const slug = String(formData.get('slug') ?? '');
  const hl = String(formData.get('hl') ?? '');
  const back = `/u/${slug}${hl ? `?hl=${encodeURIComponent(hl)}` : ''}`;
  // Honeypot срещу ботове (скрито поле „company").
  if (String(formData.get('company') ?? '').trim()) redirect(back);
  // Изрично съгласие (чекбокс) е задължително.
  if (formData.get('consent') !== 'on') {
    redirect(`${back}${hl ? '&' : '?'}subError=1`);
  }
  const email = normalizeEmail(String(formData.get('email') ?? ''));
  if (!isValidEmail(email)) {
    redirect(`${back}${hl ? '&' : '?'}subError=1`);
  }
  const locale = isLocale(hl) ? hl : null;

  const profile = await prisma.profile.findFirst({
    where: { slug, published: true, bannedAt: null },
    include: { translations: true },
  });
  if (!profile) redirect(`${back}${hl ? '&' : '?'}subError=1`);

  const existing = await prisma.subscriber.findUnique({
    where: { profileId_email: { profileId: profile.id, email } },
  });
  // Вече потвърден → нищо (не издаваме дали имейлът е записан).
  if (existing?.confirmedAt) {
    redirect(`${back}${hl ? '&' : '?'}subscribed=1`);
  }
  const token = existing?.token ?? generateSubscriberToken();
  if (existing) {
    await prisma.subscriber.update({
      where: { id: existing.id },
      data: { unsubscribedAt: null, locale: locale ?? existing.locale },
    });
  } else {
    await prisma.subscriber.create({
      data: { profileId: profile.id, email, locale, token },
    });
  }

  const who = sellerName(profile.translations, profile.defaultLocale, slug);
  const confirmUrl = `${baseUrl()}/u/${slug}/subscribe/confirm?token=${token}`;
  await sendEmail({
    to: email,
    subject: subscribeConfirmSubject(who, locale ?? undefined),
    html: subscribeConfirmHtml({
      sellerName: who,
      confirmUrl,
      locale: locale ?? undefined,
    }),
  });
  redirect(`${back}${hl ? '&' : '?'}subscribed=1`);
}

// Създателят разпраща бюлетин до потвърдените си абонати (на техния език
// няма — тялото е както е написано; всеки имейл носи линк за отписване).
export async function sendBroadcastAction(formData: FormData): Promise<void> {
  const rawLocale = String(formData.get('uiLocale') ?? 'en');
  const uiLocale = isLocale(rawLocale) ? rawLocale : 'en';
  const user = await getSessionUser();
  if (!user) redirect(`/${uiLocale}/login`);
  const profileId = String(formData.get('profileId') ?? '');
  const subject = String(formData.get('subject') ?? '').trim().slice(0, 150);
  const body = String(formData.get('body') ?? '').trim().slice(0, 5000);
  if (!subject || !body) {
    redirect(`/${uiLocale}/dashboard?error=broadcast`);
  }
  const profile = await prisma.profile.findFirst({
    where: { id: profileId, userId: user.id },
    include: { translations: true },
  });
  if (!profile) redirect(`/${uiLocale}/dashboard?error=generic`);

  const subscribers = await prisma.subscriber.findMany({
    where: {
      profileId: profile.id,
      confirmedAt: { not: null },
      unsubscribedAt: null,
    },
    select: { email: true, token: true, locale: true },
  });
  const who = sellerName(
    profile.translations,
    profile.defaultLocale,
    profile.slug,
  );

  // Изпращаме на партиди, за да не блокираме и да сме внимателни с лимитите.
  const chunkSize = 20;
  for (let i = 0; i < subscribers.length; i += chunkSize) {
    const chunk = subscribers.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map((sub) =>
        sendEmail({
          to: sub.email,
          subject: broadcastSubject(subject),
          html: broadcastHtml({
            sellerName: who,
            subject,
            body,
            unsubscribeUrl: `${baseUrl()}/u/${profile.slug}/unsubscribe?token=${sub.token}`,
            locale: sub.locale ?? undefined,
          }),
        }).catch(() => false),
      ),
    );
  }
  redirect(
    `/${uiLocale}/dashboard?broadcast=${subscribers.length}`,
  );
}
