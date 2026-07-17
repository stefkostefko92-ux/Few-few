"use client";

/**
 * Locale context for the statically-exported marketing site — URL-driven.
 *
 * The active locale is derived from the pathname (`/en/…`, `/it/…`, else BG),
 * so every page is prerendered as static HTML *in its own language* at a
 * distinct, crawlable URL (proper hreflang i18n) — not a client-only toggle.
 * BG stays at the root as the canonical source of truth. <html lang> is kept in
 * sync on the client for assistive tech (WCAG 3.1.1).
 */
import { createContext, useContext, useEffect } from "react";
import { usePathname } from "next/navigation";
import { localeFromPathname, type Locale } from "./locales";
import { getDict, type Dict } from "./dictionaries";

interface I18nContextValue {
  locale: Locale;
  t: Dict;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const locale = localeFromPathname(pathname);

  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = locale;
  }, [locale]);

  return <I18nContext.Provider value={{ locale, t: getDict(locale) }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within <I18nProvider>");
  return ctx;
}

/** Convenience: just the active dictionary. */
export function useT(): Dict {
  return useI18n().t;
}

/** Convenience: just the active locale. */
export function useLocale(): Locale {
  return useI18n().locale;
}
