import type { Metadata } from "next";
import { buildMetadata, webPageLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHero, EmptyState } from "@/components/ui";
import { Callout } from "@/components/content";
import { getPublishedPosts } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Новини от Дупница",
  description: "Актуални местни съобщения и новини за Дупница.",
  path: "/novini",
});

export default async function NoviniPage() {
  const posts = await getPublishedPosts();

  return (
    <>
      <JsonLd data={webPageLd({ name: "Новини от Дупница", path: "/novini", type: "CollectionPage" })} />
      <PageHero
        eyebrow="Актуално"
        title="Новини"
        intro="Местни съобщения и новини за Дупница, събрани на едно място."
        crumbs={[{ name: "Новини", path: "/novini" }]}
      />

      <div className="container-content py-10">
        <Callout tone="info">
          Засега местните новини са разпръснати по различни сайтове и медии. Тук ще
          събираме най-важното. Полезни източници: dupnicanews.eu, struma.bg и
          официалният сайт на общината.
        </Callout>

        {posts.length === 0 ? (
          <EmptyState
            title="Все още няма публикувани новини"
            hint="Очаквайте скоро."
          />
        ) : (
          <ul className="space-y-4">
            {posts.map((p) => (
              <li key={p.id} className="card">
                <h2 className="font-display text-xl font-bold text-slate-900">
                  {p.title}
                </h2>
                {p.excerpt && (
                  <p className="mt-2 text-base text-slate-700">{p.excerpt}</p>
                )}
                {p.sourceUrl && (
                  <a
                    href={p.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-base font-medium text-brand-700 hover:underline"
                  >
                    Източник{p.source ? `: ${p.source}` : ""}
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
