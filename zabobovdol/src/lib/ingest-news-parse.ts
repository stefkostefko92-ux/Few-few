// Чистият четец на новините от общината — без база и без server-only, за да се
// тества (src/lib/__tests__/ingest-news.test.ts). Записът е в ./ingest-news.ts.
//
// Защо е строг: старият четец взимаше ВСЯКА връзка от същия домейн с текст 18–220
// знака и така внесе 15 страници от МЕНЮТО на портала („Характеристики на
// общината“, „Правомощия на Кмета“…) като „новини“. Сега от HTML списък се приемат
// САМО връзки по шаблон (MUNICIPALITY_NEWS_LINK_PATTERN) и САМО с дата до тях.
// Нищо не съвпада → нищо не се внася (fail closed), а отчетът казва защо.

export const MUNICIPALITY_SOURCE = "Община Бобов дол";

export const DEFAULT_NEWS_URL =
  "https://bobovdol.egov.bg/wps/portal/municipality-bobovdol/actual/news";

// Отделна новина на портала egov.bg: …/actual/news/<адрес>. Не съвпадат: самият
// списък (…/actual/news), страниране и състояния на портлета (…/actual/news/!ut/p/…)
// и всичко от менюто (…/municipality/…, …/administration/…).
export const DEFAULT_NEWS_LINK_PATTERN = String.raw`/actual/news/[^/?#!][^?#]*`;

const MAX_PATTERN_LENGTH = 300;

export type RawItem = { title: string; link: string; summary: string; date: Date };

export type ParseOptions = {
  /** Шаблон за адреса на отделна новина (виж resolveLinkPattern). */
  linkPattern: RegExp;
  /** „Сега“ — за теста; по подразбиране текущият момент. */
  now?: Date;
  /** Дата по-далеч в бъдещето от толкова дни не е дата на публикуване. */
  maxFutureDays?: number;
};

export type ParseReport = {
  kind: "feed" | "html";
  items: RawItem[];
  /** Колко връзки (или записа в канала) е видял четецът. */
  anchors: number;
  /** Колко от тях отговарят на шаблона (за HTML) / имат заглавие и връзка (канал). */
  matched: number;
  /** Колко съвпадения са отхвърлени, защото нямат дата. */
  withoutDate: number;
};

// Шаблонът идва от средата (MUNICIPALITY_NEWS_LINK_PATTERN). Празно → по
// подразбиране. Невалиден или прекалено дълъг → грешка: по-добре вносът да спре,
// отколкото да внесе каквото му падне.
export function resolveLinkPattern(raw: string | null | undefined): RegExp {
  const src = String(raw ?? "").trim() || DEFAULT_NEWS_LINK_PATTERN;
  if (src.length > MAX_PATTERN_LENGTH) {
    throw new Error("MUNICIPALITY_NEWS_LINK_PATTERN е прекалено дълъг.");
  }
  try {
    // Без флаг „u“: той отхвърля обичайни изписвания като „\-“ в шаблона.
    return new RegExp(src, "i");
  } catch {
    throw new Error("MUNICIPALITY_NEWS_LINK_PATTERN не е валиден регулярен израз.");
  }
}

function safeDecodeUri(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

// Шаблонът се проверява срещу декодирания адрес (път + заявка), за да хваща и
// адреси на портала от вида ?urile=wcm%3Apath%3A%2F…%2Factual%2Fnews%2F….
export function isNewsLink(href: string, pattern: RegExp): boolean {
  if (!href) return false;
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    return false;
  }
  return pattern.test(safeDecodeUri(u.pathname + u.search));
}

// Един и същ адрес без котва, без опашна наклонена черта и без utm_* — за да не
// се внесе една новина два пъти заради разлика в изписването.
export function canonicalLink(href: string): string {
  try {
    const u = new URL(href);
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) {
      if (/^utm_/i.test(k) || k === "fbclid") u.searchParams.delete(k);
    }
    if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "");
    return u.toString();
  } catch {
    return href;
  }
}

// --- текст ---

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  laquo: "«",
  raquo: "»",
  bdquo: "„",
  ldquo: "“",
  rdquo: "”",
};

function decode(s: string): string {
  return s
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d{1,7});/g, (_, n) => safeCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m)
    .trim();
}

