import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { PageHero, EmptyState } from "@/components/ui";
import { buildMetadata, canonical } from "@/lib/seo";
import { plainText } from "@/lib/markdown";
import { newsDate } from "@/lib/news";
import { formatDate, isoDate } from "@/lib/format-date";
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

export default async function NewsPage() {
  const posts = await prisma.post.findMany({
    where: { published: true },
    orderBy: [{ publishedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
  });

  return (
    <>
      <PageHero
        title="Новини"
        intro="Актуални съобщения за града."
        crumbs={[{ name: "Новини", path: "/novini" }]}
      />
      <div className="container-content py-10">
        {posts.length === 0 ? (
          <EmptyState title="Все още няма публикувани новини." />
        ) : (
          // Една колона за четене (не зигзаг в две); датата — първа.
          <ul role="list" className="grid max-w-3xl gap-4">
            {posts.map((p) => {
              const d = newsDate(p);
              return (
                <li key={p.id}>
                  <Link href={`/novini/${p.slug}`} className="card group block">
                    <p className="text-sm font-medium text-brand-700">
                      <time dateTime={isoDate(d)}>{formatDate(d)}</time>
                    </p>
                    <h2 className="h-card mt-1 group-hover:text-brand-700 group-hover:underline">
                      {p.title}
                    </h2>
                    <p className="mt-1 text-base text-slate-700">
                      {p.excerpt || plainText(p.content, 160)}
                    </p>
                    {p.source && <span className="badge mt-3">Източник: {p.source}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {/* Абонаментът е за малцина — под списъка, с обяснение, а не първи. */}
        <div className="mt-10 flex max-w-3xl flex-col gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:items-center">
          <RssLink />
          <p className="text-base text-slate-600">
            Новите съобщения идват сами в приложение за новини (RSS четец).
          </p>
        </div>
      </div>
    </>
  );
}
