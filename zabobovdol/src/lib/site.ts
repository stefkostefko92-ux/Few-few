// Централна конфигурация на сайта. Едно място за всички ключови факти,
// използвани в SEO, структурирани данни (JSON-LD), footer и контакти.

export const SITE = {
  name: "За Бобов дол",
  shortName: "За Бобов дол",
  domain: "zabobovdol.bg",
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "https://zabobovdol.bg").replace(
    /\/$/,
    "",
  ),
  locale: "bg_BG",
  lang: "bg",
  description:
    "Дигитален помощник на Бобов дол: местни услуги и телефони, как да ползваш е-услуги, събития, обяви и каталог на местния бизнес. Лесно, на едно място, за всички възрасти.",
  slogan: "Всичко за Бобов дол на едно място",
  // Гео данни за GEO/Local SEO и JSON-LD (LocalBusiness / Place).
  geo: {
    city: "Бобов дол",
    region: "Кюстендилска област",
    regionCode: "BG-10",
    country: "България",
    countryCode: "BG",
    postalCode: "2670",
    latitude: 42.3539,
    longitude: 23.0008,
  },
  contact: {
    email: "info@zabobovdol.bg",
    // Заменете с реален телефон, когато стартира гишето.
    phone: "",
  },
  social: {
    facebook: "",
  },
  // Спешни телефони — винаги видими, не зависят от базата.
  emergency: [
    { label: "Единен европейски номер за спешни повиквания", phone: "112" },
  ],
  organizationType: "GovernmentOrganization", // за JSON-LD по подразбиране ползваме Organization
} as const;

export type NavItem = { href: string; label: string; description?: string };

export const PRIMARY_NAV: NavItem[] = [
  { href: "/kak-da", label: "Как да…", description: "Стъпка по стъпка за е-услуги и документи" },
  { href: "/uslugi", label: "Услуги и телефони", description: "Важни местни телефони и услуги" },
  { href: "/biznes", label: "Местен бизнес", description: "Каталог на търговци и занаятчии" },
  { href: "/sabitiya", label: "Събития", description: "Какво се случва в града" },
  { href: "/obyavi", label: "Обяви", description: "Безплатни местни обяви" },
  { href: "/novini", label: "Новини", description: "Актуални съобщения" },
  { href: "/pomosht", label: "Помощ на гише", description: "Лична помощ с дигитални услуги" },
];

export const FOOTER_NAV: NavItem[] = [
  { href: "/za-nas", label: "За проекта" },
  { href: "/pomosht", label: "Помощ на гише" },
  { href: "/kontakti", label: "Контакти" },
  { href: "/poveritelnost", label: "Поверителност" },
];