function safeCodePoint(n: number): string {
  try {
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
  } catch {
    return "";
  }
}

// Текст без тагове. Второто махане е за канали, които пращат HTML като
// &lt;p&gt;…&lt;/p&gt; — след декодирането той пак е таг.
function stripTags(s: string): string {
  const once = decode(s.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]*>/g, " "));
  return once.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function toAbsolute(base: string, href: string): string | null {
  try {
    const u = new URL(decode(href), base);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

// --- дата ---

const MONTHS = [
  "януари",
  "февруари",
  "март",
  "април",
  "май",
  "юни",
  "юли",
  "август",
  "септември",
  "октомври",
  "ноември",
  "декември",
];
const NUMERIC_DATE = /(?<!\d)(\d{1,2})[./](\d{1,2})[./](\d{4})(?!\d)/g;
const WORD_DATE = new RegExp(`(?<!\\d)(\\d{1,2})\\s+(${MONTHS.join("|")})\\s+(\\d{4})(?!\\d)`, "giu");

// Денят по календара, по обед UTC — същата дата в София при всяко часово време
// на сървъра.
function makeDay(y: number, m: number, d: number): Date | undefined {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return undefined;
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt : undefined;
}

type Found = { index: number; date: Date };

function findDates(text: string): Found[] {
  const out: Found[] = [];
  for (const m of text.matchAll(NUMERIC_DATE)) {
    const d = makeDay(Number(m[3]), Number(m[2]), Number(m[1]));
    if (d) out.push({ index: m.index ?? 0, date: d });
  }
  for (const m of text.matchAll(WORD_DATE)) {
    const d = makeDay(Number(m[3]), MONTHS.indexOf(m[2].toLowerCase()) + 1, Number(m[1]));
    if (d) out.push({ index: m.index ?? 0, date: d });
  }
  return out.sort((a, b) => a.index - b.index);
}

function plausible(d: Date | undefined, opts: ParseOptions): Date | undefined {
  if (!d) return undefined;
  const now = (opts.now ?? new Date()).getTime();
  const ahead = (opts.maxFutureDays ?? 2) * 86_400_000;
  return d.getTime() <= now + ahead ? d : undefined;
}

function parseFeedDate(s: string | undefined, opts: ParseOptions): Date | undefined {
  if (!s) return undefined;
  const text = stripTags(s);
  const local = findDates(text)[0]?.date;
  if (local) return plausible(local, opts);
  const d = new Date(text);
  return isNaN(d.getTime()) ? undefined : plausible(d, opts);
}

// --- RSS / Atom ---

export function looksLikeFeed(text: string): boolean {
  return /<rss\b|<feed\b|<rdf:RDF/i.test(text.slice(0, 800));
}

function parseFeed(xml: string, base: string, opts: ParseOptions): ParseReport {
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) ?? [];
  const items: RawItem[] = [];
  let matched = 0;
  let withoutDate = 0;
  for (const b of blocks) {
    const title = stripTags(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(b)?.[1] ?? "");
    const rawLink =
      /<link[^>]*href="([^"]+)"/i.exec(b)?.[1] ||
      stripTags(/<link[^>]*>([\s\S]*?)<\/link>/i.exec(b)?.[1] ?? "") ||
      stripTags(/<guid[^>]*>([\s\S]*?)<\/guid>/i.exec(b)?.[1] ?? "");
    const link = rawLink ? toAbsolute(base, rawLink) : null;
    if (!title || !link) continue;
    matched++;
    const date = parseFeedDate(
      /<(pubDate|published|updated|dc:date)[^>]*>([\s\S]*?)<\/\1>/i.exec(b)?.[2],
      opts,
    );
    if (!date) {
      withoutDate++;
      continue;
    }
    const summary = stripTags(
      /<(description|summary|content)[^>]*>([\s\S]*?)<\/\1>/i.exec(b)?.[2] ?? "",
    ).slice(0, 400);
    items.push({ title: title.slice(0, 300), link: canonicalLink(link), summary, date });
  }
  return { kind: "feed", items, anchors: blocks.length, matched, withoutDate };
}

// --- HTML списък ---

// Текст на връзка, който не е заглавие на новина. (Без \b — в JS той не вижда
// границата на кирилска дума.)
const NOT_A_TITLE =
  /^(прочети|прочетете|виж|вижте|още|повече|научи|следващ\S*|предишн\S*|назад|напред|всички|начало)(?=\s|$)|прочети повече|виж повече|^\d+$/iu;
