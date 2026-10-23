import { prisma } from "@/lib/prisma";
import { SITE } from "@/lib/site";
import { buildNewsRss, RSS_LIMIT } from "@/lib/ingest-news-rss";

// Чете от базата → не се генерира при билда (CI билдва с фиктивна база).
export const dynamic = "force-dynamic";

// RSS 2.0 с последните публикувани новини: /novini/rss.xml. Само заглавие,
// кратко описание и връзка — без лични данни, без бисквитки.
export async function GET() {
  let posts: Awaited<ReturnType<typeof load>> = [];
  try {
    posts = await load();
  } catch (err) {
    console.error("[rss] грешка при четене на новините:", err instanceof Error ? err.message : err);
    return new Response("Временно недостъпно.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8", "retry-after": "300" },
    });
  }
  const xml = buildNewsRss(posts, { siteUrl: SITE.url, siteName: SITE.name });
  return new Response(xml, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=600, s-maxage=600",
      "x-content-type-options": "nosniff",
    },
  });
}

function load() {
  return prisma.post.findMany({
    where: { published: true },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: RSS_LIMIT,
    select: {
      slug: true,
      title: true,
      excerpt: true,
      content: true,
      source: true,
      sourceDate: true,
      publishedAt: true,
      createdAt: true,
    },
  });
}
