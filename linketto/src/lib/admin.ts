// Админ достъп: имейлите идват САМО от env (ADMIN_EMAILS) — никакви админ
// флагове в базата. Червен/син екип: самият имейл не стига — нужни са
// потвърден имейл, включена 2FA и сесия, потвърдена с код; опасните
// действия искат пресен код (step-up, ≤10 мин.).

import { redirect } from 'next/navigation';
import { getSession, stepUpFresh } from '@/lib/auth';
import { adminGate, isAdminEmail } from '@/lib/admin-list';
import { clientIp } from '@/lib/rate-limit';

export { isAdminEmail };

/** Връща админ потребителя или пренасочва (вход / потвърждение / 2FA). */
export async function requireAdmin(uiLocale: string) {
  const active = await getSession();
  if (!active) redirect(`/${uiLocale}/login`);
  const gate = adminGate({ ...active.user, mfaAt: active.session.mfaAt });
  switch (gate) {
    case 'ok':
      return active.user;
    case 'not-admin':
      // Влязъл, но не е админ → таблото (не входа, където вече е влязъл).
      redirect(`/${uiLocale}/dashboard`);
    case 'verify-email':
      redirect(`/${uiLocale}/dashboard/security?need=verify`);
    case 'enroll-2fa':
      redirect(`/${uiLocale}/dashboard/security?need=admin2fa`);
    case 'step-up':
      redirect(`/${uiLocale}/admin/step-up`);
  }
}

/**
 * Опасно админ действие: иска 2FA код от последните 10 мин. Иначе — към
 * страницата за потвърждение (действието се повтаря след нея).
 */
export async function requireStepUp(uiLocale: string) {
  const admin = await requireAdmin(uiLocale);
  const active = await getSession();
  if (!active || !stepUpFresh(active.session)) redirect(`/${uiLocale}/admin/step-up?reason=action`);
  return admin;
}

/** IP на заявката (зад reverse proxy / CDN) — виж clientIp за доверието. */
export async function requestIp(): Promise<string | null> {
  const ip = await clientIp();
  return ip === 'unknown' ? null : ip;
}
