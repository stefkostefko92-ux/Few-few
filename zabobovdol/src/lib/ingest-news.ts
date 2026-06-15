import "server-only";
import { prisma } from "@/lib/prisma";
import { slugify, uniqueSlug } from "@/lib/slug";

// Внасяне на новини от сайта на общината като ЧЕРНОВИ (непубликувани).
// Поддържа RSS/Atom канал (най-стабилно) и резервно четене на HTML списък.
// Внасят се заглавие + кратко резюме + линк към оригинала; пълният текст не се
// копира. Публикуването става ръчно от админ панела след проверка.

export const MUNICIPALITY_SOURCE = "Община Бобов дол";

function newsUrl(): string {
  return (
    process.env.MUNICIPALITY_NEWS_URL ||
    "https://bobovdol.egov.bg/wps/portal/municipality-bobovdol/actual/news"
  );
}

export type RawItem = { title: string; link: string; summary: string; date?: Date };

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();
}

function stripTags(s: string): string {
  return decode(s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " "));
}

function toAbsolute(base: string, href: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

function parseDate(s?: string): Date | undefined {
  if (!s) return undefined;
  // dd.mm.yyyy
  const m = /(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/.exec(s);
  if (m) {
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    if (!isNaN(d.getTime())) return d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}

function looksLikeFeed(text: string): boolean {
  return /<rss\b|<feed\b|<rdf:RDF/i.test(text.slice(0, 800));
}

// --- RSS / Atom ---
function parseFeed(xml: string, base: string): RawItem[] {
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) ?? [];
  const items: RawItem[] = [];
  for (const b of blocks) {
    const title = stripTags((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(b)?.[1] ?? "").replace(/<!\[CDATA\[|\]\]>/g, ""));
    let link =
      /<link[^>]*href="([^"]+)"/i.exec(b)?.[1] ||
      stripTags(/<link[^>]*>([\s\S]*?)<\/link>/i.exec(b)?.[1] ?? "") ||
      stripTags(/<guid[^>]*>([\s\S]*?)<\/guid>/i.exec(b)?.[1] ?? "");
    link = link ? toAbsolute(base, link) : "";
    const summary = stripTags(
      (/<(description|summary|content)[^>]*>([\s\S]*?)<\/\1>/i.exec(b)?.[2] ?? "").replace(
        /<!\[CDATA\[|\]\]>/g,
        "",
      ),
    ).slice(0, 400);
    const date = parseDate(
      /<(pubDate|updated|published|dc:date)[^>]*>([\s\S]*?)<\/\1>/i.exec(b)?.[2],
    );
    if (title && link) items.push({ title, link, summary, date });
  }
  return items;
}

// --- HTML списък (резервно, „най-добро усилие“) ---
function parseHtmlListing(html: string, base: string): RawItem[] {
  const host = (() => {
    try {
      return new URL(base).host;
    } catch {
      return "";
    }
  })();
  const NAV = /(меню|вход|контакт|начало|търсене|политика|бисквит|©|cookie|login)/i;
  const seen = new Set<string>();
  const items: RawItem[] = [];
  const anchorRe = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html))) {
    const href = toAbsolute(base, m[1]);
    const text = stripTags(m[2]);
    if (!text || text.length < 18 || text.length > 220) continue;
    if (!/\s/.test(text)) continue; // една дума = вероятно меню
    if (NAV.test(text)) continue;
    try {
      if (host && new URL(href).host !== host) continue;
    } catch {
      continue;
    }
    if (seen.has(href)) continue;
    seen.add(href);
    // дата малко преди връзката в HTML
    const before = html.slice(Math.max(0, m.index - 240), m.index);
    const date = parseDate(before.match(/\d{1,2}[.\/]\d{1,2}[.\/]\d{4}/)?.[0]);
    items.push({ title: text, link: href, summary: "", date });
  }
  return items;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "user-agent": "ZaBobovDolBot/1.0 (+https://zabobovdol.carbonstealth.eu)",
      accept: "application/rss+xml, text/html, application/xml;q=0.9, */*;q=0.8",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

export type IngestResult = {
  found: number;
  created: number;
  skipped: number;
  error?: string;
};

export async function ingestMunicipalityNews(limit = 15): Promise<IngestResult> {
  const url = newsUrl();
  let text: string;
  try {
    text = await fetchText(url);
  } catch (err) {
    console.error("Грешка при сваляне на новините:", err);
    return { found: 0, created: 0, skipped: 0, error: "Грешка при сваляне на източника." };
  }

  const items = (looksLikeFeed(text) ? parseFeed(text, url) : parseHtmlListing(text, url)).slice(
    0,
    limit,
  );

  const existingSlugs = new Set(
    (await prisma.post.findMany({ select: { slug: true } })).map((p) => p.slug),
  );

  let created = 0;
  let skipped = 0;
  for (const it of items) {
    if (!it.title || !it.link) continue;
    const dup = await prisma.post.findFirst({ where: { sourceUrl: it.link } });
    if (dup) {
      skipped++;
      continue;
    }
    const slug = uniqueSlug(slugify(it.title), existingSlugs);
    existingSlugs.add(slug);
    await prisma.post.create({
      data: {
        slug,
        title: it.title,
        excerpt: it.summary,
        content: "",
        source: MUNICIPALITY_SOURCE,
        sourceUrl: it.link,
        sourceDate: it.date,
        published: false, // изчаква ръчно одобрение
      },
    });
    created++;
  }

  return { found: items.length, created, skipped };
}
