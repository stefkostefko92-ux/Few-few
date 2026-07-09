import type { Metadata } from "next";
import { buildMetadata, sportsTeamLd, webPageLd } from "@/lib/seo";
import { getActivePlayers, getStaff } from "@/lib/data";
import { POSITION_LABELS, POSITION_ORDER, labelFor } from "@/lib/categories";
import { PageHero, EmptyState } from "@/components/ui";
import { JsonLd } from "@/components/JsonLd";
import { PlayerCard } from "@/components/PlayerCard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Отбор",
  description:
    "Състав на ФК „Миньор“ Бобов дол по позиции и треньорски щаб на клуба.",
  path: "/otbor",
});

const POSITION_PLURAL: Record<string, string> = {
  GOALKEEPER: "Вратари",
  DEFENDER: "Защитници",
  MIDFIELDER: "Полузащитници",
  FORWARD: "Нападатели",
};

export default async function TeamPage() {
  const [players, staff] = await Promise.all([getActivePlayers(), getStaff()]);

  const byPosition = POSITION_ORDER.map((pos) => ({
    pos,
    label: POSITION_PLURAL[pos] ?? labelFor(POSITION_LABELS, pos),
    list: players.filter((p) => p.position === pos),
  })).filter((g) => g.list.length > 0);

  return (
    <>
      <PageHero
        eyebrow="Жълто-черно сърце"
        title="Нашият отбор"
        intro="Футболистите и треньорският щаб на „миньорите“."
        crumbs={[{ name: "Отбор", path: "/otbor" }]}
      />
      <JsonLd
        data={[
          webPageLd({ name: "Отбор", path: "/otbor" }),
          sportsTeamLd({
            athletes: players.map((p) => p.name),
            coaches: staff.map((s) => s.name),
          }),
        ]}
      />
      <div className="container-content space-y-12 py-10">
        {players.length === 0 && staff.length === 0 ? (
          <EmptyState
            title="Съставът още не е въведен"
            hint="Информацията за отбора ще се появи тук съвсем скоро."
          />
        ) : (
          <>
            {byPosition.map((group) => (
              <section key={group.pos}>
                <h2 className="section-title mb-5">{group.label}</h2>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {group.list.map((p) => (
                    <PlayerCard key={p.id} player={p} />
                  ))}
                </div>
              </section>
            ))}

            {staff.length > 0 && (
              <section>
                <h2 className="section-title mb-5">Треньорски и ръководен щаб</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {staff.map((s) => (
                    <div key={s.id} className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4">
                      <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-900 text-xl font-bold text-gold-400">
                        {s.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={s.photoUrl} alt={s.name} className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          s.name.charAt(0)
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-display text-lg font-bold text-slate-900">{s.name}</p>
                        <p className="text-sm font-medium text-brand-700">{s.role}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}
