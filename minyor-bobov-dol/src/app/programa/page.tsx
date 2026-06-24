import type { Metadata } from "next";
import { buildMetadata, canonical, matchEventLd } from "@/lib/seo";
import { getUpcomingMatches, getRecentResults } from "@/lib/data";
import { PageHero, EmptyState } from "@/components/ui";
import { MatchList } from "@/components/MatchList";
import { JsonLd } from "@/components/JsonLd";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Програма и резултати",
  description:
    "Предстоящи мачове и изиграни срещи на ФК „Миньор“ Бобов дол по сезони.",
  path: "/programa",
});

export default async function ProgramPage() {
  const [upcoming, results] = await Promise.all([
    getUpcomingMatches(40),
    getRecentResults(40),
  ]);

  const empty = upcoming.length === 0 && results.length === 0;

  return (
    <>
      <PageHero
        eyebrow="Календар"
        title="Програма и резултати"
        intro="Всички предстоящи мачове и изиграни срещи на „миньорите“."
        crumbs={[{ name: "Програма и резултати", path: "/programa" }]}
      />
      {upcoming.length > 0 && (
        <JsonLd
          data={upcoming.slice(0, 10).map((m) =>
            matchEventLd({
              opponent: m.opponent,
              isHome: m.isHome,
              kickoff: m.kickoff,
              competition: m.competition,
              venue: m.venue,
              url: canonical("/programa"),
            }),
          )}
        />
      )}
      <div className="container-content space-y-10 py-10">
        {empty ? (
          <EmptyState
            title="Все още няма въведени мачове"
            hint="Програмата ще се появи тук веднага щом бъде публикувана."
          />
        ) : (
          <>
            <section>
              <h2 className="section-title mb-5">Предстоящи мачове</h2>
              {upcoming.length > 0 ? (
                <MatchList matches={upcoming} />
              ) : (
                <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-slate-600">
                  Няма насрочени предстоящи мачове.
                </p>
              )}
            </section>
            <section>
              <h2 className="section-title mb-5">Изиграни мачове</h2>
              {results.length > 0 ? (
                <MatchList matches={results} />
              ) : (
                <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-slate-600">
                  Все още няма изиграни мачове.
                </p>
              )}
            </section>
          </>
        )}
      </div>
    </>
  );
}
