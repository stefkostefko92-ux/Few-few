/** Site-wide constants for the marketing layer (§14, §15). */
export const SITE = {
  name: "АСО",
  url: "https://gaming.carbonstealth.eu",
  playUrl: "https://gaming.carbonstealth.eu/app/login",
  tagline: "Премиум игри на карти и маса",
  description:
    "АСО — премиум браузърен портал за карти и игри на маса. Белот, Сантасе, Шах, Табла и още, в реално време срещу приятели и ботове.",
  locales: ["bg", "it", "en"] as const,
  defaultLocale: "bg" as const,
  org: {
    legalName: "Carbon Stealth VCC",
    url: "https://carbonstealth.eu",
    // Импресум на услугата. Реалните стойности се попълват от собственика преди
    // публикуване — не измисляй официални данни (ЕИК/ДДС/адрес).
    address: "[Адрес на управление: попълни]",
    /** ЕИК / номер в търговския регистър. */
    companyId: "[ЕИК: попълни]",
    /** ДДС номер (ако лицето е регистрирано по ЗДДС). */
    vatId: "[ДДС №: попълни]",
    /** Имейл за контакт с оператора. */
    contactEmail: "legal@carbonstealth.eu",
  },
} as const;
