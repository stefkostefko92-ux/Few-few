// Езици на публичните сайтове. Български е източникът на истината; английският и
// италианският са по избор (Site.localeEn / Site.localeIt).

export type Locale = "bg" | "en" | "it";

export const LOCALES: Locale[] = ["bg", "en", "it"];
export const SECONDARY_LOCALES: Locale[] = ["en", "it"];

export const LOCALE_LABEL: Record<Locale, string> = {
  bg: "Български",
  en: "English",
  it: "Italiano",
};

export const LOCALE_OG: Record<Locale, string> = {
  bg: "bg_BG",
  en: "en_US",
  it: "it_IT",
};

// Нормализира стойност от ?lang=… до валидна локала (по подразбиране bg).
export function parseLocale(value: unknown): Locale {
  return value === "en" ? "en" : value === "it" ? "it" : "bg";
}

// Кои локали са реално налични за дадена страница: BG винаги; EN/IT само ако са
// включени за сайта И имат съдържание (иначе не рекламираме празни версии).
export function availableLocales(input: {
  localeEn: boolean;
  enCount: number;
  localeIt: boolean;
  itCount: number;
}): Locale[] {
  const out: Locale[] = ["bg"];
  if (input.localeEn && input.enCount > 0) out.push("en");
  if (input.localeIt && input.itCount > 0) out.push("it");
  return out;
}

// Активната локала = исканата, ако е налична; иначе bg.
export function resolveLocale(available: Locale[], lang: unknown): Locale {
  const want = parseLocale(lang);
  return available.includes(want) ? want : "bg";
}

// hreflang alternates за metadata — само когато има повече от един език.
export function langAlternates(
  bgUrl: string,
  available: Locale[],
): Record<string, string> | undefined {
  if (available.length <= 1) return undefined;
  const map: Record<string, string> = {};
  for (const l of available) map[l] = l === "bg" ? bgUrl : `${bgUrl}?lang=${l}`;
  map["x-default"] = bgUrl;
  return map;
}
