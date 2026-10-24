import type { Metadata } from "next";
import { CalendarDays, Church, Info } from "@/components/icons";
import { PageHero, EmptyState, SectionHeader } from "@/components/ui";
import { buildMetadata } from "@/lib/seo";
import { SECTION } from "@/lib/section-names";
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
  keywords: [
    "имен ден днес",
    "кой празнува днес",
    "именни дни календар",
    "църковен календар",
    "кога е имен ден",
    "Carbon Stealth",
  ],
});

const MONTHS = [
  "януари", "февруари", "март", "април", "май", "юни",
  "юли", "август", "септември", "октомври", "ноември", "декември",
];
const WEEKDAYS = ["неделя", "понеделник", "вторник", "сряда", "четвъртък", "петък", "събота"];

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
        eyebrow={SECTION.daily}
        title="Именни дни и празници"
        intro="Кой празнува днес, кои са предстоящите именни дни и църковни празници — и кога е именният ден на близък."
        crumbs={[{ name: "Именни дни", path: "/imen-den" }]}
      />

      <div className="container-content space-y-12 py-10">
        {/* Днес */}
        <section
          aria-labelledby="dnes-zaglavie"
          className="rounded-2xl border-2 border-brand-200 bg-brand-50 p-5 sm:p-6"
        >
          <div className="flex items-center gap-3">
            <span className="icon-chip bg-white">
              <CalendarDays aria-hidden />
            </span>
            <h2 id="dnes-zaglavie" className="text-2xl font-bold text-slate-900">
              Днес е {formatDateBg(today.month, today.day, today.weekday)}
            </h2>
          </div>
          {todayInfo.feasts.length > 0 && (
            <p className="mt-4 flex items-start gap-2 text-lg font-semibold text-brand-800">
              <Church className="mt-1 h-5 w-5 shrink-0 text-gold-700" aria-hidden />
              <span>{todayInfo.feasts.join(" · ")}</span>
            </p>
          )}
          {todayInfo.names.length > 0 ? (
            <p className="mt-3 text-lg text-slate-800">
              Имен ден празнуват:{" "}
              <strong className="text-brand-800">{todayInfo.names.join(", ")}</strong>. Честит
              празник!
            </p>
          ) : (
            <p className="mt-3 text-base text-slate-700">Днес няма отбелязан имен ден.</p>
          )}
        </section>

        {/* Търсене по име */}
        <section aria-labelledby="tarsene-zaglavie">
          <SectionHeader id="tarsene-zaglavie" title="Кога е именният ден на…" />
          <form method="get" className="max-w-xl" role="search">
            <label htmlFor="ime" className="label">
              Име
            </label>
            {/* Подсказката е точно под полето (като във FormKit), бутонът —
                под тях на телефон и вдясно от полето от sm нагоре. */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <input
                  id="ime"
                  name="ime"
                  type="search"
                  defaultValue={query}
                  className="input"
                  autoComplete="off"
                  aria-describedby="ime-hint"
                />
                <p id="ime-hint" className="mt-1.5 text-base text-slate-600">
                  Напр. Иван, Мария, Георги.
                </p>
              </div>
              <button type="submit" className="btn-primary w-full sm:w-auto">
                Намерете
              </button>
            </div>
          </form>
          {found && (
            <div className="mt-4 text-lg" role="status">
              {found.length > 0 ? (
                <p className="text-slate-800">
                  <strong className="text-brand-800">{query}</strong> празнува на{" "}
                  {found.map((d) => `${d.day} ${MONTHS[d.month - 1]}`).join(" и ")}.
                </p>
              ) : (
                <p className="flex items-start gap-2 text-base text-slate-700">
                  <Info className="mt-1 h-5 w-5 shrink-0 text-brand-700" aria-hidden />
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
        <section aria-labelledby="predstoyashti-zaglavie">
          <SectionHeader id="predstoyashti-zaglavie" title="Предстоящи именни дни и празници" />
          {upcoming.length === 0 ? (
            <EmptyState icon={CalendarDays} title="Няма отбелязани дни в следващия месец." />
          ) : (
            <ul role="list" className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {upcoming.map((d) => (
                <li key={`${d.month}-${d.day}`} className="flex gap-4 p-4">
                  <div className="w-20 shrink-0 text-center">
                    <div className="text-2xl font-bold tabular-nums text-brand-700">{d.day}</div>
                    <div className="text-sm text-slate-600">{MONTHS[d.month - 1]}</div>
                    <div className="text-sm text-slate-600">{WEEKDAYS[d.weekday]}</div>
                  </div>
                  <div className="min-w-0 space-y-1 text-base">
                    {d.feasts.length > 0 && (
                      <p className="flex items-start gap-2 font-semibold text-brand-800">
                        <Church className="mt-0.5 h-5 w-5 shrink-0 text-gold-700" aria-hidden />
                        <span>{d.feasts.join(" · ")}</span>
                      </p>
                    )}
                    {d.names.length > 0 && <p className="text-slate-700">{d.names.join(", ")}</p>}
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
