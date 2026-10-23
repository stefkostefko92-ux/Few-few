// frontend/src/i18n/dashboard/index.js
// Английският е канонът и fallback — в главния чънк. Другите 7 се зареждат
// при нужда (динамичен import → собствен чънк): преди и осемте влизаха в
// първото зареждане на ВСЯКА страница, включително публичния лендинг, който
// не ползва нито един от тях (~120 KB gzip; бюджет на бъндъла, 26.09.2026).
// За тестове с всички езици наведнъж: ./all.js.
import en from "./en.js";

export const DASHBOARD_EN = en;

export const LOCALE_LOADERS = {
  bg: () => import("./bg.js"),
  de: () => import("./de.js"),
  es: () => import("./es.js"),
  fr: () => import("./fr.js"),
  it: () => import("./it.js"),
  nl: () => import("./nl.js"),
  pl: () => import("./pl.js"),
};

export const SUPPORTED_LOCALES = ["en", ...Object.keys(LOCALE_LOADERS)];

// Списъкът за превключвателя — редът е англ. + азбучен по локален етикет.
export const LANGUAGE_OPTIONS = [
  { code: "en", label: "English" },
  { code: "bg", label: "Български" },
  { code: "de", label: "Deutsch" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "it", label: "Italiano" },
  { code: "nl", label: "Nederlands" },
  { code: "pl", label: "Polski" },
];

export const DEFAULT_LOCALE = "en";
