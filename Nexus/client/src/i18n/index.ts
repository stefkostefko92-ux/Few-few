/**
 * i18n bootstrap. Three locales: English (source of truth for now),
 * Bulgarian and Italian. Detected from (1) explicit `?lang=` query,
 * (2) `localStorage.nd_locale`, (3) `navigator.language`. Persisted to
 * localStorage so the same picker decision survives a refresh.
 *
 * The Преводач agent owns the bg/en/it message catalogues. Anything not
 * yet translated falls back to the English string — visible in the UI,
 * not a missing-key crash. Push the next translation pass into
 * `src/i18n/locales/{bg,it}.json` and the picker covers it.
 */
import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import bg from './locales/bg.json';
import it from './locales/it.json';

export const SUPPORTED = ['en', 'bg', 'it'] as const;
export type Locale = (typeof SUPPORTED)[number];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      bg: { translation: bg },
      it: { translation: it },
    },
    fallbackLng: 'en',
    supportedLngs: SUPPORTED as unknown as string[],
    interpolation: { escapeValue: false }, // React already escapes
    detection: {
      order: ['querystring', 'localStorage', 'navigator', 'htmlTag'],
      lookupQuerystring: 'lang',
      lookupLocalStorage: 'nd_locale',
      caches: ['localStorage'],
    },
  });

/** Programmatic switcher used by the language toggle in the header. */
export function switchLocale(loc: Locale): void {
  i18n.changeLanguage(loc);
  document.documentElement.lang = loc;
}

export default i18n;
