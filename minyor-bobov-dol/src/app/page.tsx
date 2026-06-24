import Link from "next/link";
import { SITE } from "@/lib/site";
import {
  getNextMatch,
  getRecentResults,
  getLatestPosts,
  getStandings,
  getSponsors,
} from "@/lib/data";
import { Crest } from "@/components/Crest";
import { Section } from "@/components/ui";
import { NextMatchCard } from "@/components/NextMatchCard";
import { MatchList } from "@/components/MatchList";
import { NewsCard } from "@/components/NewsCard";
import { FormGuide } from "@/components/FormGuide";
import { StandingsTable } from "@/components/StandingsTable";
import {
  ArrowRight,
  CalendarDays,
  Newspaper,
  Trophy,
  Users,
} from "@/components/icons";

export const dynamic = "force-dynamic";

const QUICK_LINKS = [
  { href: "/programa", label: "Програма и резултати", icon: CalendarDays },
  { href: "/klasirane", label: "Класиране", icon: Trophy },
  { href: "/otbor", label: "Отбор", icon: Users },
  { href: "/novini", label: "Новини", icon: Newspaper },
];

export default async function HomePage() {
  const [nextMatch, results, posts, standings, sponsors] = await Promise.all([
    getNextMatch(),
    getRecentResults(5),
    getLatestPosts(3),
    getStandings(),
    getSponsors(),
  ]);

  const topStandings = standings.slice(0, 6);

  return (
    <>
      {/* Геройска секция в клубните цветове */}
      <section className="relative overflow-hidden bg-brand-900 text-white">
        <Crest
          decorative
          className="pointer-events-none absolute -right-10 -top-10 h-80 w-auto opacity-10"
        />
        <div className="container-content relative grid items-center gap-8 py-14 sm:py-20 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <p className="eyebrow text-gold-400">Футболен клуб · от {SITE.founded} г.</p>
            <h1 className="mt-3 font-display text-4xl font-extrabold leading-tight sm:text-5xl">
              {SITE.name}
            </h1>
            <p className="mt-4 max-w-xl text-lg text-slate-300">{SITE.slogan}.</p>
            <p className="mt-2 max-w-xl text-slate-400">{SITE.description}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/programa" className="btn-gold">
                Програма и резултати
              </Link>
              <Link
                href="/otbor"
                className="btn border border-white/30 text-white hover:bg-white/10"
              >
                Нашият отбор
              </Link>
            </div>
          </div>
          <div className="hidden justify-center lg:flex">
            <Crest className="h-64 w-auto drop-shadow-2xl" />
          </div>
        </div>
        <div className="h-1.5 w-full bg-gradient-to-r from-gold-400 via-gold-500 to-gold-400" />
      </section>

      {/* Бързи препратки */}
      <nav className="container-content -mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Бързи препратки">
        {QUICK_LINKS.map((q) => (
          <Link
            key={q.href}
            href={q.href}
            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:border-gold-300 hover:shadow-md"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-900 text-gold-400">
              <q.icon className="h-5 w-5" aria-hidden />
            </span>
            <span className="text-sm sm:text-base">{q.label}</span>
          </Link>
        ))}
      </nav>

      {/* Следващ мач + последни резултати */}
      <section className="container-content grid gap-6 py-10 lg:grid-cols-2">
        <div>
          <h2 className="section-title mb-5">Следващ двубой</h2>
          {nextMatch ? (
            <NextMatchCard match={nextMatch} />
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
              Няма насрочен мач в момента. Следете{" "}
              <Link href="/programa" className="font-semibold text-brand-800 underline">
                програмата
              </Link>
              .
            </div>
          )}
        </div>
        <div>
          <div className="mb-5 flex items-end justify-between gap-3">
            <h2 className="section-title">Последни резултати</h2>
            {results.length > 0 && <FormGuide matches={results} />}
          </div>
          {results.length > 0 ? (
            <MatchList matches={results} />
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
              Все още няма въведени резултати.
            </div>
          )}
        </div>
      </section>

      {/* Класиране (кратко) */}
      {topStandings.length > 0 && (
        <Section title="Класиране" href="/klasirane" hrefLabel="Пълна таблица">
          <StandingsTable rows={topStandings} />
        </Section>
      )}

      {/* Новини */}
      {posts.length > 0 && (
        <Section title="Последни новини" href="/novini">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((p) => (
              <NewsCard key={p.slug} post={p} />
            ))}
          </div>
        </Section>
      )}

      {/* Спонсори */}
      {sponsors.length > 0 && (
        <Section title="Спонсори и партньори">
          <ul className="flex flex-wrap items-center gap-4">
            {sponsors.map((s) => {
              const inner = s.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={s.logoUrl}
                  alt={s.name}
                  className="h-12 w-auto object-contain"
                  loading="lazy"
                />
              ) : (
                <span className="font-semibold text-slate-700">{s.name}</span>
              );
              return (
                <li
                  key={s.id}
                  className="grid h-20 min-w-[8rem] place-items-center rounded-xl border border-slate-200 bg-white px-5"
                >
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noopener noreferrer" title={s.name}>
                      {inner}
                    </a>
                  ) : (
                    inner
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {/* Призив към действие */}
      <section className="container-content py-12">
        <div className="flex flex-col items-start justify-between gap-4 rounded-2xl bg-brand-900 p-8 text-white sm:flex-row sm:items-center">
          <div>
            <h2 className="font-display text-2xl font-bold">Подкрепи „миньорите“</h2>
            <p className="mt-1 text-slate-300">
              Ела на стадион „Николай Кръстев – Шулц“ и подкрепи отбора на Бобов дол.
            </p>
          </div>
          <Link href="/kontakti" className="btn-gold shrink-0">
            Свържи се с клуба
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>
    </>
  );
}
