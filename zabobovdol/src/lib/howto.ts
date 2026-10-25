// Чиста логика за ръководствата „Как да…“: теми (категории) с адреси, дубли,
// страници, „отговор отпред“ и дати. Без база и без "server-only" — тества се
// с node:test. Данните идват от `howto-index.ts`.
import { z } from "zod";
import { slugify } from "@/lib/slug";

/** Колко ръководства има на една страница от тема. */
export const GUIDES_PER_PAGE = 24;
/** Колко „най-четени“ се показват под всяка тема на /kak-da. */
export const TOP_PER_CATEGORY = 3;

export type GuideIndexItem = {
  id: string;
  slug: string;
  question: string;
  category: string;
  tags: string;
  order: number;
  views: number;
  createdAt: Date;
  updatedAt: Date;
};

export type CategoryGroup = {
  slug: string;
  /** Името, което се показва (най-често срещаното при еднакъв адрес). */
  name: string;
  /** Всички имена от базата, които водят до същия адрес. */
  names: string[];
  count: number;
  /** Подредени по `order`, после по slug — стабилно между страниците. */
  items: GuideIndexItem[];
  /** Най-четените (по брояча на прегледи). */
  top: GuideIndexItem[];
  /** Реалната последна редакция в темата (за sitemap). */
  lastModified: Date;
};

// --- Теми: синоними и раздели ---

/**
 * Карта-синоним: имена на теми от базата, които значат едно и също → едно
 * канонично име. Базата не се пипа — сливането е при показване: старият адрес
 * на темата (`/kak-da/kategoriya/izmami-i-bezopasnost`) води с 308 към
 * каноничния, а ръководствата влизат в каноничната тема навсякъде (списъци,
 * трохи, „Сродни“, sitemap). Нов дубъл в базата → един ред тук.
 */
export const CATEGORY_SYNONYMS: Readonly<Record<string, string>> = {
  "Измами и безопасност": "Безопасност и измами",
  "Интернет и онлайн безопасност": "Безопасност и измами",
  "Забавление": "Забавление и хобита",
  "Достъпност (за по-лесно ползване)": "Достъпност",
  "Здраве и грижа": "Здраве",
  "Здраве и първа помощ": "Здраве",
  "Пари, карта и банкомат": "Пари, сметки и права",
  "Интернет и браузър": "Смартфон и интернет",
};

// По адрес (slug), за да работи и за име, и за стар адрес, и за „еврото“/„Еврото“.
const SYNONYM_SLUGS = new Map(
  Object.entries(CATEGORY_SYNONYMS).map(([from, to]) => [slugify(from), slugify(to)]),
);
const CANONICAL_NAMES = new Map(
  Object.values(CATEGORY_SYNONYMS).map((name) => [slugify(name), name]),
);

/**
 * Адресът на темата от кирилско име или от стар адрес („Еврото“ → „evroto“,
 * „Измами и безопасност“ → „bezopasnost-i-izmami“). Синонимите дават
 * каноничния адрес; иначе — детерминистичен slug.
 */
export function categorySlug(name: string): string {
  const s = slugify(name);
  return SYNONYM_SLUGS.get(s) ?? s;
}

/** Името на темата, както се показва (каноничното при синоним). */
export function canonicalCategory(name: string): string {
  return CANONICAL_NAMES.get(categorySlug(name)) ?? name.trim();
}

// Тема → съдържателна страница на сайта със същата тема (връзка „Вижте и…“).
const TOPIC_PAGES: Record<string, { href: string; label: string }> = {
  [categorySlug("Еврото")]: { href: "/evroto", label: "Еврото — въпроси и отговори" },
  [categorySlug("Пенсии и социални помощи")]: { href: "/pomoshti", label: "Пенсии и помощи" },
  [categorySlug("Безопасност и измами")]: { href: "/izmami", label: "Пазете се от измами" },
  [categorySlug("Достъпност")]: { href: "/dostapnost", label: "Достъпност на сайта" },
};

/** Съдържателната страница за темата (или null). Приема име или адрес. */
export function topicPageFor(name: string): { href: string; label: string } | null {
  return TOPIC_PAGES[categorySlug(name)] ?? null;
}

/** Темата, чиито ръководства показва /izmami. */
export const SCAM_TOPIC = "Безопасност и измами";

