import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { consumeUserToken, getSession, peekUserToken } from '@/lib/auth';
import { verifyEmailAllowed } from '@/lib/verify-email-policy';
import { isLocale } from '@/i18n/locales';
import { recordSecurityEvent } from '@/lib/security-events';
import { SITE_URL } from '@/lib/seo';

export const dynamic = 'force-dynamic';

// Потвърждение на имейла по еднократна връзка от писмото (48 ч.). Важи само в
// сесията на СЪЩИЯ потребител (Разбивача F1 за админ адресите, Н8 — за всички: адрес,
// добавен в ADMIN_EMAILS по-късно, иначе наследява потвърждение от скенер или чужд клик).
export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.nextUrl.searchParams.get('token') ?? '';
  const base = SITE_URL.replace(/\/$/, '');
  const pending = await peekUserToken(token, 'verify-email');
  if (!pending) return NextResponse.redirect(`${base}/en/login?error=link`, 303);
  const locale = isLocale(pending.locale) ? pending.locale : 'en';
  // Само в сесията на СЪЩИЯ потребител — за всеки адрес (lib/verify-email-policy.ts, Н8).
  const active = await getSession();
  if (!verifyEmailAllowed(pending.id, active?.user.id)) {
    // Токенът НЕ се изразходва — собственикът влиза и отваря връзката пак.
    await recordSecurityEvent('email.verify_blocked', { userId: pending.id });
    return NextResponse.redirect(`${base}/${locale}/login?error=verify-login`, 303);
  }
  const user = await consumeUserToken(token, 'verify-email');
  if (!user) return NextResponse.redirect(`${base}/en/login?error=link`, 303);
  if (!user.emailVerifiedAt) {
    await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
    await recordSecurityEvent('email.verified', { userId: user.id });
  }
  return NextResponse.redirect(`${base}/${locale}/dashboard/security?ok=verified`, 303);
}
