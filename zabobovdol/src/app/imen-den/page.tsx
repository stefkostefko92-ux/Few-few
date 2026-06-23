import type { Metadata } from "next";
import { CalendarDays, Church, Info } from "@/components/icons";
import { PageHero, EmptyState } from "@/components/ui";
import { buildMetadata } from "@/lib/seo";
import {
  sofiaToday,
  dayInfo,
  formatDateBg,
  upcomingNameDays,
  findNameDay,
} from "@/lib/calendar";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Именни дни и църковен календар",
  description:
    "Кой празнува имен ден днес и кои са предстоящите именни дни и църковни празници. Намерете кога е именният ден на дадено име.",
  path: "/imen-den",
});

const MONTHS = [
  "януари", "февруари", "март", "април", "май", "юни",
  "юли", "август", "септември", "октомври", "ноември", "декември",
];

export default async function NameDayPage({
  searchParams,
}: {
  searchParams: Promise<{ ime?: string }>;
}) {
  const { ime } = await searchParams;
  const today = sofiaToday();
  const todayInfo = dayInfo(today.year, today.month, today.day);
  const upcoming = upcomingNameDays(today, 31).filter(
    (d) => !(d.month === today.month && d.day === today.day),
  );

  const query = (ime ?? "").trim();
  const found = query.length >= 2 ? findNameDay(query, today.year) : null;

  return (
    <>
      <PageHero
        eyebrow="Календар"
        title="Именни дни и празници"
        intro="Кой празнува днес, кои са предстоящите именни дни и църковни празници — и кога е именният ден на близък."
        crumbs={[{ name: "Именни дни", path: "/imen-den" }]}
      />

      <div className="container-content space-y-10 py-10">
        {/* Днес */}
        <section className="rounded-2xl border-2 border-brand-200 bg-brand-50 p-6">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-brand-700" aria-hidden />
            <h2 className="text-2xl font-bold text-slate-900">
              Днес е {formatDateBg(today.month, today.day, today.weekday)}
            </h2>
          </div>
          {todayInfo.feasts.length > 0 && (
            <p className="mt-3 flex items-start gap-2 text-lg text-slate-800">
              <Church className="mt-1 h-5 w-5 shrink-0 text-crimson-600" aria-hidden />
              <span>{todayInfo.feasts.join(" · ")}</span>
            </p>
          )}
          {todayInfo.names.length > 0 ? (
            <p className="mt-3 text-lg text-slate-800">
              Имен ден празнуват:{" "}
              <strong className="text-brand-800">{todayInfo.names.join(", ")}</strong>. Честит
              празник! 🎉
            </p>
          ) : (
            <p className="mt-3 text-slate-700">Днес няма отбелязан имен ден.</p>
          )}
        </section>

        {/* Търсене по име */}
        <section>
          <h2 className="section-title mb-4">Кога е именният ден на…</h2>
          <form method="get" className="flex flex-wrap items-center gap-2" role="search">
            <label htmlFor="ime" className="sr-only">
              Име
            </label>
            <input
              id="ime"
              name="ime"
              type="search"
              defaultValue={query}
              placeholder="Напишете име, напр. Иван"
              className="input max-w-xs"
              autoComplete="off"
            />
            <button type="submit" className="btn-primary">
              Намери
            </button>
          </form>
          {found && (
            <div className="mt-4 text-lg">
              {found.length > 0 ? (
                <p className="text-slate-800">
                  <strong className="text-brand-800">{query}</strong> празнува на{" "}
                  {found.map((d) => `${d.day} ${MONTHS[d.month - 1]}`).join(" и ")}.
                </p>
              ) : (
                <p className="flex items-start gap-2 text-slate-600">
                  <Info className="mt-1 h-5 w-5 shrink-0 text-slate-600" aria-hidden />
                  <span>
                    Името „{query}“ не е в списъка ни. Той покрива най-разпространените имена —
                    някои по-редки може да липсват.
                  </span>
                </p>
              )}
            </div>
          )}
        </section>

        {/* Предстоящи */}
        <section>
          <h2 className="section-title mb-5">Предстоящи именни дни и празници</h2>
          {upcoming.length === 0 ? (
            <EmptyState title="Няма отбелязани дни в следващия месец." />
          ) : (
            <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {upcoming.map((d) => (
                <li key={`${d.month}-${d.day}`} className="flex gap-4 p-4">
                  <div className="w-16 shrink-0 text-center">
                    <div className="text-2xl font-bold text-brand-700">{d.day}</div>
                    <div className="text-xs uppercase text-slate-500">{MONTHS[d.month - 1]}</div>
                  </div>
                  <div className="min-w-0">
                    {d.feasts.length > 0 && (
                      <div className="font-semibold text-crimson-700">{d.feasts.join(" · ")}</div>
                    )}
                    {d.names.length > 0 && (
                      <div className="text-slate-700">{d.names.join(", ")}</div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
