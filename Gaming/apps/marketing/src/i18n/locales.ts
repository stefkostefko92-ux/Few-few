/**
 * Locale primitives for the marketing layer. We mirror the play app's i18n
 * conventions (BG is the canonical source of truth) by reusing the shared
 * LOCALES / DEFAULT_LOCALE so the two stay in lock-step (§16).
 */
import { LOCALES, DEFAULT_LOCALE, type Locale } from "@aso/shared";

export { LOCALES, DEFAULT_LOCALE };
export type { Locale };

/** localStorage key — same one the play app uses, so a returning visitor keeps
 * their language across the marketing site and the app. */
export const LOCALE_STORAGE_KEY = "aso_locale";
/** Cookie fallback — set alongside localStorage so the choice also survives in
 * environments where localStorage is unavailable. */
export const LOCALE_COOKIE = "aso_locale";

export const LOCALE_LABELS: Record<Locale, string> = {
  bg: "БГ",
  en: "EN",
  it: "IT",
};

export const LOCALE_NAMES: Record<Locale, string> = {
  bg: "Български",
  en: "English",
  it: "Italiano",
};

export function isLocale(value: string | null | undefined): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Read the persisted locale (localStorage → cookie), defaulting to BG. Safe to
 * call on the server (returns the default there). */
export function readStoredLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const ls = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(ls)) return ls;
  } catch {
    /* localStorage blocked */
  }
  const m = typeof document !== "undefined" ? document.cookie.match(/(?:^|; )aso_locale=([^;]+)/) : null;
  if (m && isLocale(m[1])) return m[1];
  return DEFAULT_LOCALE;
}

/** Persist the locale to both localStorage and a cookie. */
export function persistLocale(locale: Locale): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* localStorage blocked */
  }
  if (typeof document !== "undefined") {
    // 1 year, lax — a UI preference, not a tracker.
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
  }
}
