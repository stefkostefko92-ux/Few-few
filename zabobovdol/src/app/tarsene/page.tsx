import Link from "next/link";
import type { Metadata } from "next";
import { search, recordMiss } from "@/lib/search";
import { PageHero, EmptyState } from "@/components/ui";
import { SearchBar } from "@/components/SearchBar";
import { buildMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  faq: "Как да…",
  service: "Услуга",
  business: "Бизнес",
  event: "Събитие",
};

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}): Promise<Metadata> {
  const { q } = await searchParams;
  return buildMetadata({
    title: q ? `Търсене: ${q}` : "Търсене",
    description: "Търсене в услугите, телефоните, обявите и съдържанието на сайта.",
    path: "/tarsene",
    noindex: true,
  });
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const results = query.length >= 2 ? await search(query, 30) : [];
  // Записваме търсения без резултат, за да виждаме какво търсят хората.
  if (query.length >= 2 && results.length === 0) await recordMiss(query);

  return (
    <>
      <PageHero
        title={query ? `Резултати за „${query}“` : "Търсене"}
        crumbs={[{ name: "Търсене", path: "/tarsene" }]}
      />
      <div className="container-content py-10">
        <div className="mb-8 max-w-xl">
          <SearchBar />
        </div>

        {query.length < 2 ? (
          <EmptyState title="Напишете дума за търсене (поне 2 букви)." />
        ) : results.length === 0 ? (
          <EmptyState
            title={`Нищо не е намерено за „${query}“.`}
            hint="Опитайте с друга дума или попитайте дигиталния помощник долу вдясно."
          />
        ) : (
          <ul className="space-y-3">
            {results.map((r, i) => (
              <li key={i}>
                <Link href={r.url} className="card block">
                  <div className="text-xs uppercase tracking-wide text-brand-600">
                    {TYPE_LABEL[r.type]}
                  </div>
                  <div className="text-lg font-semibold text-slate-900">
                    {r.title}
                  </div>
                  {r.snippet && (
                    <p className="text-sm text-slate-600">{r.snippet}</p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
