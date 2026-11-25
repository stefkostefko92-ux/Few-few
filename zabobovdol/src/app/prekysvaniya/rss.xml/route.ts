import { prisma } from "@/lib/prisma";
import { SITE } from "@/lib/site";
import { sofiaWallNow } from "@/lib/ingest-outages-core";
import { buildOutagesRss } from "@/lib/ingest-outages-rss";

// RSS 2.0 с обявените прекъсвания на ток и вода (текущи и предстоящи).
// Чете базата → force-dynamic (CI билдва с фиктивна база).
export const dynamic = "force-dynamic";

export async function GET() {
  const nowWall = sofiaWallNow();
  let rows;
  try {
    rows = await prisma.outage.findMany({
      where: { published: true, OR: [{ endAt: null }, { endAt: { gte: nowWall } }] },
      orderBy: [{ startAt: "asc" }, { createdAt: "desc" }],
      take: 50,
      select: {
        slug: true,
        utility: true,
        area: true,
        startAt: true,
        endAt: true,
        planned: true,
        note: true,
        source: true,
        sourceUrl: true,
        updatedAt: true,
      },
    });
  } catch {
    return new Response("Временно недостъпно.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8", "retry-after": "300" },
    });
  }
  const xml = buildOutagesRss(rows, { siteUrl: SITE.url, siteName: SITE.name });
  return new Response(xml, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=300",
      "x-content-type-options": "nosniff",
    },
  });
}
