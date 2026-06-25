import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { getStandings } from "@/lib/data";
import { PageHero, EmptyState } from "@/components/ui";
import { StandingsTable } from "@/components/StandingsTable";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Класиране",
  description: "Актуално класиране в групата на ФК „Миньор“ Бобов дол.",
  path: "/klasirane",
});

export default async function StandingsPage() {
  const rows = await getStandings();
  const season = rows[0]?.season;
  const own = rows.find((r) => r.isOwnTeam);
  const ownSummary = own
    ? `ФК „Миньор“ Бобов дол е на ${own.position}-о място` +
      `${season ? ` за сезон ${season}` : ""} с ${own.points} точки от ` +
      `${own.played} мача (${own.won}-${own.drawn}-${own.lost}).`
    : null;

  return (
    <>
      <PageHero
        eyebrow="Таблица"
        title="Класиране"
        intro={
          season
            ? `Подреждане в групата за сезон ${season}.`
            : "Подреждане на отборите в групата."
        }
        crumbs={[{ name: "Класиране", path: "/klasirane" }]}
      />
      <div className="container-content py-10">
        {rows.length === 0 ? (
          <EmptyState
            title="Класирането още не е въведено"
            hint="Таблицата ще се появи тук, след като бъде попълнена."
          />
        ) : (
          <>
            {ownSummary && (
              <p className="mb-5 rounded-xl border border-slate-200 bg-gold-50 p-4 text-slate-800">
                {ownSummary}
              </p>
            )}
            <StandingsTable rows={rows} />
            <p className="mt-4 text-sm text-slate-500">
              М — изиграни, П — победи, Р — равенства, З — загуби, ГР — голова
              разлика, Т — точки. Жълтото поле отбелязва „Миньор“.
            </p>
            <p className="mt-2 text-xs text-slate-400">
              Източник на класирането: bgclubs.eu.
            </p>
          </>
        )}
      </div>
    </>
  );
}
