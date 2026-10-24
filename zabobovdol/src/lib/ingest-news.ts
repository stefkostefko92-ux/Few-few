import "server-only";
import { prisma } from "@/lib/prisma";
import { slugify, uniqueSlug } from "@/lib/slug";
import {
  DEFAULT_NEWS_URL,
  MUNICIPALITY_SOURCE,
  isNewsLink,
  parseListing,
  resolveLinkPattern,
} from "@/lib/ingest-news-parse";

export { MUNICIPALITY_SOURCE } from "@/lib/ingest-news-parse";

// Внасяне на новини от сайта на общината като ЧЕРНОВИ (непубликувани).
// Поддържа RSS/Atom канал (най-стабилно) и СТРОГО четене на HTML списък: само
// връзки по шаблона MUNICIPALITY_NEWS_LINK_PATTERN и само с дата (виж
// ./ingest-news-parse.ts). Внасят се заглавие + кратко резюме + линк към
// оригинала; пълният текст и снимките не се копират. Публикуването става ръчно
// от админ панела след проверка.

function newsUrl(): string {
  return process.env.MUNICIPALITY_NEWS_URL || DEFAULT_NEWS_URL;
}

async function fetchText(url: string): Promise<string> {
  // Само http(s) — пазим се от достъп до локални услуги/файлове (SSRF).
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Невалиден адрес на източника.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Позволени са само http(s) адреси за източника.");
  }
  const res = await fetch(url, {
    headers: {
      "user-agent": "ZaBobovDolBot/1.0 (+https://zabobovdol.carbonstealth.eu)",
      accept: "application/rss+xml, text/html, application/xml;q=0.9, */*;q=0.8",
    },
    signal: AbortSignal.timeout(15000),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

export type IngestResult = {
  found: number;
  created: number;
  skipped: number;
  /** Внесени новини (по шаблона), които още чакат ръчно одобрение. */
  pending?: number;
  /** Съвпаднали по шаблона, но отхвърлени, защото нямат дата. */
  withoutDate?: number;
  error?: string;
};

// Колко истински новини (адрес по шаблона) от общината чакат одобрение.
// Старите погрешно внесени страници от менюто не се броят — те не са новини.
export async function countPendingNews(pattern?: RegExp): Promise<number> {
  let p = pattern;
  if (!p) {
    try {
      p = resolveLinkPattern(process.env.MUNICIPALITY_NEWS_LINK_PATTERN);
    } catch {
      return 0;
    }
  }
  const drafts = await prisma.post.findMany({
    where: { published: false, source: MUNICIPALITY_SOURCE },
    select: { sourceUrl: true },
  });
  return drafts.filter((d) => isNewsLink(d.sourceUrl, p)).length;
}

export async function ingestMunicipalityNews(limit = 15): Promise<IngestResult> {
  const url = newsUrl();

  let pattern: RegExp;
  try {
    pattern = resolveLinkPattern(process.env.MUNICIPALITY_NEWS_LINK_PATTERN);
  } catch (err) {
    console.error("[ingest-news] невалиден шаблон:", err instanceof Error ? err.message : err);
    return { found: 0, created: 0, skipped: 0, error: "Невалиден шаблон за адресите на новините." };
  }

  let text: string;
  try {
    text = await fetchText(url);
  } catch (err) {
    console.error("[ingest-news] грешка при сваляне:", err instanceof Error ? err.message : err);
    return {
      found: 0,
      created: 0,
      skipped: 0,
      pending: await countPendingNews(pattern),
      error: "Грешка при сваляне на източника.",
    };
  }

  const report = parseListing(text, url, { linkPattern: pattern });
  const items = report.items.slice(0, limit);

  // Fail closed: нито една новина по шаблона → нищо не се записва. Най-често
  // значи, че сайтът на общината е сменил адресите си — шаблонът се донастройва.
  if (items.length === 0) {
    console.warn(
      `[ingest-news] 0 новини: ${report.kind}, връзки ${report.anchors}, по шаблона ${report.matched}, без дата ${report.withoutDate}. Нищо не е внесено.`,
    );
    return {
      found: 0,
      created: 0,
      skipped: 0,
      withoutDate: report.withoutDate,
      pending: await countPendingNews(pattern),
      error:
        "Не са намерени новини по зададения шаблон — нищо не е внесено. Проверете MUNICIPALITY_NEWS_LINK_PATTERN.",
    };
  }

  const existingSlugs = new Set(
    (await prisma.post.findMany({ select: { slug: true } })).map((p) => p.slug),
  );

  let created = 0;
  let skipped = 0;
  for (const it of items) {
    // Дубликат: същият адрес ИЛИ същото заглавие със същата дата (порталът
    // понякога дава различни адреси за една и съща новина).
    const dup = await prisma.post.findFirst({
      where: { OR: [{ sourceUrl: it.link }, { title: it.title, sourceDate: it.date }] },
      select: { id: true },
    });
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

  return {
    found: items.length,
    created,
    skipped,
    withoutDate: report.withoutDate,
    pending: await countPendingNews(pattern),
  };
}
