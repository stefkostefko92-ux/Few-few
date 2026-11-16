// Админ достъп: имейлите идват САМО от env (ADMIN_EMAILS, запетая-разделени)
// — никакви админ флагове в базата, никакви имейли в кода.

import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { clientIp } from '@/lib/rate-limit';

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

/** IP на заявката (зад reverse proxy / CDN) — виж clientIp за доверието. */
export async function requestIp(): Promise<string | null> {
  const ip = await clientIp();
  return ip === 'unknown' ? null : ip;
}
