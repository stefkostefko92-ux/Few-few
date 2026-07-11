'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { isLocale } from '@/i18n/locales';
import {
  generateShortCode,
  isValidShortCode,
  normalizeShortCode,
} from '@/lib/shortlink';

function localeFrom(formData: FormData): string {
  const raw = String(formData.get('uiLocale') ?? 'en');
  return isLocale(raw) ? raw : 'en';
}

const targetSchema = z
  .string()
  .trim()
  .url()
  .max(2000)
  .refine((value) => /^https?:\/\//.test(value));

export async function addShortLinkAction(formData: FormData): Promise<void> {
  const uiLocale = localeFrom(formData);
  const user = await getSessionUser();
  if (!user) redirect(`/${uiLocale}/login`);
  const profileId = String(formData.get('profileId') ?? '');
  const target = targetSchema.safeParse(formData.get('targetUrl'));
  if (!target.success) redirect(`/${uiLocale}/dashboard?error=shortlink`);

  const profile = await prisma.profile.findFirst({
    where: { id: profileId, userId: user.id },
    select: { id: true },
  });
  if (!profile) redirect(`/${uiLocale}/dashboard?error=generic`);

  // Код: желан от потребителя или автоматично генериран (уникален).
  const wanted = normalizeShortCode(String(formData.get('code') ?? ''));
  let code = wanted;
  if (code && !isValidShortCode(code)) {
    redirect(`/${uiLocale}/dashboard?error=shortlink`);
  }
  if (!code) {
    for (let i = 0; i < 5; i++) {
      const candidate = generateShortCode();
      const exists = await prisma.shortLink.findUnique({
        where: { code: candidate },
        select: { id: true },
      });
      if (!exists) {
        code = candidate;
        break;
      }
    }
    if (!code) redirect(`/${uiLocale}/dashboard?error=shortlink`);
  }
  try {
    await prisma.shortLink.create({
      data: { profileId, code, targetUrl: target.data },
    });
  } catch {
    // Уникалност на кода — вече зает.
    redirect(`/${uiLocale}/dashboard?error=shortlink`);
  }
  redirect(`/${uiLocale}/dashboard`);
}

export async function deleteShortLinkAction(
  formData: FormData,
): Promise<void> {
  const uiLocale = localeFrom(formData);
  const user = await getSessionUser();
  if (!user) redirect(`/${uiLocale}/login`);
  const id = String(formData.get('shortLinkId') ?? '');
  await prisma.shortLink.deleteMany({
    where: { id, profile: { userId: user.id } },
  });
  redirect(`/${uiLocale}/dashboard`);
}
