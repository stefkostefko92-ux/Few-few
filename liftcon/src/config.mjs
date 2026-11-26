// Единственият източник на данните за сайта: домейн, фирма, контакти, зона на обслужване.
// Фирмените данни са на Carbon Stealth VCC (както в cs-revolution/public/note-legali) — LiftCon е нейна услуга.
// Домейнът се сменя САМО тук (или с LIFTCON_SITE_URL при билд) — canonical, sitemap, OG и JSON-LD го следват.

const envUrl = process.env.LIFTCON_SITE_URL;

export const SITE = Object.freeze({
  url: (envUrl && /^https:\/\/[a-z0-9.-]+$/i.test(envUrl) ? envUrl : "https://liftcon.it").replace(/\/$/, ""),
  name: "LiftCon",
  tagline: "Consulenza tecnica ascensori",
  locale: "it_IT",
  lang: "it",
  // Дата на последната редакция на съдържанието (детерминистичен билд — не „днес“).
  updated: "2026-11-26",
  themeColor: "#F5F6F3",
});

export const COMPANY = Object.freeze({
  legalName: "Carbon Stealth VCC",
  legalForm: "ЕДПК — società unipersonale a capitale variabile di diritto bulgaro",
  eik: "208725180",
  vat: "BG208725180",
  street: "ul. Samuil 3",
  postalCode: "2670",
  city: "Bobov Dol",
  country: "Bulgaria",
  countryCode: "BG",
  url: "https://carbonstealth.eu",
  sameAs: [
    "https://www.linkedin.com/company/carbonstealth.vcc",
    "https://github.com/carbonstealth",
    "https://www.youtube.com/@CarbonStealth",
  ],
  responsabile: "Stefan Kostadinov",
  responsabileRuolo: "Fondatore e responsabile dei contenuti",
});

// Не е замразен: панелът (/admin) може да смени телефона, имейла и часовете — build.mjs ги прилага преди рендера.
export const CONTACT = {
  phone: "+39 379 296 9699",
  phoneHref: "tel:+393792969699",
  phoneSchema: "+39-379-296-9699",
  email: "info@liftcon.it",
  // Orari dichiarati da Carbon Stealth VCC (carbonstealth.eu, JSON-LD openingHoursSpecification).
  hours: [
    { days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], label: "Lunedì–venerdì", opens: "09:00", closes: "18:00" },
    { days: ["Saturday"], label: "Sabato", opens: "10:00", closes: "14:00" },
  ],
};

// Centro geografico della zona servita (Milano, piazza del Duomo) — per geo.position e areaServed.
export const GEO = Object.freeze({ lat: 45.4642, lng: 9.19, region: "IT-25", place: "Milano" });

export const PROVINCE = Object.freeze([
  "Milano",
  "Monza e Brianza",
  "Bergamo",
  "Brescia",
  "Como",
  "Cremona",
  "Lecco",
  "Lodi",
  "Mantova",
  "Pavia",
  "Sondrio",
  "Varese",
]);

export const CREDIT = Object.freeze({ text: "Created and Designed by Carbon Stealth VCC", url: "https://carbonstealth.eu" });
