// Езици на публичните сайтове. Български е източникът на истината; английският е
// по избор (Site.localeEn). Пазим го просто: две локали, ясни етикети.

export type Locale = "bg" | "en";

export const LOCALES: Locale[] = ["bg", "en"];

export const LOCALE_LABEL: Record<Locale, string> = {
  bg: "Български",
  en: "English",
};

export const LOCALE_HTML: Record<Locale, string> = {
  bg: "bg",
  en: "en",
};

// OpenGraph locale етикети.
export const LOCALE_OG: Record<Locale, string> = {
  bg: "bg_BG",
  en: "en_US",
};

// Нормализира стойност от ?lang=… до валидна локала (по подразбиране bg).
export function parseLocale(value: unknown): Locale {
  return value === "en" ? "en" : "bg";
}