// Оригиналните теми в реда, в който /izmami ги показва: първо ръководствата
// точно за измамите („Какво да направя, ако вече дадох пари?“, „Измамник на
// вратата“), после общата безопасност и чак тогава слетите синоними
// („Интернет и онлайн безопасност“ — официален сайт, адрес, фалшиви новини).
const SCAM_CATEGORY_PRIORITY = ["Измами и безопасност", SCAM_TOPIC];

/**
 * Първите `n` ръководства за /izmami от слетата тема: по приоритет на
 * оригиналната тема (SCAM_CATEGORY_PRIORITY), после по реда в темата.
 */
export function pickScamGuides<T extends Pick<GuideIndexItem, "category">>(items: T[], n: number): T[] {
  const rank = (c: string) => {
    const i = SCAM_CATEGORY_PRIORITY.indexOf(c.trim());
    return i === -1 ? SCAM_CATEGORY_PRIORITY.length : i;
  };
  return items
    .map((it, i) => ({ it, i, r: rank(it.category) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .slice(0, n)
    .map((x) => x.it);
}

/**
 * Разделите на /kak-da: темите (каноничните имена) в 6 смислови групи, за да
 * не се превърта през 30 карти подред. Тема, която я няма тук (нова в базата),
 * отива в „Други теми“ — нищо не се губи.
 */
export const TOPIC_SECTIONS: readonly { id: string; title: string; topics: readonly string[] }[] = [
  {
    id: "telefonat",
    title: "Телефонът стъпка по стъпка",
    topics: [
      "Смартфон и интернет",
      "Настройки на телефона",
      "Писане и клавиатура",
      "Снимки, видео и галерия",
      "Памет, място и облак",
      "Всекидневни помощници",
      "Технологии (основни понятия)",
    ],
  },
  {
    id: "saobshteniya",
    title: "Съобщения, имейл и акаунти",
    topics: [
      "Viber, Messenger и WhatsApp",
      "Facebook (стъпка по стъпка)",
      "Имейл (Gmail)",
      "Акаунти и пароли",
      "Онлайн пазаруване",
    ],
  },
  {
    id: "dokumenti-pari",
    title: "Документи, пари и пенсии",
    topics: ["Документи и плащания", "Пари, сметки и права", "Пенсии и социални помощи", "Еврото"],
  },
  {
    id: "zdrave-grizha",
    title: "Здраве и грижа",
    topics: ["Здраве", "Грижа за близък", "Достъпност"],
  },
  {
    id: "bezopasnost",
    title: "Безопасност",
    topics: ["Безопасност и измами", "Дом и безопасност"],
  },
  {
    id: "vsekidnevie",
    title: "Ежедневие и свободно време",
    topics: [
      "Общуване и всекидневие",
      "Кухня и хранене",
      "Транспорт и пътуване",
      "Карти и навигация",
      "Забавление и хобита",
    ],
  },
];

/** Разделът (от TOPIC_SECTIONS), в който е темата — за eyebrow над заглавието. */
export function topicSectionOf(name: string): { id: string; title: string } | null {
  const slug = categorySlug(name);
  const s = TOPIC_SECTIONS.find((x) => x.topics.some((t) => categorySlug(t) === slug));
  return s ? { id: s.id, title: s.title } : null;
}

export type TopicSection<C> = { id: string; title: string; categories: C[] };

/**
 * Подрежда темите по разделите на TOPIC_SECTIONS (в реда на списъка там).
 * Празни раздели не се връщат; непознатите теми — в „Други теми“ накрая.
 */
export function sectionCategories<C extends { slug: string }>(categories: C[]): TopicSection<C>[] {
  const bySlug = new Map(categories.map((c) => [c.slug, c]));
  const used = new Set<string>();
  const out: TopicSection<C>[] = [];
  for (const s of TOPIC_SECTIONS) {
    const list: C[] = [];
    for (const name of s.topics) {
      const slug = categorySlug(name);
      const c = bySlug.get(slug);
      if (c && !used.has(slug)) {
        list.push(c);
        used.add(slug);
      }
    }
    if (list.length) out.push({ id: s.id, title: s.title, categories: list });
  }
  const rest = categories.filter((c) => !used.has(c.slug));
  if (rest.length) out.push({ id: "drugi", title: "Други теми", categories: rest });
  return out;
}

export function categoryPath(slug: string, page = 1): string {
  const base = `/kak-da/kategoriya/${slug}`;
  return page > 1 ? `${base}?page=${page}` : base;
}

/** „1 ръководство“, „5 ръководства“. */
export function guidesLabel(n: number): string {
  return `${n} ${n === 1 ? "ръководство" : "ръководства"}`;
}

/** Етикетите от полето „запетая-разделени“ — без празни и без повторения. */
export function parseTags(tags: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of (tags ?? "").split(",")) {
    const t = raw.trim();
    const key = t.toLowerCase();
    if (!t || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

export function hasTag(item: Pick<GuideIndexItem, "tags">, tag: string): boolean {
  const want = tag.trim().toLowerCase();
  return want.length > 0 && parseTags(item.tags).some((t) => t.toLowerCase() === want);
}

export function sortGuides<T extends Pick<GuideIndexItem, "order" | "slug">>(items: T[]): T[] {
  return [...items].sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
}

export function topByViews<T extends Pick<GuideIndexItem, "views" | "order" | "slug">>(
  items: T[],
  n: number,
): T[] {
  return [...items]
    .sort((a, b) => b.views - a.views || a.order - b.order || a.slug.localeCompare(b.slug))
    .slice(0, n);
}

/** Сравнение на въпроси за дословни дубли: регистър, интервали, крайна пунктуация. */
export function normalizeQuestion(q: string): string {
  return (q ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[?!.…\s]+$/u, "");
}

// Дословни дубли (един и същ въпрос в два записа) → кой адрес остава. Остава
// най-старият запис (после по азбучен slug), за да не „скача“ пренасочването,
// когато броячът на прегледи се промени. Връща slug-на-дубъл → slug-който-остава.
export function duplicateRedirects(
  items: Pick<GuideIndexItem, "slug" | "question" | "createdAt">[],
): Map<string, string> {
  const groups = new Map<string, Pick<GuideIndexItem, "slug" | "question" | "createdAt">[]>();
  for (const it of items) {
    const key = normalizeQuestion(it.question);
    if (!key) continue;
    const arr = groups.get(key) ?? [];
    arr.push(it);
    groups.set(key, arr);
  }
  const out = new Map<string, string>();
  for (const arr of groups.values()) {
    if (arr.length < 2) continue;
    const sorted = [...arr].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.slug.localeCompare(b.slug),
    );
    const keep = sorted[0].slug;
    for (const it of sorted.slice(1)) out.set(it.slug, keep);
  }
  return out;
}

/**
 * Групира ръководствата по тема. Имена с еднакъв адрес (и синонимите от
 * CATEGORY_SYNONYMS) се сливат в една тема с каноничното име.
 */
export function groupCategories(items: GuideIndexItem[], topN = TOP_PER_CATEGORY): CategoryGroup[] {
  const bySlug = new Map<string, { names: Map<string, number>; items: GuideIndexItem[] }>();
  for (const it of items) {
    const slug = categorySlug(it.category);
    const g = bySlug.get(slug) ?? { names: new Map<string, number>(), items: [] };
    g.names.set(it.category, (g.names.get(it.category) ?? 0) + 1);
    g.items.push(it);
    bySlug.set(slug, g);
  }
  const groups: CategoryGroup[] = [];
  for (const [slug, g] of bySlug) {
    const names = [...g.names.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "bg"),
    );
    const sorted = sortGuides(g.items);
    groups.push({
      slug,
      name: CANONICAL_NAMES.get(slug) ?? names[0][0],
      names: names.map(([n]) => n).sort((a, b) => a.localeCompare(b, "bg")),
      count: sorted.length,
      items: sorted,
      top: topByViews(sorted, topN),
      lastModified: new Date(Math.max(...sorted.map((i) => i.updatedAt.getTime()))),
    });
  }
  return groups.sort((a, b) => a.name.localeCompare(b.name, "bg"));
}

// --- Страници ---

export function pageCount(total: number, size = GUIDES_PER_PAGE): number {
  return Math.max(1, Math.ceil(total / size));
}

export function pageSlice<T>(items: T[], page: number, size = GUIDES_PER_PAGE): T[] {
  return items.slice((page - 1) * size, page * size);
}

const PageParam = z.string().regex(/^[1-9]\d{0,3}$/).transform(Number);

/**
 * `?page=` от адреса. Липсващ → 1. Невалиден (0, -1, „abc“, масив) → null,
 * за да върне страницата 404, вместо да покаже дубликат на първата.
 */
export function parsePageParam(raw: string | string[] | undefined): number | null {
  if (raw === undefined) return 1;
  const r = PageParam.safeParse(raw);
  return r.success ? r.data : null;
}

/** Номерата за навигацията: всички при малко страници, иначе прозорец около текущата. */
export function pageWindow(page: number, total: number, span = 2): number[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set<number>([1, total]);
  for (let p = page - span; p <= page + span; p++) if (p >= 1 && p <= total) set.add(p);
  return [...set].sort((a, b) => a - b);
}

// --- „Отговор отпред“ ---

const ABBREVIATIONS = new Set([
  "гр", "ул", "бул", "обл", "с", "кв", "бл", "вх", "ет", "ап", "ж.к", "напр", "вкл",
  "т.е", "т.нар", "тел", "д-р", "проф", "доц", "инж", "г-н", "г-жа", "мин", "ч", "лв", "бр", "№",
]);

// Къде свършва първото изречение, без да режем посред **удебелено**, [връзка]
// или съкращение („гр. Бобов дол“). -1, ако няма безопасно място.
function firstSentenceEnd(text: string): number {
  // Край = препинателен знак (+ затварящо **), после интервал и главна буква/кавичка.
  const re = /[.!?…]+(?:\*\*)?(?=\s+[„"(*А-ЯA-Z0-9])/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const end = m.index + m[0].length;
    const before = text.slice(0, end);
    const boldOpen = (before.match(/\*\*/g) ?? []).length % 2 === 1;
    const linkOpen = before.lastIndexOf("[") > before.lastIndexOf(")");
    const word = /([\p{L}.\-№]+)$/u.exec(text.slice(0, m.index))?.[1]?.toLowerCase() ?? "";
    const abbr = m[0].startsWith(".") && ABBREVIATIONS.has(word);
    if (boldOpen || linkOpen || abbr) continue;
    return end;
  }
  return -1;
}

const LEAD_MAX = 320;

/**
 * Отделя „отговора отпред“ — първия абзац (или първото изречение на дълъг
 * абзац) — от останалия текст. Ако текстът започва със заглавие, списък или
 * цитат, връща null и страницата показва текста както е. Етикет „Кратко:“ /
 * „Накратко:“ в началото се маха, защото блокът вече има такъв надпис.
 */
export function splitLead(markdown: string): { lead: string; rest: string } | null {
  const src = (markdown ?? "").replace(/\r\n/g, "\n").trim();
  if (!src) return null;
  const blocks = src.split(/\n\s*\n/);
  const lines = blocks[0].split("\n");
  if (lines.some((l) => /^\s*(#{1,3}\s|[-*]\s|\d+\.\s|>)/.test(l))) return null;

  let para = lines.map((l) => l.trim()).join(" ");
  para = para
    .replace(/^\*\*\s*(?:накратко|кратко)\s*:\s*\*\*\s*/iu, "")
    .replace(/^\*\*\s*(?:накратко|кратко)\s*\*\*\s*:\s*/iu, "")
    .replace(/^(?:накратко|кратко)\s*:\s*/iu, "");
  if (!para) return null;

  let rest = blocks.slice(1).join("\n\n");
  if (para.length > LEAD_MAX) {
    const end = firstSentenceEnd(para);
    if (end > 0 && end < para.length) {
      const tail = para.slice(end).trim();
      para = para.slice(0, end).trim();
      rest = tail + (rest ? `\n\n${rest}` : "");
    }
  }
  return { lead: para, rest };
}

// --- Дати ---

/** „12 октомври 2026 г.“ по софийско време. */
export function formatBgDate(d: Date): string {
  return new Intl.DateTimeFormat("bg-BG", {
    timeZone: "Europe/Sofia",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

/** ГГГГ-ММ-ДД по софийско време — за `<time dateTime>` и `lastReviewed`. */
export function isoDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Sofia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
