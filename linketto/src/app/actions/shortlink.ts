'use server';

import { redirect } from 'next/navigation';
import { dash } from '@/lib/dashboard-url';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { isSensitiveUrl } from '@/lib/brands';
import { getSessionUser } from '@/lib/auth';
import { isLocale } from '@/i18n/locales';
import {
  generateShortCode,
  isValidShortCode,
  normalizeShortCode,
} from '@/lib/shortlink';
import { lockedCount } from '@/lib/profile-lock';

function localeFrom(formData: FormData): string {
  const raw = String(formData.get('uiLocale') ?? 'en');
  return isLocale(raw) ? raw : 'en';
}

/** Таван на кратките линкове на профил (Разбивача т. 6). */
const MAX_SHORT_LINKS_PER_PROFILE = 100;

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
  if (!target.success || isSensitiveUrl(target.data)) {
    redirect(await dash(uiLocale, '?error=shortlink'));
  }

  // Разбивача т. 6: пренасочване от нашия домейн към произволен адрес — само от
  // акаунт с потвърден имейл (не от еднократни фишинг акаунти), с таван на профил.
  if (!user.emailVerifiedAt) redirect(await dash(uiLocale, '?error=shortlinkVerify'));
  const profile = await prisma.profile.findFirst({
    where: { id: profileId, userId: user.id },
    select: { id: true },
  });
  if (!profile) redirect(await dash(uiLocale, '?error=generic'));

  // Код: желан от потребителя или автоматично генериран (уникален).
  const wanted = normalizeShortCode(String(formData.get('code') ?? ''));
  let code = wanted;
  if (code && !isValidShortCode(code)) {
    redirect(await dash(uiLocale, '?error=shortlink'));
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
    if (!code) redirect(await dash(uiLocale, '?error=shortlink'));
  }
  // Таванът — броене и запис под заключения ред на профила (lib/profile-lock.ts).
  let outcome: 'ok' | 'limit' | 'taken' = 'ok';
  try {
    outcome = await prisma.$transaction(async (tx) => {
      if ((await lockedCount(tx, profile.id, 'shortLinks')) >= MAX_SHORT_LINKS_PER_PROFILE) return 'limit';
      await tx.shortLink.create({
        data: { profileId: profile.id, code, targetUrl: target.data },
      });
      return 'ok';
    });
  } catch {
    // Уникалност на кода — вече зает.
    outcome = 'taken';
  }
  if (outcome === 'limit') redirect(await dash(uiLocale, '?error=shortlinkLimit'));
  if (outcome === 'taken') redirect(await dash(uiLocale, '?error=shortlink'));
  redirect(await dash(uiLocale));
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
  redirect(await dash(uiLocale));
}
