// pricing.mjs — ЕДИНСТВЕНИЯТ източник на числата за цени. Текстовете живеят в i18n/*.mjs,
// числата тук; страницата и тестовете четат оттук, за да не може таблицата да лъже.
//
// ДДС КОНВЕНЦИЯ (решение на собственика, 2026-09-17; същата като на carbonstealth.eu —
// cs-revolution/src/pricing.json @ c841100e4, генератор scripts/generate-pricing.py): числата в
// TIERS/ADDONS са БРУТНИ — така се показват на българската версия („с включен 20% ДДС“).
// Италианската и английската показват НЕТНИ цени: брутната ÷ 1,20, закръглена до цял евро
// („IVA esclusa“ / „excl. VAT“; ДДС не се плаща само от фирми с валиден ДДС номер, частните
// лица го плащат винаги). Пазарната референция е нетна (проучването) — за BG се вдига ×1,20,
// за да е сравнима. Числата на сайта и тук са едни и същи; тестът ги пази равни.
//
// Пазарната референция (`market`) е средна агенцийна цена в EUR без ДДС, изведена от публични
// ценови прегледи за 2026 (BG · IT · ЕС) — виж docs/PRICING-RESEARCH.md за диапазоните и
// източниците. Правилото на собственика: нашата цена е ПОНЕ 15% под референцията (гейтвано).

export const MIN_DISCOUNT = 0.15;
export const CURRENCY = "EUR";
export const RESEARCH_DATE = "2026-09-17";

/** Пакети: id · цена · пазарна референция · срок (работни дни). */
export const TIERS = [
  { id: "start",     price: 790,  market: 950,  days: [5, 7],   popular: false },
  { id: "business",  price: 1890, market: 2300, days: [10, 15], popular: true },
  { id: "premium",   price: 4290, market: 5200, days: [20, 30], popular: false },
  { id: "ecommerce", price: 2190, market: 2600, days: [15, 25], popular: false },
];

/** Добавки: еднократни (`once`) или месечни (`monthly`). */
export const ADDONS = [
  { id: "language",    price: 350, market: 500, kind: "once" },
  { id: "page",        price: 120, market: 150, kind: "once" },
  { id: "logo",        price: 390, market: 480, kind: "once" },
  { id: "copy",        price: 90,  market: 110, kind: "once" },
  { id: "maintenance", price: 69,  market: 85,  kind: "monthly" },
  { id: "seo",         price: 290, market: 350, kind: "monthly" },
  { id: "hosting",     price: 15,  market: 19,  kind: "monthly" },
];

/** Отстъпка спрямо пазара, в проценти (закръглена надолу — никога не обещаваме повече, отколкото е). */
export const discountPct = (item) => Math.floor((1 - item.price / item.market) * 100);

export const VAT_RATE_BG = 20;
export const VAT_MULT = 1.2;
/** Коя версия показва бруто (с ДДС) и коя нето (без ДДС). */
export const VAT_CONVENTION = { bg: "gross", en: "net", it: "net" };
/** Нето от бруто: ÷1,20 и закръгляне до цял евро (ROUND_HALF_UP като на сайта). */
export const net = (n) => Math.round(n / VAT_MULT);
export const gross = (n) => Math.round(n * VAT_MULT);
/** Нашата цена, както я вижда читателят на дадения език (BG бруто, IT/EN нето). */
export const shown = (n, lang) => (VAT_CONVENTION[lang] === "gross" ? n : net(n));
/** Пазарната референция е нетна; за BG я вдигаме с ДДС, за да е сравнима с нашата брутна цена. */
export const shownMarket = (n, lang) => (VAT_CONVENTION[lang] === "gross" ? gross(n) : n);
/** Часова ставка извън обхвата: 54 € бруто = 45 € нето. */
export const HOURLY_GROSS = 54;

/** Пазарни диапазони, показани на страницата като доказателство (EUR без ДДС). */
export const MARKET_RANGES = [
  { id: "landing",   bg: [360, 770],   it: [400, 1500],  eu: [300, 800] },
  { id: "business",  bg: [770, 2560],  it: [2000, 5000], eu: [2500, 6000] },
  { id: "corporate", bg: [2050, 7670], it: [3500, 8500], eu: [4500, 15000] },
  { id: "ecommerce", bg: [1280, 4090], it: [1400, 6500], eu: [2000, 8000] },
  { id: "maint",     bg: [67, 100],    it: [50, 200],    eu: [50, 200] },
  { id: "seo",       bg: [150, 500],   it: [400, 3000],  eu: [400, 2000] },
];

/** Публичните източници на прегледа (цитирани на страницата — нищо измислено). */
export const SOURCES = [
  { name: "saitami.bg — Колко струва сайт в България през 2026", url: "https://saitami.bg/kolko-struva-sait-2026" },
  { name: "denvelkoff.studio — Цена за изработка на сайт (2026)", url: "https://denvelkoff.studio/blog/cena-za-izrabotka-na-sait/" },
  { name: "codingturtles.com — Реални цени (2026)", url: "https://codingturtles.com/kolko-struva-izrabotka-na-sait" },
  { name: "tedbg.com — Цени за изработка на онлайн магазин 2026", url: "https://tedbg.com/ceni-za-izrabotka-na-onlayn-magazin" },
  { name: "spinfludigital.com — SEO цени и пакети в България (2026)", url: "https://spinfludigital.com/blog-bg/seo-optimizacia-ceni-bulgaria" },
  { name: "artworkstudios.it — Quanto costa un sito web nel 2026", url: "https://www.artworkstudios.it/sito-web/quanto-costa-un-sito-web-nel-2026/" },
  { name: "lorenzoalbano.it — Prezzi reali 2026", url: "https://www.lorenzoalbano.it/quanto-costa-sito-web-2026/" },
  { name: "dueelleweb.it — Costo manutenzione sito web 2026", url: "https://dueelleweb.it/blog/sito-web/costo-manutenzione-sito-web-annuale-guida-completa-ai-prezzi-2026.html" },
  { name: "valentinomea.it — Costi SEO 2026", url: "https://www.valentinomea.it/costi-seo/" },
  { name: "webars.at — Website costs in Europe 2026", url: "https://webars.at/en/blog/website-cost-europe" },
  { name: "sunbytes.io — Website development cost Europe 2026", url: "https://sunbytes.io/blog/software-development/website-development-cost-europe/" },
];

/** Хилядите по езика (BG тясно неделимо пространство · EN запетая · IT точка); „1 890 €“ както на сайта. */
const SEP = { bg: "\u202F", en: ",", it: "." };
export const fmt = (n, lang = "bg") => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, SEP[lang] || SEP.bg);
export const money = (n, lang = "bg") => `${fmt(n, lang)} €`;
/** Плейсхолдърите в текстовете за дадения език: {start} {business} {premium} {ecommerce} {hosting} {hourly}. */
export function numbers(lang) {
  const d = Object.fromEntries(TIERS.map((t) => [t.id, fmt(shown(t.price, lang), lang)]));
  d.hosting = fmt(shown(ADDONS.find((a) => a.id === "hosting").price, lang), lang);
  d.hourly = fmt(shown(HOURLY_GROSS, lang), lang);
  return d;
}
/** Текст с попълнени числа по езика. */
export const tx = (s, lang) => String(s).replace(/\{(start|business|premium|ecommerce|hosting|hourly)\}/g, (_, k) => numbers(lang)[k]);
