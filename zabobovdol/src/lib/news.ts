import "server-only";
import { prisma } from "@/lib/prisma";
import { MUNICIPALITY_SOURCE } from "@/lib/ingest-news-parse";
import { newsDate, type FeedPost } from "@/lib/ingest-news-rss";

export { newsDate } from "@/lib/ingest-news-rss";

export type LatestNewsItem = FeedPost & {
  id: string;
  /** Датата за показване (от източника, иначе на публикуване). */
  date: Date;
};

const SELECT = {
  id: true,
  slug: true,
  title: true,
  excerpt: true,
  content: true,
  source: true,
  sourceUrl: true,
  sourceDate: true,
  publishedAt: true,
  createdAt: true,
} as const;

// Последните ПУБЛИКУВАНИ новини с дата и източник. По подразбиране — всички
// публикувани; с `source` — само от този източник (напр. „Община Бобов дол“ за
// блока „Последно от общината“). Никога не хвърля към страницата: при грешка в
// базата връща празен списък — блокът просто не се показва.
export async function getLatestNews(
  n = 3,
  opts: { source?: string } = {},
): Promise<LatestNewsItem[]> {
  const take = Math.max(1, Math.min(50, Math.floor(n) || 3));
  try {
    const rows = await prisma.post.findMany({
      where: { published: true, ...(opts.source ? { source: opts.source } : {}) },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take,
      select: SELECT,
    });
    return rows.map((r) => ({ ...r, date: newsDate(r) }));
  } catch (err) {
    console.error("[news] грешка при четене на новините:", err instanceof Error ? err.message : err);
    return [];
  }
}

export function getLatestMunicipalityNews(n = 3): Promise<LatestNewsItem[]> {
  return getLatestNews(n, { source: MUNICIPALITY_SOURCE });
}
