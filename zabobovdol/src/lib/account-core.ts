// „Моят профил“ — смяна на собствения имейл и парола. Чист модул (без база и
// без server-only): формата и печатът на сесията се тестват директно
// (account.test.ts, там е и спецификацията).
import { createHmac } from "node:crypto";

export const ACCOUNT_ERRORS = {
  currentPassword: "Въведете сегашната си парола.",
  currentPasswordWrong: "Сегашната парола не е вярна.",
  email: "Проверете имейла — трябва да е като ime@primer.bg.",
  emailTaken: "Вече има потребител с този имейл.",
  newPasswordLength: "Новата парола трябва да е между 10 и 200 знака.",
  newPasswordSame: "Новата парола трябва да е различна от сегашната.",
  newPassword2: "Повторената парола не съвпада с новата.",
  nothing: "Няма промяна — сменете имейла или въведете нова парола.",
} as const;

export type AccountField = "currentPassword" | "email" | "newPassword" | "newPassword2" | "_";

export type AccountFormResult =
  | { ok: true; email: string; emailChanged: boolean; newPassword: string | null }
  | { ok: false; errors: Partial<Record<AccountField, string>> };

const EMAIL = /^[^\s@,;<>"()\\]+@[^\s@,;<>"()\\]+\.[^\s@,;<>"()\\]+$/;

export function parseAccountForm(
  raw: { email: string; currentPassword: string; newPassword: string; newPassword2: string },
  current: { email: string },
): AccountFormResult {
  const errors: Partial<Record<AccountField, string>> = {};
  if (!raw.currentPassword) errors.currentPassword = ACCOUNT_ERRORS.currentPassword;

  const email = raw.email.trim().toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) errors.email = ACCOUNT_ERRORS.email;
  const emailChanged = email !== current.email.trim().toLowerCase();

  // Паролата — както е въведена (без trim): интервалът може да е част от нея.
  let newPassword: string | null = null;
  if (raw.newPassword || raw.newPassword2) {
    if (raw.newPassword.length < 10 || raw.newPassword.length > 200) errors.newPassword = ACCOUNT_ERRORS.newPasswordLength;
    else if (raw.newPassword === raw.currentPassword) errors.newPassword = ACCOUNT_ERRORS.newPasswordSame;
    else if (raw.newPassword !== raw.newPassword2) errors.newPassword2 = ACCOUNT_ERRORS.newPassword2;
    else newPassword = raw.newPassword;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  if (!emailChanged && newPassword === null) return { ok: false, errors: { _: ACCOUNT_ERRORS.nothing } };
  return { ok: true, email, emailChanged, newPassword };
}

/**
 * Печат на сесията: HMAC(AUTH_SECRET, хеша на паролата). Влиза в JSON токена
 * на сесията и се сверява при всяка заявка — нова парола = нов хеш = всички
 * стари сесии падат веднага (не след 8 часа). Не издава хеша.
 */
export function sessionStamp(secret: string, passwordHash: string): string {
  return createHmac("sha256", secret).update(`session-v1:${passwordHash}`).digest("base64url").slice(0, 22);
}
