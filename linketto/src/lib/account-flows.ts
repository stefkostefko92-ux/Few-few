import 'server-only';
import { headers } from 'next/headers';
import type { User } from '@prisma/client';
import { createUserToken } from '@/lib/auth';
import { emailReady, sendEmail } from '@/lib/email';
import { securityNoticeMessage, verifyEmailMessage, type SecurityNoticeKind } from '@/lib/account-emails';
import { requestCountry } from '@/lib/geoip';
import { SITE_URL } from '@/lib/seo';

const VERIFY_TTL_MS = 48 * 60 * 60 * 1000;

/** Писмо за потвърждение на имейла (еднократна връзка, 48 ч.). false = не е тръгнало. */
export async function sendVerificationEmail(user: Pick<User, 'id' | 'email' | 'locale'>): Promise<boolean> {
  if (!(await emailReady())) return false;
  const token = await createUserToken(user.id, 'verify-email', VERIFY_TTL_MS);
  const url = `${SITE_URL.replace(/\/$/, '')}/api/verify-email?token=${token}`;
  const mail = verifyEmailMessage({ locale: user.locale, url });
  return sendEmail({ to: user.email, subject: mail.subject, html: mail.html, tag: 'verify' }).catch(() => false);
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
