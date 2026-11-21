// Админите идват САМО от env (ADMIN_EMAILS, запетая-разделени) — без флагове в
// базата и без имейли в кода. Отделен модул без зависимости (ползват го и
// auth.ts, и admin.ts — без кръгов импорт).

const EMAIL_SHAPE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

/**
 * Списъкът от ADMIN_EMAILS — ЕДИН парсер за достъпа и за алармите: запис, който
 * не е имейл, не дава достъп (иначе админ без аларми). Fail-closed.
 */
export function adminEmailList(raw: string = process.env.ADMIN_EMAILS ?? ''): string[] {
  return raw
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item) => EMAIL_SHAPE.test(item));
}

export function isAdminEmail(email: string, raw?: string): boolean {
  return adminEmailList(raw).includes(email.trim().toLowerCase());
}

/** Защо (ако) админ достъпът е отказан — чисто, тества се. */
export function adminGate(
  input: {
    email: string;
    emailVerifiedAt: Date | null;
    totpEnabledAt: Date | null;
    mfaAt: Date | null;
  },
  raw?: string,
): 'ok' | 'not-admin' | 'verify-email' | 'enroll-2fa' | 'step-up' {
  if (!isAdminEmail(input.email, raw)) return 'not-admin';
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

/**
 * Защитен от другите админи: адрес от списъка + потвърден имейл (със или без
 * 2FA — новодобавен админ, който още записва 2FA, не бива да може да бъде поет;
 * Разбивача N3). Само непотвърден акаунт, „заел“ админ адрес, може да се изтрие.
 */
export function isWorkingAdmin(
  user: { email: string; emailVerifiedAt: Date | null; totpEnabledAt?: Date | null },
  raw?: string,
): boolean {
  return isAdminEmail(user.email, raw) && user.emailVerifiedAt !== null;
}
