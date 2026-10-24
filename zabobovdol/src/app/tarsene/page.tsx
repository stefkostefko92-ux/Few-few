import Link from "next/link";
import type { Metadata } from "next";
import { search, recordMiss, type SearchResult } from "@/lib/search";
import { prisma } from "@/lib/prisma";
import { PageHero, EmptyState } from "@/components/ui";
import { SearchBar } from "@/components/SearchBar";
import { PhoneButton } from "@/components/PhoneButton";
import { buildMetadata } from "@/lib/seo";
import { formatPhoneBg } from "@/lib/phone";

export const dynamic = "force-dynamic";

// Групите на резултатите: телефоните първи (най-често търсеното), после
// бизнесът, ръководствата и събитията.
const GROUPS: { type: SearchResult["type"]; title: string; id: string }[] = [
  { type: "service", title: "Услуги и телефони", id: "uslugi" },
  { type: "business", title: "Местен бизнес", id: "biznes" },
  { type: "faq", title: "Как да…", id: "kak-da" },
  { type: "event", title: "Събития", id: "sabitiya" },
];

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

function resultsLabel(n: number): string {
  return `${n.toLocaleString("bg-BG")} ${n === 1 ? "резултат" : "резултата"}`;
}

// Един и същ въпрос понякога съществува два пъти (две статии с еднакво
// заглавие) — показваме го веднъж: първото срещане е с по-висок резултат.
function dedupe(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  return results.filter((r) => {
    const key = `${r.type}:${r.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const results = query.length >= 2 ? dedupe(await search(query, 30)) : [];
  // Записваме търсения без резултат, за да виждаме какво търсят хората.
  if (query.length >= 2 && results.length === 0) await recordMiss(query);

  // За услугите — телефонът направо в резултата (за „аптека“ търсят точно него).
  const serviceSlugs = results
    .filter((r) => r.type === "service")
    .map((r) => r.url.replace(/^\/uslugi\//, ""));
  const phones = new Map(
    serviceSlugs.length
      ? (
          await prisma.service.findMany({
            where: { slug: { in: serviceSlugs }, published: true },
            select: { slug: true, phone: true, isEmergency: true },
          })
        ).map((s) => [`/uslugi/${s.slug}`, s])
      : [],
  );

  const groups = GROUPS.map((g) => ({ ...g, items: results.filter((r) => r.type === g.type) })).filter(
    (g) => g.items.length > 0,
  );

  return (
    <>
      <PageHero
        title={query ? `Резултати за „${query}“` : "Търсене"}
        crumbs={[{ name: "Търсене", path: "/tarsene" }]}
      />
      <div className="container-content py-10">
        {/* Полето показва търсената дума — уточнявате, без да я пишете наново.
            key={query}: при нова заявка (Назад, търсене от хедъра) полето се монтира
            наново със стойността от адреса — useState взима initialQuery само веднъж. */}
        <div className="mb-8 max-w-xl">
          <SearchBar key={query} initialQuery={query} />
        </div>

        {query.length < 2 ? (
          <EmptyState title="Напишете дума за търсене (поне 2 букви)." />
        ) : results.length === 0 ? (
          <EmptyState
            title={`Нищо не е намерено за „${query}“.`}
            hint="Опитайте с друга дума или попитайте дигиталния помощник долу вдясно."
            action={
              <>
                <Link href="/uslugi" className="btn-secondary">
                  Услуги и телефони
                </Link>
                <Link href="/kak-da" className="btn-secondary">
                  Как да…
                </Link>
              </>
            }
          />
        ) : (
          <>
            <p className="mb-8 text-base font-medium text-slate-700">
              Намерени {resultsLabel(results.length)} за „{query}“
            </p>
            <div className="space-y-12">
              {groups.map((g) => (
                <section key={g.type} aria-labelledby={`grupa-${g.id}`}>
                  <h2 id={`grupa-${g.id}`} className="section-title mb-6">
                    {g.title}{" "}
                    <span className="font-sans text-lg font-normal text-slate-600">
                      ({g.items.length})
                    </span>
                  </h2>
                  <ul role="list" className="max-w-3xl space-y-3">
                    {g.items.map((r) => {
                      const svc = phones.get(r.url);
                      return (
                        <li key={r.url} className="card relative">
                          <h3 className="h-card">
                            <Link
                              href={r.url}
                              className="after:absolute after:inset-0 after:rounded-2xl hover:text-brand-700 hover:underline"
                            >
                              {r.title}
                            </Link>
                          </h3>
                          {r.snippet && (
                            <p className="mt-1 text-base text-slate-700">{r.snippet}</p>
                          )}
                          {svc?.phone && (
                            <div className="relative z-10 mt-3">
                              <PhoneButton
                                phone={svc.phone}
                                variant={svc.isEmergency ? "danger" : "secondary"}
                                aria-label={`Обадете се на ${r.title}: ${formatPhoneBg(svc.phone)}`}
                              />
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
