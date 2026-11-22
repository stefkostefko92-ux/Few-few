import 'server-only';
import { headers } from 'next/headers';
import type { User } from '@prisma/client';
import { createUserToken } from '@/lib/auth';
import { emailReady, sendEmail } from '@/lib/email';
import { resetPasswordMessage, securityNoticeMessage, verifyEmailMessage, type SecurityNoticeKind } from '@/lib/account-emails';
import { RESET_TTL_MS } from '@/lib/password-policy';
import { requestCountry } from '@/lib/geoip';
import { SITE_URL } from '@/lib/seo';

const VERIFY_TTL_MS = 48 * 60 * 60 * 1000;

/** Писмо за потвърждение на имейла (еднократна връзка, 48 ч.). false = не е тръгнало. */
export async function sendVerificationEmail(
  user: Pick<User, 'id' | 'email' | 'locale'> & { termsVersion?: string | null },
): Promise<boolean> {
  if (!(await emailReady())) return false;
  const token = await createUserToken(user.id, 'verify-email', VERIFY_TTL_MS);
  const base = SITE_URL.replace(/\/$/, '');
  const url = `${base}/api/verify-email?token=${token}`;
  // ЗЕТ чл. 10, ал. 2 / чл. 9: потвърждение на регистрацията + приетите ОУ (версия, връзка).
  const mail = verifyEmailMessage({
    locale: user.locale,
    url,
    termsUrl: `${base}/${user.locale}/terms`,
    termsVersion: user.termsVersion ?? undefined,
  });
  return sendEmail({ to: user.email, subject: mail.subject, html: mail.html, tag: 'verify' }).catch(() => false);
}

/** Писмо с връзка за нова парола (docs/password-reset-spec.md R2): 60 мин, еднократна. */
export async function sendPasswordResetEmail(user: Pick<User, 'id' | 'email'>, locale: string): Promise<boolean> {
  if (!(await emailReady())) return false;
  const token = await createUserToken(user.id, 'reset-password', RESET_TTL_MS);
  const url = `${SITE_URL.replace(/\/$/, '')}/${locale}/reset?token=${token}`;
  const mail = resetPasswordMessage({ locale, url });
  return sendEmail({ to: user.email, subject: mail.subject, html: mail.html, tag: 'password-reset' }).catch(() => false);
}

/** Известие до самия потребител при промяна по сигурността (най-добро усилие). */
export async function notifyUserSecurity(
  user: Pick<User, 'email' | 'locale'>,
  kind: SecurityNoticeKind,
  left?: number,
): Promise<void> {
  if (!(await emailReady())) return;
  const mail = securityNoticeMessage({ locale: user.locale, kind, left });
  await sendEmail({ to: user.email, subject: mail.subject, html: mail.html, tag: 'security' }).catch(() => false);
}

/** Държавата на заявката (за дневника — без IP). */
export async function requestCountryCode(): Promise<string | null> {
  return requestCountry(await headers());
}
