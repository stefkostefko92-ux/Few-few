// Админ достъп: имейлите идват САМО от env (ADMIN_EMAILS, запетая-разделени)
// — никакви админ флагове в базата, никакви имейли в кода.

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getSessionUser } from '@/lib/auth';

export function isAdminEmail(email: string): boolean {
  const raw = process.env.ADMIN_EMAILS ?? '';
  const list = raw
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

/** Връща админ потребителя или redirect-ва към login. */
export async function requireAdmin(uiLocale: string) {
  const user = await getSessionUser();
  if (!user || !isAdminEmail(user.email)) {
    redirect(`/${uiLocale}/login`);
  }
  return user;
}

/** IP на заявката (зад reverse proxy / CDN). */
export async function requestIp(): Promise<string | null> {
  const h = await headers();
  const cf = h.get('cf-connecting-ip');
  if (cf) return cf;
  const xff = h.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  const real = h.get('x-real-ip');
  return real ? real.trim() : null;
}
