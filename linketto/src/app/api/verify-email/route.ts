import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { consumeUserToken } from '@/lib/auth';
import { isLocale } from '@/i18n/locales';
import { recordSecurityEvent } from '@/lib/security-events';
import { SITE_URL } from '@/lib/seo';

export const dynamic = 'force-dynamic';

// Потвърждение на имейла по еднократна връзка от писмото (48 ч.). Безопасно
// за скенерите в пощата: само отбелязва адреса като потвърден (нищо друго).
export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.nextUrl.searchParams.get('token') ?? '';
  const user = await consumeUserToken(token, 'verify-email');
  const base = SITE_URL.replace(/\/$/, '');
  if (!user) return NextResponse.redirect(`${base}/en/login?error=link`, 303);
  if (!user.emailVerifiedAt) {
    await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
    await recordSecurityEvent('email.verified', { userId: user.id });
  }
  const locale = isLocale(user.locale) ? user.locale : 'en';
  return NextResponse.redirect(`${base}/${locale}/dashboard/security?ok=verified`, 303);
}
