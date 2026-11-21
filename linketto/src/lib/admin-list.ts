// Админите идват САМО от env (ADMIN_EMAILS, запетая-разделени) — без флагове в
// базата и без имейли в кода. Отделен модул без зависимости (ползват го и
// auth.ts, и admin.ts — без кръгов импорт).

export function isAdminEmail(email: string, raw: string = process.env.ADMIN_EMAILS ?? ''): boolean {
  const list = raw
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

/** Защо (ако) админ достъпът е отказан — чисто, тества се. */
export function adminGate(input: {
  email: string;
  emailVerifiedAt: Date | null;
  totpEnabledAt: Date | null;
  mfaAt: Date | null;
}): 'ok' | 'not-admin' | 'verify-email' | 'enroll-2fa' | 'step-up' {
  if (!isAdminEmail(input.email)) return 'not-admin';
  if (!input.emailVerifiedAt) return 'verify-email';
  if (!input.totpEnabledAt) return 'enroll-2fa';
  if (!input.mfaAt) return 'step-up';
  return 'ok';
}

/**
 * Смяна на имейл от админ (червен екип): нов адрес от ADMIN_EMAILS върху ЧУЖД
 * акаунт е забранен — иначе обикновен акаунт става админ. Сменен адрес губи
 * потвърждението (викащият нулира emailVerifiedAt, токените и сесиите).
 */
export function adminEmailChange(input: {
  adminId: string;
  targetId: string;
  current: string;
  next: string;
  raw?: string;
}): 'same' | 'changed' | 'forbidden' {
  if (input.current.trim().toLowerCase() === input.next.trim().toLowerCase()) return 'same';
  if (input.targetId !== input.adminId && isAdminEmail(input.next, input.raw)) return 'forbidden';
  return 'changed';
}
