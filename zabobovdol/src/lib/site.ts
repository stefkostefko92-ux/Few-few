// Централна конфигурация на сайта. Едно място за всички ключови факти,
// използвани в SEO, структурирани данни (JSON-LD), footer и контакти.

export const SITE = {
  name: "За Бобов дол",
  shortName: "За Бобов дол",
  domain: "zabobovdol.carbonstealth.eu",
  url: (
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://zabobovdol.carbonstealth.eu"
  ).replace(/\/$/, ""),
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
    email: "zabobovdol@carbonstealth.eu",
    phone: "+359877414874",
  },
  social: {
    facebook: "",
  },
  // Линк за плащане на реклама (Revolut).
  payment: {
    revolut: "https://revolut.me/vycanismajoris",
    monthlyPriceEur: 20,
  },
  // Начален екран (splash) при влизане в сайта.
  intro: {
    enabled: true,
    headline: "Заедно за Бобов дол",
    seconds: 5,
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
  { href: "/izmami", label: "Пази се от измами", description: "Как да разпознаеш телефонни и онлайн измами" },
  { href: "/dezhurna-apteka", label: "Дежурна аптека", description: "Коя аптека и лекар работят сега" },
  { href: "/pomoshti", label: "Пенсии и помощи", description: "Пенсии, помощ за отопление, ТЕЛК и документи" },
  { href: "/evroto", label: "Еврото", description: "Всичко за еврото — въпроси и отговори" },
  { href: "/biznes", label: "Местен бизнес", description: "Каталог на търговци и занаятчии" },
  { href: "/sabitiya", label: "Събития", description: "Какво се случва в града" },
  { href: "/obyavi", label: "Обяви", description: "Безплатни местни обяви" },
  { href: "/transport", label: "Транспорт", description: "Такси, влак, автобуси и споделено пътуване" },
  { href: "/prekysvaniya", label: "Прекъсвания на ток и вода", description: "Планови и аварийни спирания на ток и вода" },
  { href: "/novini", label: "Новини", description: "Актуални съобщения" },
  { href: "/signali", label: "Сигнали до общината", description: "Подайте оплакване или сигнал" },
  { href: "/smetishta", label: "Нерегламентирани сметища", description: "Подайте сигнал за незаконно сметище" },
  { href: "/grada", label: "Опознай Бобов дол", description: "География, забележителности, природа и карта" },
  { href: "/istoriya", label: "История на града", description: "Историята на Бобов дол по етапи" },
  { href: "/zov-za-pomosht", label: "Зов за помощ", description: "Взаимопомощ и подкрепа за възрастните" },
  { href: "/dobrovolci", label: "Доброволци", description: "Помощ от хора с добро сърце" },
  { href: "/spomeni", label: "Спомени от Бобов дол", description: "Споделете спомен или стара снимка" },
  { href: "/galeriya", label: "Галерия", description: "Снимки на града от хората" },
];

export const FOOTER_NAV: NavItem[] = [
  { href: "/za-nas", label: "За проекта" },
  { href: "/izmami", label: "Пази се от измами" },
  { href: "/dezhurna-apteka", label: "Дежурна аптека" },
  { href: "/pomoshti", label: "Пенсии и помощи" },
  { href: "/evroto", label: "Еврото" },
  { href: "/transport", label: "Транспорт" },
  { href: "/prekysvaniya", label: "Прекъсвания на ток и вода" },
  { href: "/spodeleno-patuvane", label: "Споделено пътуване" },
  { href: "/zov-za-pomosht", label: "Зов за помощ" },
  { href: "/dobrovolci", label: "Доброволци" },
  { href: "/spomeni", label: "Спомени от Бобов дол" },
  { href: "/grada", label: "Опознай Бобов дол" },
  { href: "/galeriya", label: "Галерия" },
  { href: "/signali", label: "Сигнали до общината" },
  { href: "/smetishta", label: "Нерегламентирани сметища" },
  { href: "/kontakti", label: "Контакти" },
  { href: "/pechat", label: "Телефони за печат" },
  { href: "/pechat/plakat", label: "Плакат за разпечатване" },
  { href: "/reklama", label: "Реклама" },
  { href: "/pravila", label: "Общи условия" },
  { href: "/poveritelnost", label: "Поверителност" },
  { href: "/biskvitki", label: "Бисквитки" },
];
