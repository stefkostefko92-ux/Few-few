'use server';

import { redirect } from 'next/navigation';
import { dash } from '@/lib/dashboard-url';
import { prisma } from '@/lib/db';
import { profileHasActiveBlock } from '@/lib/profile-blocks';
import { RETENTION_DAYS, daysAgo } from '@/lib/retention-days';
import { getSessionUser } from '@/lib/auth';
import { clientIp, rateLimit } from '@/lib/rate-limit';
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
  // Лимит по IP: формата праща писма до чужди адреси от нашия домейн.
  if (!rateLimit(`subscribe-ip:${await clientIp()}`, 6, 10 * 60_000)) {
    redirect(`${back}${hl ? '&' : '?'}subError=1`);
  }

  const profile = await prisma.profile.findFirst({
    where: { slug, published: true, bannedAt: null },
    include: { translations: true },
  });
  if (!profile) redirect(`${back}${hl ? '&' : '?'}subError=1`);
  // Само профил с активен EMAIL блок събира абонати.
  if (!(await profileHasActiveBlock(profile.id, 'EMAIL'))) redirect(`${back}${hl ? '&' : '?'}subError=1`);

  // Срок на съхранение: непотвърдените записвания по-стари от 30 дни се
  // изтриват (чл. 5(1)(д) ОРЗД; лениво, без отделен cron).
  await prisma.subscriber
    .deleteMany({
      where: {
        confirmedAt: null,
        createdAt: { lt: daysAgo(RETENTION_DAYS.unconfirmedSubscriber) },
      },
    })
    .catch(() => undefined);

  const existing = await prisma.subscriber.findUnique({
    where: { profileId_email: { profileId: profile.id, email } },
  });
  // Вече потвърден и неотписан → нищо (не издаваме дали имейлът е записан).
  if (existing?.confirmedAt && !existing.unsubscribedAt) {
    redirect(`${back}${hl ? '&' : '?'}subscribed=1`);
  }
  // Не повече от едно писмо за потвърждение на 10 мин към един и същ адрес.
  if (!rateLimit(`subscribe-mail:${profile.id}:${email}`, 1, 10 * 60_000)) {
    redirect(`${back}${hl ? '&' : '?'}subscribed=1`);
  }
  const token = existing?.token ?? generateSubscriberToken();
  if (existing) {
    // Отписан по-рано (стар ред) → ново потвърждение; confirmedAt се нулира.
    await prisma.subscriber.update({
      where: { id: existing.id },
      data: {
        unsubscribedAt: null,
        confirmedAt: null,
        locale: locale ?? existing.locale,
      },
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
    redirect(await dash(uiLocale, '?error=broadcast'));
  }
  const profile = await prisma.profile.findFirst({
    where: { id: profileId, userId: user.id },
    include: { translations: true },
  });
  if (!profile) redirect(await dash(uiLocale, '?error=generic'));

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
  let sent = 0;
  for (let i = 0; i < subscribers.length; i += chunkSize) {
    const chunk = subscribers.slice(i, i + chunkSize);
    const results = await Promise.all(
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
    sent += results.filter(Boolean).length;
  }
  // Брои се САМО реално изпратеното (без RESEND_API_KEY sendEmail връща
  // false) — иначе дашбордът лъже „изпратен до N“ (одит L2).
  if (subscribers.length > 0 && sent === 0) {
    redirect(await dash(uiLocale, '?error=broadcast'));
  }
  redirect(await dash(uiLocale, `?broadcast=${sent}`));
}

// Създателят изтрива абонат (право на изтриване / чистене на аудиторията).
export async function deleteSubscriberAction(
  formData: FormData,
): Promise<void> {
  const rawLocale = String(formData.get('uiLocale') ?? 'en');
  const uiLocale = isLocale(rawLocale) ? rawLocale : 'en';
  const user = await getSessionUser();
  if (!user) redirect(`/${uiLocale}/login`);
  const subscriberId = String(formData.get('subscriberId') ?? '');
  await prisma.subscriber.deleteMany({
    where: { id: subscriberId, profile: { userId: user.id } },
  });
  redirect(await dash(uiLocale));
}
