'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { consumeUserToken, hashPassword } from '@/lib/auth';
import { isLocale } from '@/i18n/locales';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { ipBucket } from '@/lib/limiter';
import { notifyUserSecurity, sendPasswordResetEmail } from '@/lib/account-flows';
import { recordSecurityEvent } from '@/lib/security-events';
import { parseNewPassword } from '@/lib/password-policy';

// „Забравена парола“ (docs/password-reset-spec.md R1–R6).

function localeFrom(formData: FormData): string {
  const raw = String(formData.get('locale') ?? 'en');
  return isLocale(raw) ? raw : 'en';
}

const emailSchema = z.string().trim().toLowerCase().email().max(200);
const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{20,100}$/);

/** R1: един и същ отговор за съществуващ и несъществуващ адрес; лимит по IP и по имейл. */
export async function requestPasswordResetAction(formData: FormData): Promise<void> {
  const locale = localeFrom(formData);
  const email = emailSchema.safeParse(formData.get('email'));
  const done = `/${locale}/forgot?sent=1`;
  if (!email.success) redirect(`/${locale}/forgot?error=email`);
  const ipOk = rateLimit(`pw-reset-ip:${ipBucket(await clientIp())}`, 5, 60 * 60_000);
  const emailOk = rateLimit(`pw-reset:${email.data}`, 3, 60 * 60_000);
  if (!ipOk || !emailOk) redirect(done);
  const user = await prisma.user.findUnique({ where: { email: email.data }, select: { id: true, email: true } });
  if (user && !user.email.endsWith('@deleted.invalid')) {
    await sendPasswordResetEmail(user, locale);
    await recordSecurityEvent('password.reset_requested', { userId: user.id });
  }
  redirect(done);
}

/** R3–R5: токенът се изразходва при POST; всички сесии и висящи входове се прекратяват. */
export async function resetPasswordAction(formData: FormData): Promise<void> {
  const locale = localeFrom(formData);
  const token = tokenSchema.safeParse(formData.get('token'));
  if (!token.success) redirect(`/${locale}/reset?invalid=1`);
  const next = parseNewPassword(formData.get('next'), formData.get('confirm'));
  if (!next.ok) redirect(`/${locale}/reset?token=${encodeURIComponent(token.data)}&error=${next.reason}`);
  const user = await consumeUserToken(token.data, 'reset-password');
  if (!user) redirect(`/${locale}/reset?invalid=1`);
  const passwordHash = await hashPassword(next.password);
  const [, sessions] = await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
    prisma.loginChallenge.deleteMany({ where: { userId: user.id } }),
  ]);
  await recordSecurityEvent('password.reset', { userId: user.id, meta: { revoked: sessions.count } });
  await notifyUserSecurity(user, 'password');
  redirect(`/${locale}/login?ok=reset`);
}
