'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { isLocale } from '@/i18n/locales';
import type { Plan } from '@prisma/client';

// Админ действия — само за ADMIN_EMAILS. Всяко действие проверява наново.

function localeFrom(formData: FormData): string {
  const raw = String(formData.get('uiLocale') ?? 'en');
  return isLocale(raw) ? raw : 'en';
}

const PLAN_VALUES = ['FREE', 'PRO', 'BUSINESS', 'FOUNDER'] as const;

/** Бан/отбан на профил: баннат = невидим публично (без публичен банер). */
export async function setProfileBanAction(formData: FormData): Promise<void> {
  const uiLocale = localeFrom(formData);
  await requireAdmin(uiLocale);
  const profileId = String(formData.get('profileId') ?? '');
  const ban = formData.get('ban') === '1';
  await prisma.profile.updateMany({
    where: { id: profileId },
    data: { bannedAt: ban ? new Date() : null },
  });
  redirect(`/${uiLocale}/admin?ok=1`);
}

const updateUserSchema = z.object({
  userId: z.string().min(1),
  email: z.string().trim().toLowerCase().email().max(200),
  name: z.string().trim().max(100),
  plan: z.enum(PLAN_VALUES),
});

/** Пълна промяна на данните на потребител (имейл, име, план). */
export async function adminUpdateUserAction(
  formData: FormData,
): Promise<void> {
  const uiLocale = localeFrom(formData);
  await requireAdmin(uiLocale);
  const parsed = updateUserSchema.safeParse({
    userId: formData.get('userId'),
    email: formData.get('email'),
    name: formData.get('name') ?? '',
    plan: formData.get('plan'),
  });
  if (!parsed.success) {
    redirect(`/${uiLocale}/admin?error=input`);
  }
  const { userId, email, name, plan } = parsed.data;
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { email, name: name || null, plan: plan as Plan },
    });
  } catch (error) {
    // P2002 = зает имейл
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'P2002'
    ) {
      redirect(`/${uiLocale}/admin?error=email`);
    }
    throw error;
  }
  redirect(`/${uiLocale}/admin?ok=1`);
}

const passwordSchema = z.object({
  userId: z.string().min(1),
  password: z.string().min(8).max(200),
});

/** Ръчна нова парола (старата не се вижда никъде — пази се само хеш).
    Всички активни сесии на потребителя се прекратяват. */
export async function adminSetPasswordAction(
  formData: FormData,
): Promise<void> {
  const uiLocale = localeFrom(formData);
  await requireAdmin(uiLocale);
  const parsed = passwordSchema.safeParse({
    userId: formData.get('userId'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    redirect(`/${uiLocale}/admin?error=password`);
  }
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await prisma.user.update({
    where: { id: parsed.data.userId },
    data: { passwordHash },
  });
  await prisma.session.deleteMany({
    where: { userId: parsed.data.userId },
  });
  redirect(`/${uiLocale}/admin?ok=1`);
}
