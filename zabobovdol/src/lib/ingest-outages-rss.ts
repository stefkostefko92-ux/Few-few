import { formatOutageTime } from "@/lib/ingest-outages-core";

// RSS 2.0 за „Прекъсвания на ток и вода“ (/prekysvaniya/rss.xml). Чиста функция —
// маршрутът само чете базата и подава записите. Всичко от базата се екранира;
// линковете носят ?s=rss, за да се вижда в статистиката колко хора идват от RSS
// (без да се знае кои).

export type FeedOutage = {
  slug: string;
  utility: string;
  area: string;
  startAt: Date | null;
  endAt: Date | null;
  planned: boolean;
  note: string;
  source: string;
  sourceUrl: string;
  updatedAt: Date;
};

// Забранените в XML 1.0 управляващи знаци (без \t \n \r) и U+FFFE/U+FFFF.
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

const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

export function outageTitle(o: Pick<FeedOutage, "utility" | "planned" | "area">): string {
  const what = o.utility === "WATER" ? "Спира водата" : "Спира токът";
  const kind = o.planned ? "планово" : "авария";
  return `${what} (${kind})${o.area.trim() ? `: ${o.area.trim()}` : ""}`;
}

export function outageWhen(o: Pick<FeedOutage, "startAt" | "endAt">): string {
  if (o.startAt && o.endAt) return `От ${formatOutageTime(o.startAt)} до ${formatOutageTime(o.endAt)}`;
  if (o.startAt) return `От ${formatOutageTime(o.startAt)}`;
  if (o.endAt) return `До ${formatOutageTime(o.endAt)}`;
  return "";
}

export function buildOutagesRss(
  items: readonly FeedOutage[],
  opts: { siteUrl: string; siteName: string; now?: Date },
): string {
  const base = opts.siteUrl.replace(/\/$/, "");
  const page = `${base}/prekysvaniya?s=rss`;
  const self = `${base}/prekysvaniya/rss.xml`;
  const now = opts.now ?? new Date();

  const body = items
    .map((o) => {
      const parts = [
        outageWhen(o),
        cut(o.note.replace(/\s+/g, " ").trim(), 500),
        o.source.trim() ? `Източник: ${o.source.trim()}` : "",
      ].filter(Boolean);
      const desc =
        parts.map((p) => (/[.!?…]$/.test(p) ? p : `${p}.`)).join(" ") ||
        "Подробностите са на страницата „Прекъсвания на ток и вода“.";
      return [
        "    <item>",
        `      <title>${escapeXml(outageTitle(o))}</title>`,
        `      <link>${escapeXml(`${page}#${encodeURIComponent(o.slug)}`)}</link>`,
        `      <guid isPermaLink="false">${escapeXml(`zabobovdol-outage-${o.slug}`)}</guid>`,
        `      <pubDate>${o.updatedAt.toUTCString()}</pubDate>`,
        `      <description>${escapeXml(desc)}</description>`,
        "    </item>",
      ].join("\n");
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${escapeXml(`Прекъсвания на ток и вода — ${opts.siteName}`)}</title>`,
    `    <link>${escapeXml(page)}</link>`,
    `    <description>${escapeXml("Обявени планови и аварийни прекъсвания на тока и водата в Бобов дол и селата в общината.")}</description>`,
    "    <language>bg</language>",
    `    <lastBuildDate>${now.toUTCString()}</lastBuildDate>`,
    "    <ttl>60</ttl>",
    `    <atom:link href="${escapeXml(self)}" rel="self" type="application/rss+xml" />`,
    body,
    "  </channel>",
    "</rss>",
    "",
  ]
    .filter((l) => l !== "")
    .join("\n")
    .concat("\n");
}
