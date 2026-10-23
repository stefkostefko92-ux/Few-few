// RSS 2.0 за новините — чиста логика (без база и без server-only), за да се
// тества. Адресът е /novini/rss.xml (src/app/novini/rss.xml/route.ts); данните
// идват от ./news.ts. Името е с префикса на пакета за новините (ingest-news-*).
//
// Всяка връзка към сайта носи ?s=rss — така статистиката брои колко хора идват
// от RSS четец, без да се знае кои са.

export type FeedPost = {
  slug: string;
  title: string;
  excerpt: string;
  content?: string;
  source: string;
  sourceUrl?: string;
  sourceDate: Date | null;
  publishedAt: Date | null;
  createdAt: Date;
};

// Датата, която виждат хората: от източника (кога общината го е обявила), иначе
// кога е публикувано у нас, иначе кога е създадено.
export function newsDate(p: Pick<FeedPost, "sourceDate" | "publishedAt" | "createdAt">): Date {
  return p.sourceDate ?? p.publishedAt ?? p.createdAt;
}

// Знаци, които XML 1.0 не позволява изобщо (управляващи знаци и т.н.).
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

export function escapeXml(s: string): string {
  return String(s ?? "")
    .replace(INVALID_XML, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function withSource(url: string): string {
  const u = new URL(url);
  u.searchParams.set("s", "rss");
  return u.toString();
}

// Кратко описание без Markdown — четецът показва обикновен текст.
function plain(s: string, max: number): string {
  const t = s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#*_`>~|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
}

export const RSS_LIMIT = 30;

export function buildNewsRss(
  posts: FeedPost[],
  opts: { siteUrl: string; siteName: string; now?: Date },
): string {
  const site = opts.siteUrl.replace(/\/$/, "");
  const list = posts.slice(0, RSS_LIMIT);
  const last = list.length
    ? new Date(Math.max(...list.map((p) => newsDate(p).getTime())))
    : (opts.now ?? new Date());
  const items = list
    .map((p) => {
      const url = `${site}/novini/${encodeURIComponent(p.slug)}`;
      const desc = plain(p.excerpt || p.content || "", 400);
      const parts = [
        `<title>${escapeXml(p.title)}</title>`,
        `<link>${escapeXml(withSource(url))}</link>`,
        `<guid isPermaLink="true">${escapeXml(url)}</guid>`,
        `<pubDate>${newsDate(p).toUTCString()}</pubDate>`,
      ];
      if (desc) parts.push(`<description>${escapeXml(desc)}</description>`);
      if (p.source) parts.push(`<category>${escapeXml(p.source)}</category>`);
      return `    <item>\n      ${parts.join("\n      ")}\n    </item>`;
    })
    .join("\n");

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">`,
    `  <channel>`,
    `    <title>${escapeXml(`Новини — ${opts.siteName}`)}</title>`,
    `    <link>${escapeXml(withSource(`${site}/novini`))}</link>`,
    `    <atom:link href="${escapeXml(`${site}/novini/rss.xml`)}" rel="self" type="application/rss+xml"/>`,
    `    <description>${escapeXml("Съобщения и новини за жителите на Бобов дол — заглавие, кратко описание и връзка към източника.")}</description>`,
    `    <language>bg</language>`,
    `    <lastBuildDate>${last.toUTCString()}</lastBuildDate>`,
    `    <ttl>60</ttl>`,
    items,
    `  </channel>`,
    `</rss>`,
  ]
    .filter((l) => l !== "")
    .join("\n")
    .concat("\n");
}
