// Централна конфигурация на сайта. Едно място за всички ключови факти,
// използвани в SEO, структурирани данни (JSON-LD), footer и контакти.
import { SECTION } from "@/lib/section-names";

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
    "Независим дигитален помощник за Бобов дол: местни услуги и телефони, как да ползвате е-услуги, събития, обяви и каталог на местния бизнес. Лесно, на едно място, за всички възрасти.",
  // slogan — за заглавието на началната и SEO (не се пипа); tagline — краткият
  // описател до името в хедъра и футъра. Казва честно, че сайтът е независим —
  // колкото по-институционален е видът, толкова по-ясно трябва да е, че това НЕ
  // е сайтът на общината.
  slogan: "Всичко за Бобов дол на едно място",
  tagline: "Независим граждански портал",
  // Изречението за независимостта — на всеки печатен лист и в края на всяка
  // отпечатана страница (PrintSourceLine): хедърът и футърът не се печатат.
  independence: "Независим граждански проект — не е официален сайт на Община Бобов дол.",
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
  // Данни за фирмата-администратор (за импринт / задължителни реквизити по
  // чл. 4 от Закона за електронната търговия и GDPR). Източник: официалните
  // данни, публикувани от самата фирма на carbonstealth.eu.
  company: {
    legalName: "Карбон Стелт ЕДПК",
    tradeName: "Carbon Stealth VCC",
    legalForm: "Еднолично дружество с променлив капитал (ЕДПК)",
    eik: "208725180",
    vat: "BG208725180",
    manager: "Стефан Костадинов",
    address: "ул. „Самуил“ № 3, 2670 Бобов дол, обл. Кюстендил, България",
    register:
      "Търговски регистър и регистър на ЮЛНЦ при Агенция по вписванията",
    email: "info@carbonstealth.eu",
    website: "https://carbonstealth.eu",
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
} as const;

export type NavItem = { href: string; label: string; description?: string };

export const PRIMARY_NAV: NavItem[] = [
  { href: "/kak-da", label: "Как да…", description: "Стъпка по стъпка за е\u2011услуги и документи" },
  { href: "/uslugi", label: "Услуги и телефони", description: "Важни местни телефони и услуги" },
  { href: "/izmami", label: "Пазете се от измами", description: "Как да разпознаете телефонни и онлайн измами" },
  { href: "/dezhurna-apteka", label: "Дежурна аптека", description: "Коя аптека и лекар работят сега" },
  { href: "/pomoshti", label: "Пенсии и помощи", description: "Пенсии, помощ за отопление, ТЕЛК и документи" },
  { href: "/danaci-srokove", label: "Данъци и срокове", description: "Кога и как да платите местните данъци и такси" },
  { href: "/evroto", label: "Еврото", description: "Всичко за еврото — въпроси и отговори" },
  { href: "/biznes", label: "Местен бизнес", description: "Каталог на търговци и занаятчии" },
  { href: "/sabitiya", label: "Събития", description: "Какво се случва в града" },
  { href: "/imen-den", label: "Именни дни", description: "Кой празнува днес и църковен календар" },
  { href: "/obyavi", label: "Обяви", description: "Безплатни местни обяви" },
  { href: "/transport", label: "Транспорт", description: "Такси, влак, автобуси и споделено пътуване" },
  { href: "/prekysvaniya", label: "Прекъсвания на ток и вода", description: "Планови и аварийни спирания на ток и вода" },
  { href: "/novini", label: "Новини", description: "Актуални съобщения" },
  { href: "/pomeni", label: "Некролози и помени", description: "Тъжни вести и възпоменания, подадени от близките" },
  { href: "/signali", label: "Сигнали до общината", description: "Подайте оплакване или сигнал" },
  { href: "/prozrachnost", label: "Прозрачност", description: "Къде отиват парите на общината (обществени поръчки)" },
  { href: "/smetishta", label: "Нерегламентирани сметища", description: "Подайте сигнал за незаконно сметище" },
  { href: "/grafik-smetosabirane", label: "График за сметосъбиране", description: "Кога се извозва отпадъкът по квартали" },
  { href: "/grada", label: "Опознайте Бобов\u00a0дол", description: "География, забележителности, природа и карта" },
  { href: "/istoriya", label: "История на града", description: "Историята на Бобов\u00a0дол по етапи" },
  { href: "/zov-za-pomosht", label: "Зов за помощ", description: "Взаимопомощ и подкрепа за възрастните" },
  { href: "/dobrovolci", label: "Доброволци", description: "Помощ от хора с добро сърце" },
  { href: "/spomeni", label: "Спомени от Бобов\u00a0дол", description: "Споделете спомен или стара снимка" },
  { href: "/galeriya", label: "Галерия", description: "Снимки на града от хората" },
];

export type NavGroup = { title: string; items: NavItem[] };

/** Раздел от PRIMARY_NAV по адрес — групите отдолу не повтарят етикетите. */
function pick(...hrefs: string[]): NavItem[] {
  return hrefs.map((href) => {
    const item = PRIMARY_NAV.find((i) => i.href === href);
    if (!item) throw new Error(`Няма раздел ${href} в PRIMARY_NAV`);
    return item;
  });
}

// Основното меню на компютър (вторият ред на хедъра) — най-търсеното, в
// реда на важност. Всичко останало е в „Всички раздели“.
export const TOP_NAV: NavItem[] = pick(
  "/kak-da",
  "/uslugi",
  "/dezhurna-apteka",
  "/pomoshti",
  "/danaci-srokove",
  "/izmami",
);

