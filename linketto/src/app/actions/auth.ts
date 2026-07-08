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
  await createSession(user.id);
  redirect(`/${locale}/dashboard`);
}

export async function logoutAction(formData: FormData): Promise<void> {
  const locale = localeFrom(formData);
  await destroySession();
  redirect(`/${locale}`);
}
