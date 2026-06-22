import type { Metadata } from "next";
import { buildMetadata, webPageLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHero, EmptyState } from "@/components/ui";
import { Callout } from "@/components/content";
import { getPublishedMemories } from "@/lib/queries";
import { MemoryForm } from "./MemoryForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Спомени от Дупница",
  description:
    "Споделени от жителите спомени и стари снимки на Дупница. Запазваме паметта на града заедно.",
  path: "/spomeni",
});

export default async function SpomeniPage() {
  const memories = await getPublishedMemories();
  return (
    <>
      <JsonLd data={webPageLd({ name: "Спомени от Дупница", path: "/spomeni", type: "CollectionPage" })} />
      <PageHero
        eyebrow="Памет"
        title="Спомени от Дупница"
        intro="Историята на града живее в спомените на хората. Споделете и вие."
        crumbs={[{ name: "Спомени", path: "/spomeni" }]}
      />
      <div className="container-content py-10">
        {memories.length === 0 ? (
          <EmptyState title="Все още няма споделени спомени" hint="Бъдете първи — разкажете спомен по-долу." />
        ) : (
          <ul className="space-y-6">
            {memories.map((m) => (
              <li key={m.id} className="card">
                <h2 className="font-display text-xl font-bold text-slate-900">
                  {m.title}
                </h2>
                <p className="text-sm text-slate-500">
                  {[m.author, m.period].filter(Boolean).join(" · ")}
                </p>
                {m.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.imageUrl}
                    alt={m.title}
                    className="mt-3 max-h-80 w-auto rounded-lg"
                    loading="lazy"
                  />
                )}
                <p className="mt-3 whitespace-pre-line text-base text-slate-700">
                  {m.content}
                </p>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-12">
          <h2 className="section-title mb-4">Споделете спомен</h2>
          <Callout tone="info">
            Спомените се преглеждат, преди да се публикуват. Споделяйте само снимки,
            които имате право да покажете.
          </Callout>
          <MemoryForm />
        </div>
      </div>
    </>
  );
}
