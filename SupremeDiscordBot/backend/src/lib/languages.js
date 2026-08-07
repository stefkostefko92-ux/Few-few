// backend/src/lib/languages.js
// Единен списък с езиците, които продуктът поддържа — един източник вместо
// разпилени ["en","bg","it"] масиви (auth.js приемаше само 3, а ботът вече
// говори 8 → потребител не можеше да си запази език, който ботът поддържа).
//
// Дръж в синхрон с bot/src/i18n/ (по един locale файл на код) и с
// frontend/src/i18n/dashboard/. Тестът languages.test.js гейтва списъка.
export const SUPPORTED_LANGUAGES = ["en", "bg", "de", "es", "fr", "it", "nl", "pl"];

export const LANGUAGE_NAMES = {
  en: "English",
  bg: "Български",
  de: "Deutsch",
  es: "Español",
  fr: "Français",
  it: "Italiano",
  nl: "Nederlands",
  pl: "Polski",
};

export function isSupportedLanguage(lang) {
  return typeof lang === "string" && SUPPORTED_LANGUAGES.includes(lang);
}
