'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { profileHasActiveBlock } from '@/lib/profile-blocks';
import { RETENTION_DAYS, daysAgo } from '@/lib/retention-days';
import { clientIp, rateLimit } from '@/lib/rate-limit';

const messageSchema = z.object({
  name: z.string().trim().max(100).optional(),
  email: z.string().trim().email().max(200).optional().or(z.literal('')),
  message: z.string().trim().min(1).max(2000),
});

// Публично действие (блок FORM) — без акаунт. Honeypot полето "website"
// реже най-простите ботове; съобщението отива при собственика на профила.
export async function submitContactAction(formData: FormData): Promise<void> {
  const slug = String(formData.get('slug') ?? '');
  const hl = String(formData.get('hl') ?? '');
  const back = `/u/${slug}${hl ? `?hl=${encodeURIComponent(hl)}` : ''}`;

  if (String(formData.get('website') ?? '') !== '') {
    redirect(back); // honeypot — тихо игнориране
  }
  // Срок на съхранение (чл. 13 ОРЗД): съобщения по-стари от 12 месеца
  // се чистят при всяко ново изпращане — без отделен cron.
  await prisma.contactMessage
    .deleteMany({
      where: { createdAt: { lt: daysAgo(RETENTION_DAYS.contactMessage) } },
    })
    .catch(() => undefined);

  const parsed = messageSchema.safeParse({
    name: formData.get('name') ?? undefined,
    email: formData.get('email') ?? '',
    message: formData.get('message'),
  });
  if (!parsed.success) {
    redirect(`${back}${hl ? '&' : '?'}formError=1`);
  }
  const profile = await prisma.profile.findUnique({
    where: { slug },
    select: { id: true, published: true, bannedAt: true },
  });
  // Само профил с активен FORM блок приема съобщения; лимит по IP.
  if (
    profile?.published &&
    !profile.bannedAt &&
    (await profileHasActiveBlock(profile.id, 'FORM')) &&
    rateLimit(`contact:${await clientIp()}`, 5, 10 * 60_000)
  ) {
    await prisma.contactMessage.create({
      data: {
        profileId: profile.id,
        name: parsed.data.name || null,
        email: parsed.data.email || null,
        message: parsed.data.message,
        locale: hl || null,
      },
    });
  }
  redirect(`${back}${hl ? '&' : '?'}sent=1`);
}
