import type { TFunction } from "i18next";
import type { ApiError } from "../../lib/api";

/** Полетата на формите за вход/регистрация/нова парола, които сървърът валидира. */
export type AuthField = "email" | "password" | "displayName";

const FIELD_KEYS: Record<AuthField, string> = {
  email: "auth.errEmail",
  password: "auth.errPassword",
  displayName: "auth.errDisplayName",
};

/**
 * Превежда `validation_error` (zod `flatten()` в `details.issues`) до локализирано
 * съобщение за всяко сгрешено поле. Сървърните текстове са на български, затова
 * показваме нашите ключове по името на полето, а не суровия текст.
 */
export function fieldErrorsFrom(err: ApiError, t: TFunction): Partial<Record<AuthField, string>> {
  if (err.code !== "validation_error") return {};
  const issues = err.details.issues as { fieldErrors?: Record<string, unknown> } | undefined;
  const fieldErrors = issues?.fieldErrors ?? {};
  const out: Partial<Record<AuthField, string>> = {};
  for (const field of Object.keys(FIELD_KEYS) as AuthField[]) {
    const list = fieldErrors[field];
    if (Array.isArray(list) && list.length > 0) out[field] = t(FIELD_KEYS[field]);
  }
  return out;
}

/**
 * Текстът при блокиран акаунт (DSA чл. 17): причината (ако има), до кога важи
 * банът (ако е временен) и как се обжалва. Общ за вход с парола и за OAuth.
 */
export function bannedMessage(
  t: TFunction,
  locale: string | undefined,
  reason = "",
  until: unknown = null,
): string {
  const untilDate = typeof until === "string" ? new Date(until) : null;
  const validUntil = untilDate && !Number.isNaN(untilDate.getTime()) ? untilDate : null;
  return [
    t("auth.errorBanned"),
    reason.trim() ? t("auth.banReason", { reason: reason.trim() }) : null,
    validUntil
      ? t("auth.banUntil", {
          until: validUntil.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }),
        })
      : null,
    t("auth.banAppeal"),
  ]
    .filter(Boolean)
    .join(" ");
}
