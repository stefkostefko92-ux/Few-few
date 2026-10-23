import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { PageHero, EmptyState } from "@/components/ui";
import { buildMetadata, canonical } from "@/lib/seo";
import { plainText } from "@/lib/markdown";
import { newsDate } from "@/lib/news";
import { RssLink } from "./RssLink";

export const dynamic = "force-dynamic";

const base = buildMetadata({
  title: "Новини и съобщения за Бобов дол",
  description: "Актуални съобщения, новини и обявления, важни за жителите на Бобов дол.",
  path: "/novini",
});

export const metadata: Metadata = {
  ...base,
  keywords: [
    "новини Бобов дол",
    "Община Бобов дол съобщения",
    "Бобов дол днес",
    "обявления Бобов дол",
    "RSS новини Бобов дол",
    "Carbon Stealth",
  ],
  // Четците на RSS намират канала сами от тази връзка.
  alternates: {
    ...base.alternates,
    types: { "application/rss+xml": canonical("/novini/rss.xml") },
  },
};

function fmt(d: Date | null): string {
  if (!d) return "";
  return new Intl.DateTimeFormat("bg-BG", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Sofia",
  }).format(d);
}

export default async function NewsPage() {
  const posts = await prisma.post.findMany({
    where: { published: true },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
  });

  return (
    <>
      <PageHero
        title="Новини"
        intro="Актуални съобщения за града."
        crumbs={[{ name: "Новини", path: "/novini" }]}
      />
      <div className="container-content py-10">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <RssLink />
          <p className="text-sm text-slate-600">
            Новите съобщения идват сами в приложение за новини (RSS четец).
          </p>
        </div>
        {posts.length === 0 ? (
          <EmptyState title="Все още няма публикувани новини." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {posts.map((p) => (
              <Link key={p.id} href={`/novini/${p.slug}`} className="card">
                <div className="text-sm text-slate-600">
                  <time dateTime={newsDate(p).toISOString()}>{fmt(newsDate(p))}</time>
                </div>
                <h2 className="mt-1 text-lg font-semibold text-slate-900">
                  {p.title}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {p.excerpt || plainText(p.content, 130)}
                </p>
                {p.source && (
                  <div className="mt-2 text-xs text-slate-600">Източник: {p.source}</div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
