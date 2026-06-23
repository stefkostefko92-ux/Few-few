import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { PageHero, EmptyState } from "@/components/ui";
import { buildMetadata } from "@/lib/seo";
import { plainText } from "@/lib/markdown";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Новини и съобщения за Бобов дол",
  description: "Актуални съобщения, новини и обявления, важни за жителите на Бобов дол.",
  path: "/novini",
});

function fmt(d: Date | null): string {
  if (!d) return "";
  return new Intl.DateTimeFormat("bg-BG", {
    day: "numeric",
    month: "long",
    year: "numeric",
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
        {posts.length === 0 ? (
          <EmptyState title="Все още няма публикувани новини." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {posts.map((p) => (
              <Link key={p.id} href={`/novini/${p.slug}`} className="card">
                <div className="text-sm text-slate-500">
                  {fmt(p.publishedAt ?? p.createdAt)}
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
