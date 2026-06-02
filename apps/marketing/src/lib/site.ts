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
  },
} as const;
