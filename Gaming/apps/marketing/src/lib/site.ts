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
    // Импресум на услугата — публични данни на оператора (Дир. 2000/31 чл. 5,
    // ЗЕТ чл. 4), потвърдени от carbonstealth.eu и Търговския регистър.
    address: "ул. Самуил 3, 2670 Бобов дол, България",
    /** ЕИК (Търговски регистър при Агенцията по вписванията). */
    companyId: "208725180",
    /** ДДС номер (регистрация по ЗДДС). */
    vatId: "BG208725180",
    /** Имейл за контакт с оператора. */
    contactEmail: "legal@carbonstealth.eu",
  },
} as const;