const WINDOW = 400;

type Anchor = { start: number; end: number; href: string; text: string };

export function parseHtmlListingReport(html: string, base: string, opts: ParseOptions): ParseReport {
  let host = "";
  try {
    host = new URL(base).host;
  } catch {
    /* остава празно → чуждите домейни отпадат по-долу */
  }

  const anchors: Anchor[] = [];
  const anchorRe = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a\s*>/gi;
  for (const m of html.matchAll(anchorRe)) {
    const href = toAbsolute(base, m[1] ?? m[2] ?? "");
    if (!href) continue;
    const start = m.index ?? 0;
    anchors.push({ start, end: start + m[0].length, href, text: stripTags(m[3] ?? "") });
  }

  // Само връзките по шаблона и от същия домейн — те са „новините“. Подредбата им
  // разделя страницата на парчета: датата/резюмето на новина се търсят само между
  // съседните ѝ връзки-новини, за да не се „заеме“ датата на друга.
  const news = anchors.filter((a) => {
    try {
      if (!host || new URL(a.href).host !== host) return false;
    } catch {
      return false;
    }
    return isNewsLink(a.href, opts.linkPattern);
  });

  // 1) Кандидатите: първата връзка с истинско заглавие за всеки адрес, с най-
  //    близката дата ПРЕДИ нея и първата дата СЛЕД нея (в рамките на парчето).
  type Candidate = {
    title: string;
    link: string;
    before?: Date;
    after?: Date;
    afterHtml: string;
  };
  const candidates: Candidate[] = [];
  const titled = new Set<string>();
  for (let i = 0; i < news.length; i++) {
    const a = news[i];
    const link = canonicalLink(a.href);
    if (titled.has(link)) continue;
    const title = a.text;
    if (title.length < 12 || title.length > 300 || !/\s/.test(title) || NOT_A_TITLE.test(title)) {
      continue; // снимка, „Прочети повече“ и т.н. — заглавието е в друга връзка
    }
    titled.add(link);
    const prevEnd = i > 0 ? news[i - 1].end : 0;
    const nextStart = i + 1 < news.length ? news[i + 1].start : html.length;
    const before = findDates(stripTags(html.slice(Math.max(prevEnd, a.start - WINDOW), a.start)));
    const afterHtml = html.slice(a.end, Math.min(nextStart, a.end + WINDOW));
    candidates.push({
      title,
      link,
      before: before.length ? before[before.length - 1].date : undefined,
      after: findDates(stripTags(afterHtml))[0]?.date,
      afterHtml,
    });
  }

  // 2) Страницата има ЕДИН шаблон: датата е или преди, или след заглавието.
  //    Страната се избира веднъж, по мнозинство — иначе при „заглавие, дата,
  //    заглавие, дата“ новина би „заела“ датата на предишната (грешка с едно).
  const nBefore = candidates.filter((c) => c.before).length;
  const nAfter = candidates.filter((c) => c.after).length;
  const side: "before" | "after" = nAfter > nBefore ? "after" : "before";

  const items: RawItem[] = [];
  let withoutDate = 0;
  for (const c of candidates) {
    const date = plausible(side === "before" ? c.before : c.after, opts);
    if (!date) {
      withoutDate++; // fail closed: без дата от същата страна → не се внася
      continue;
    }
    const p = /<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(c.afterHtml)?.[1];
    const summary = p ? stripTags(p).slice(0, 400) : "";
    items.push({ title: c.title, link: c.link, summary, date });
  }

  return {
    kind: "html",
    items,
    anchors: anchors.length,
    matched: new Set(news.map((a) => canonicalLink(a.href))).size,
    withoutDate,
  };
}

export function parseHtmlListing(html: string, base: string, opts: ParseOptions): RawItem[] {
  return parseHtmlListingReport(html, base, opts).items;
}

// Канал (RSS/Atom), ако източникът е такъв; иначе — строгият HTML четец.
export function parseListing(text: string, base: string, opts: ParseOptions): ParseReport {
  return looksLikeFeed(text) ? parseFeed(text, base, opts) : parseHtmlListingReport(text, base, opts);
}
