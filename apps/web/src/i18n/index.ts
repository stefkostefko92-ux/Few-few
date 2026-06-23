import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { DEFAULT_LOCALE, LOCALES } from "@aso/shared";

import bgCommon from "./bg/common.json";
import enCommon from "./en/common.json";
import itCommon from "./it/common.json";

export const resources = {
  bg: { common: bgCommon },
  en: { common: enCommon },
  it: { common: itCommon },
} as const;

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: [...LOCALES],
    defaultNS: "common",
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator", "htmlTag"],
      lookupLocalStorage: "aso_locale",
      caches: ["localStorage"],
    },
  });

// Keep <html lang> in sync with the active language (WCAG 3.1.1) — screen
// readers pick the right voice when the user switches locale.
const syncHtmlLang = (lng: string) => {
  if (typeof document !== "undefined") document.documentElement.lang = lng;
};
syncHtmlLang(i18n.language || DEFAULT_LOCALE);
i18n.on("languageChanged", syncHtmlLang);

export default i18n;