// „Пари и документи“ — пенсиите, данъците и еврото. Първите два са и в
// основното меню на компютър, но в мобилното меню и в „Всички раздели“ стоят
// в своя раздел (с eyebrow „Пари и документи“ над страницата).
const MONEY_NAV: NavItem[] = pick("/pomoshti", "/danaci-srokove", "/evroto");

// Всички раздели по групи — един източник за мобилното меню и за панела
// „Всички раздели“ на компютър. Всеки раздел от PRIMARY_NAV е точно веднъж, а
// заглавията са от SECTION — същите като eyebrow над страниците (проверява
// го тестът directory-nav).
export const NAV_GROUPS: NavGroup[] = [
  { title: SECTION.popular, items: TOP_NAV.filter((i) => !MONEY_NAV.includes(i)) },
  { title: SECTION.money, items: MONEY_NAV },
  {
    title: SECTION.daily,
    items: pick("/transport", "/prekysvaniya", "/grafik-smetosabirane", "/novini", "/sabitiya", "/imen-den"),
  },
  { title: SECTION.signals, items: pick("/signali", "/smetishta", "/prozrachnost") },
  { title: SECTION.community, items: pick("/obyavi", "/biznes", "/zov-za-pomosht", "/dobrovolci", "/pomeni") },
  { title: SECTION.city, items: pick("/grada", "/istoriya", "/spomeni", "/galeriya") },
];

// Правните връзки — в долната лента на футъра, отделно от съдържанието.
export const LEGAL_NAV: NavItem[] = [
  { href: "/pravila", label: "Общи условия" },
  { href: "/poveritelnost", label: "Поверителност" },
  { href: "/biskvitki", label: "Бисквитки" },
  { href: "/dostapnost", label: "Достъпност" },
];

// Групите във футъра. Пълният списък на разделите е в хедъра („Всички
// раздели“) — тук са само най-търсеното и страниците за самия сайт.
export const FOOTER_GROUPS: NavGroup[] = [
  {
    title: SECTION.popular,
    items: pick(
      "/uslugi",
      "/dezhurna-apteka",
      "/kak-da",
      "/pomoshti",
      "/danaci-srokove",
      "/izmami",
      "/transport",
      "/prekysvaniya",
      "/evroto",
    ),
  },
  {
    title: SECTION.site,
    items: [
      { href: "/za-nas", label: "За проекта" },
      { href: "/kak-da-polzvam-sayta", label: "Как да ползвам сайта" },
      { href: "/instaliraj", label: "Сложете сайта на телефона" },
      { href: "/izvestiya", label: "Известия" },
      { href: "/za-blizkite", label: "За близките" },
      { href: "/kontakti", label: "Контакти" },
      { href: "/reklama", label: "Реклама" },
      { href: "/novini/rss.xml", label: "RSS новини" },
    ],
  },
  {
    title: SECTION.participate,
    items: [
      { href: "/biznes/nova", label: "Добавете бизнес" },
      { href: "/spodeleno-patuvane", label: "Споделено пътуване" },
    ],
  },
  {
    // Етикетите = заглавията на листовете (SHEET_TITLE в PrintKit.tsx).
    title: SECTION.print,
    items: [
      { href: "/pechat", label: "Важни телефони за печат" },
      { href: "/pechat/plakat", label: "Плакат за разпечатване" },
      { href: "/pechat/sedmitsa", label: "Седмицата за печат" },
      { href: "/pechat/avtobus", label: "Автобусно разписание за печат" },
    ],
  },
];

/** Всички връзки във футъра (групите + правните) — за тестовете и картата. */
export const FOOTER_NAV: NavItem[] = [...FOOTER_GROUPS.flatMap((g) => g.items), ...LEGAL_NAV];

// Кратък списък под мобилното меню и в „Всички раздели“ — нещата, които иначе
// са само във футъра, а са най-полезни точно на телефона.
export const QUICK_NAV: NavItem[] = [
  { href: "/izvestiya", label: "Известия на телефона" },
  { href: "/instaliraj", label: "Сложете сайта на телефона" },
  { href: "/za-blizkite", label: "За близките" },
  { href: "/kontakti", label: "Контакти" },
];

// Бързите връзки в началния герой (от sm нагоре) — ежедневните неща, които ги
// няма в 6-те големи карти точно отдолу (иначе „Как да…“ се повтаряше 5 пъти
// на първите два екрана).
export const QUICK_DAILY: NavItem[] = pick(
  "/prekysvaniya",
  "/transport",
  "/grafik-smetosabirane",
  "/imen-den",
  "/novini",
);

/** Разделите, чието иконно квадратче е червено (цветова роля „опасност“). */
export function isDangerNav(href: string): boolean {
  return href === "/izmami";
}

/** Адрес, който е файл/канал (RSS), а не страница — за него е обикновен <a>. */
export function isFeedHref(href: string): boolean {
  return /\.xml$/i.test(href);
}

/**
 * Български номер за четене от човек: „+359877414874“ → „0877 414 874“.
 * Непознат формат се връща непроменен (в tel: така или иначе отиват цифрите).
 */
export function localPhone(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  const national = digits.startsWith("+359") ? "0" + digits.slice(4) : digits.startsWith("00359") ? "0" + digits.slice(5) : digits;
  // Мобилни: 08X/09X + 7 цифри → „0877 414 874“.
  const m = /^(0[89]\d{2})(\d{3})(\d{3})$/.exec(national);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : phone;
}
