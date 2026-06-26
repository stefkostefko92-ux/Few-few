"use client";

/**
 * Client-side locale context for the statically-exported marketing site.
 *
 * The site is prerendered in BG (the source of truth) — so the canonical HTML,
 * metadata and JSON-LD remain Bulgarian for SEO. On the client we hydrate the
 * visitor's stored preference (localStorage → cookie, default BG) and re-render
 * the chrome/content in their language, keeping <html lang> in sync (WCAG
 * 3.1.1). This mirrors how the play app does i18n (same `aso_locale` key).
 */
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { DEFAULT_LOCALE, persistLocale, readStoredLocale, type Locale } from "./locales";
import { getDict, type Dict } from "./dictionaries";

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Dict;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // Start at the default so SSG output matches first client render (no hydration
  // mismatch); switch to the stored locale after mount.
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const stored = readStoredLocale();
    if (stored !== DEFAULT_LOCALE) setLocaleState(stored);
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    persistLocale(next);
  }, []);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t: getDict(locale) }}>{children}</I18nContext.Provider>
  );
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
