// Централна конфигурация на сайта. Едно място за всички ключови факти,
// използвани в SEO, структурирани данни (JSON-LD), footer и контакти.

export const SITE = {
  name: "ФК Миньор Бобов дол",
  shortName: "Миньор Бобов дол",
  domain: "minyor.carbonstealth.eu",
  url: (
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://minyor.carbonstealth.eu"
  ).replace(/\/$/, ""),
  locale: "bg_BG",
  lang: "bg",
  founded: "1946",
  nickname: "Миньорите",
  colors: "жълто и черно",
  description:
    "Официален сайт на ФК „Миньор“ Бобов дол — новини, програма и резултати, класиране, състав, история и галерия на „миньорите“.",
  slogan: "Сърце, чест и жълто-черна гордост",
  // Гео данни за локално SEO и JSON-LD.
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
  stadium: {
    name: "Стадион „Николай Кръстев – Шулц“",
    capacity: 3500,
    address: "ул. „Димитър Благоев“ 1, Бобов дол 2670",
  },
  contact: {
    email: "minyor@carbonstealth.eu",
    phone: "+359 702 2070",
    address: "ул. „Димитър Благоев“ 1, Бобов дол 2670",
  },
  social: {
    facebook: process.env.FACEBOOK_URL ?? "",
  },
} as const;

export type NavItem = { href: string; label: string; description?: string };

export const PRIMARY_NAV: NavItem[] = [
  { href: "/novini", label: "Новини", description: "Актуални съобщения от клуба" },
  { href: "/programa", label: "Програма и резултати", description: "Предстоящи мачове и изиграни срещи" },
  { href: "/klasirane", label: "Класиране", description: "Таблица на групата" },
  { href: "/otbor", label: "Отбор", description: "Състав и треньорски щаб" },
  { href: "/istoriya", label: "История", description: "История и постижения на клуба" },
  { href: "/stadion", label: "Стадион", description: "Стадион „Николай Кръстев – Шулц“" },
  { href: "/galeriya", label: "Галерия", description: "Снимки от мачове и събития" },
  { href: "/za-kluba", label: "За клуба", description: "Кои сме ние" },
  { href: "/kontakti", label: "Контакти", description: "Връзка с клуба" },
];

export const FOOTER_NAV: NavItem[] = [
  { href: "/za-kluba", label: "За клуба" },
  { href: "/istoriya", label: "История и постижения" },
  { href: "/stadion", label: "Стадион" },
  { href: "/otbor", label: "Отбор" },
  { href: "/programa", label: "Програма и резултати" },
  { href: "/klasirane", label: "Класиране" },
  { href: "/galeriya", label: "Галерия" },
  { href: "/kontakti", label: "Контакти" },
  { href: "/dostapnost", label: "Достъпност" },
  { href: "/poveritelnost", label: "Поверителност" },
  { href: "/biskvitki", label: "Бисквитки" },
  { href: "/usloviya", label: "Условия за ползване" },
];
