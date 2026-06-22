// Централна конфигурация на сайта. Едно място за всички ключови факти,
// използвани в SEO, структурирани данни (JSON-LD), footer и контакти.

export const SITE = {
  name: "За Дупница",
  shortName: "За Дупница",
  domain: "zadupnitsa.eu",
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "https://zadupnitsa.eu").replace(
    /\/$/,
    "",
  ),
  locale: "bg_BG",
  lang: "bg",
  description:
    "Граждански помощник на Дупница: важни местни телефони и услуги, дежурна аптека, прекъсвания на ток и вода, транспорт и помощ с е-услуги — лесно, на едно място, за всички възрасти.",
  slogan: "Всичко важно за Дупница на едно място",
  // Гео данни за GEO/Local SEO и JSON-LD (LocalBusiness / Place).
  geo: {
    city: "Дупница",
    region: "Кюстендилска област",
    regionCode: "BG-10",
    country: "България",
    countryCode: "BG",
    postalCode: "2600",
    latitude: 42.2667,
    longitude: 23.1167,
  },
  contact: {
    email: "",
    phone: "",
  },
  social: {
    facebook: "",
  },
  // Начален екран (splash) при влизане в сайта.
  intro: {
    enabled: false,
    headline: "Заедно за Дупница",
    seconds: 4,
  },
  // Спешни телефони — винаги видими, не зависят от база данни.
  emergency: [
    { label: "Единен европейски номер за спешни повиквания", phone: "112" },
  ],
} as const;

export type NavItem = { href: string; label: string; description?: string };

// Първична навигация. Към момента активни са MVP страниците; останалите се
// добавят, докато проектът расте (виж research/dupnitsa-digital-gaps.md).
export const PRIMARY_NAV: NavItem[] = [
  {
    href: "/uslugi",
    label: "Услуги и телефони",
    description: "Важни местни телефони и услуги на едно място",
  },
  {
    href: "/dezhurna-apteka",
    label: "Дежурна аптека",
    description: "Коя аптека работи денонощно в Дупница",
  },
  {
    href: "/dostapnost",
    label: "Достъпност",
    description: "Настройки за по-лесно четене и ползване",
  },
  {
    href: "/za-nas",
    label: "За проекта",
    description: "Какво е това и кой стои зад него",
  },
];

export const FOOTER_NAV: NavItem[] = [
  { href: "/uslugi", label: "Услуги и телефони" },
  { href: "/dezhurna-apteka", label: "Дежурна аптека" },
  { href: "/dostapnost", label: "Достъпност" },
  { href: "/za-nas", label: "За проекта" },
];
