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

// Първична навигация — основните полезни секции за гражданина.
export const PRIMARY_NAV: NavItem[] = [
  { href: "/uslugi", label: "Услуги и телефони", description: "Важни местни телефони и услуги на едно място" },
  { href: "/kak-da", label: "Как да…", description: "Стъпка по стъпка за е-услуги и документи" },
  { href: "/dezhurna-apteka", label: "Дежурна аптека", description: "Коя аптека работи денонощно в Дупница" },
  { href: "/izmami", label: "Пази се от измами", description: "Как да разпознаеш телефонни и онлайн измами" },
  { href: "/pomoshti", label: "Пенсии и помощи", description: "Пенсии, помощ за отопление, ТЕЛК и документи" },
  { href: "/danaci-srokove", label: "Данъци и срокове", description: "Кога и как да платя местните данъци и такси" },
  { href: "/evroto", label: "Еврото", description: "Всичко за еврото — въпроси и отговори" },
  { href: "/prekysvaniya", label: "Ток и вода", description: "Планови и аварийни прекъсвания на ток и вода" },
  { href: "/transport", label: "Транспорт", description: "Автобуси, влак, такси и споделено пътуване" },
  { href: "/sabitiya", label: "Събития", description: "Какво се случва в Дупница" },
  { href: "/novini", label: "Новини", description: "Актуални местни съобщения" },
  { href: "/obyavi", label: "Обяви", description: "Безплатни местни обяви" },
  { href: "/biznes", label: "Местен бизнес", description: "Каталог на търговци и услуги" },
  { href: "/signali", label: "Сигнали", description: "Подайте сигнал или оплакване" },
  { href: "/prozrachnost", label: "Прозрачност", description: "Къде отиват парите на общината" },
  { href: "/grafik-smetosabirane", label: "График за смет", description: "Кога се извозва отпадъкът" },
  { href: "/smetishta", label: "Нерегламентирани сметища", description: "Сигнал за незаконно сметище" },
  { href: "/imen-den", label: "Именни дни", description: "Кой празнува днес" },
  { href: "/zov-za-pomosht", label: "Зов за помощ", description: "Взаимопомощ и подкрепа" },
  { href: "/dobrovolci", label: "Доброволци", description: "Помощ от хора с добро сърце" },
  { href: "/spomeni", label: "Спомени", description: "Споделени спомени и стари снимки" },
  { href: "/galeriya", label: "Галерия", description: "Снимки на града от хората" },
  { href: "/grada", label: "Опознай Дупница", description: "География, забележителности и природа" },
  { href: "/istoriya", label: "История", description: "Историята на Дупница накратко" },
  { href: "/kontakti", label: "Контакти", description: "Пишете ни предложение или поправка" },
  { href: "/tarsene", label: "Търсене", description: "Намери бързо из целия сайт" },
];

// Кратък подбор за горната лента (десктоп). Пълният списък е в „Всички раздели".
export const HEADER_NAV: NavItem[] = [
  { href: "/uslugi", label: "Услуги и телефони" },
  { href: "/kak-da", label: "Как да…" },
  { href: "/dezhurna-apteka", label: "Дежурна аптека" },
  { href: "/prekysvaniya", label: "Ток и вода" },
  { href: "/transport", label: "Транспорт" },
];

export const FOOTER_NAV: NavItem[] = [
  { href: "/uslugi", label: "Услуги и телефони" },
  { href: "/kak-da", label: "Как да…" },
  { href: "/dezhurna-apteka", label: "Дежурна аптека" },
  { href: "/izmami", label: "Пази се от измами" },
  { href: "/pomoshti", label: "Пенсии и помощи" },
  { href: "/danaci-srokove", label: "Данъци и срокове" },
  { href: "/evroto", label: "Еврото" },
  { href: "/prekysvaniya", label: "Ток и вода" },
  { href: "/transport", label: "Транспорт" },
  { href: "/sabitiya", label: "Събития" },
  { href: "/novini", label: "Новини" },
  { href: "/obyavi", label: "Обяви" },
  { href: "/biznes", label: "Местен бизнес" },
  { href: "/signali", label: "Сигнали" },
  { href: "/prozrachnost", label: "Прозрачност" },
  { href: "/grafik-smetosabirane", label: "График за смет" },
  { href: "/zov-za-pomosht", label: "Зов за помощ" },
  { href: "/dobrovolci", label: "Доброволци" },
  { href: "/spomeni", label: "Спомени" },
  { href: "/galeriya", label: "Галерия" },
  { href: "/grada", label: "Опознай Дупница" },
  { href: "/istoriya", label: "История" },
  { href: "/tarsene", label: "Търсене" },
  { href: "/kontakti", label: "Контакти" },
  { href: "/kak-da-polzvam-sayta", label: "Как да ползвам сайта" },
  { href: "/dostapnost", label: "Достъпност" },
  { href: "/za-nas", label: "За проекта" },
  { href: "/pravila", label: "Общи условия" },
  { href: "/poveritelnost", label: "Поверителност" },
  { href: "/biskvitki", label: "Бисквитки" },
];
