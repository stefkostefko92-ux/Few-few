'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  createSession,
  destroySession,
  registerUser,
  verifyLogin,
} from '@/lib/auth';
import { isLocale } from '@/i18n/locales';
import { requestIp } from '@/lib/admin';
import { prisma } from '@/lib/db';
import { generateReferralCode } from '@/lib/referral';

// Сигурност на входа (декларирано в политиката): IP при успешен вход,
// пази се 90 дни. Чисти се при всяко ново записване — без отделен cron.
async function logLoginIp(userId: string): Promise<void> {
  const ip = await requestIp();
  if (!ip) return;
  await prisma.loginEvent
    .create({ data: { userId, ip: ip.slice(0, 64) } })
    .catch(() => undefined);
  await prisma.loginEvent
    .deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } },
    })
    .catch(() => undefined);
}

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8).max(200),
});

function localeFrom(formData: FormData): string {
  const raw = String(formData.get('locale') ?? 'en');
  return isLocale(raw) ? raw : 'en';
}

export async function registerAction(formData: FormData): Promise<void> {
  const locale = localeFrom(formData);
  const parsed = credentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    redirect(`/${locale}/register?error=generic`);
  }
  const name = String(formData.get('name') ?? '').trim().slice(0, 100) || null;
  const user = await registerUser(
    parsed.data.email,
    parsed.data.password,
    name,
    locale,
  );
  if (!user) {
    redirect(`/${locale}/register?error=exists`);
  }

  // Реферал: ако идва през нечий линк (?ref=CODE), запомняме поканилия.
  const refCode = String(formData.get('ref') ?? '').trim().slice(0, 32);
  const referrer = refCode
    ? await prisma.user.findUnique({
        where: { referralCode: refCode },
        select: { id: true },
      })
    : null;
  await prisma.user.update({
    where: { id: user.id },
    data: {
      referralCode: generateReferralCode(),
      // никой не може да покани сам себе си
      referredById:
        referrer && referrer.id !== user.id ? referrer.id : undefined,
    },
  });

  await logLoginIp(user.id);
  await createSession(user.id);
  redirect(`/${locale}/dashboard`);
}

export async function loginAction(formData: FormData): Promise<void> {
  const locale = localeFrom(formData);
  const parsed = credentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    redirect(`/${locale}/login?error=invalid`);
  }
  const user = await verifyLogin(parsed.data.email, parsed.data.password);
  if (!user) {
    redirect(`/${locale}/login?error=invalid`);
  }
  await logLoginIp(user.id);
  await createSession(user.id);
  redirect(`/${locale}/dashboard`);
}

export async function logoutAction(formData: FormData): Promise<void> {
  const locale = localeFrom(formData);
  await destroySession();
  redirect(`/${locale}`);
}
