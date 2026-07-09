import type { Metadata } from "next";
import { buildMetadata, itemListLd } from "@/lib/seo";
import { getAllPosts } from "@/lib/data";
import { PageHero, EmptyState } from "@/components/ui";
import { NewsCard } from "@/components/NewsCard";
import { JsonLd } from "@/components/JsonLd";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Новини",
  description: "Актуални новини и съобщения от ФК „Миньор“ Бобов дол.",
  path: "/novini",
});

export default async function NewsPage() {
  const posts = await getAllPosts();

  return (
    <>
      <PageHero
        eyebrow="Бъди в крак"
        title="Новини"
        intro="Актуални съобщения, репортажи и обяви от клуба."
        crumbs={[{ name: "Новини", path: "/novini" }]}
      />
      <div className="container-content py-10">
        {posts.length === 0 ? (
          <EmptyState
            title="Все още няма публикувани новини"
            hint="Очаквайте скоро актуални съобщения от клуба."
          />
        ) : (
          <>
            <JsonLd
              data={itemListLd(
                posts.map((p) => ({ name: p.title, path: `/novini/${p.slug}` })),
                "Новини",
              )}
            />
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((p) => (
                <NewsCard key={p.slug} post={p} />
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
