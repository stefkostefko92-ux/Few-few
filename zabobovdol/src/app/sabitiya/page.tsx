import Link from "next/link";
import type { Metadata } from "next";
import type { Event } from "@prisma/client";
import { MapPin } from "@/components/icons";
import { prisma } from "@/lib/prisma";
import { PageHero, EmptyState, SectionHeader } from "@/components/ui";
import { buildMetadata } from "@/lib/seo";
import { plainText } from "@/lib/markdown";
import { formatEventWhen, isoDate, isoDateTime } from "@/lib/format-date";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Събития в Бобов дол — какво се случва в града",
  description:
    "Календар на предстоящите събития в Бобов дол: културни прояви, празници, срещи и инициативи.",
  path: "/sabitiya",
  keywords: [
    "събития Бобов дол",
    "календар Бобов дол",
    "празници Бобов дол",
    "културни прояви Бобов дол",
    "какво да правя в Бобов дол",
  ],
});

// Съкращенията на месеците за календарното квадратче (пълната дата е в
// текста до него — квадратчето е само за окото, aria-hidden).
const MONTH_SHORT = [
  "ян.",
  "февр.",
  "март",
  "апр.",
  "май",
  "юни",
  "юли",
  "авг.",
  "септ.",
  "окт.",
  "ноем.",
  "дек.",
];

// startAt/endAt са стенно софийско време от админ полето ({ wall: true },
// виж lib/format-date.ts).
const WALL = { wall: true } as const;

function CalendarBlock({ at, past = false }: { at: Date; past?: boolean }) {
  const [, m, d] = isoDate(at, WALL).split("-").map(Number);
  return (
    <div
      aria-hidden
      className={`w-16 shrink-0 self-start rounded-xl border py-2 text-center ${
        past ? "border-slate-200 bg-slate-50" : "border-brand-200 bg-brand-50"
      }`}
    >
      <div
        className={`font-display text-2xl font-bold leading-none ${past ? "text-slate-700" : "text-brand-800"}`}
      >
        {d}
      </div>
      <div className="mt-1 text-sm text-slate-700">{MONTH_SHORT[m - 1]}</div>
    </div>
  );
}

function EventCard({ e, past = false }: { e: Event; past?: boolean }) {
  return (
    <li>
      <Link
        href={`/sabitiya/${e.slug}`}
        className={`card group flex h-full gap-4 ${past ? "bg-slate-50" : ""}`}
      >
        <CalendarBlock at={e.startAt} past={past} />
        <div className="min-w-0">
          {past && <span className="badge-neutral mb-1">Отминало</span>}
          <h3 className="h-card group-hover:text-brand-700 group-hover:underline">{e.title}</h3>
          <p className="mt-1 text-base font-medium text-slate-800">
            <time dateTime={isoDateTime(e.startAt, WALL)}>
              {formatEventWhen(e.startAt, e.endAt, WALL)}
            </time>
          </p>
          {e.location && (
            <p className="mt-1 flex items-start gap-1.5 text-base text-slate-700">
              <MapPin className="mt-1 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
              <span>{e.location}</span>
            </p>
          )}
          {!past && e.description && (
            <p className="mt-2 text-base text-slate-600">{plainText(e.description, 120)}</p>
          )}
        </div>
      </Link>
    </li>
  );
}

export default async function EventsPage() {
  const now = new Date();
  const [upcoming, past] = await Promise.all([
    prisma.event.findMany({
      where: { published: true, startAt: { gte: now } },
      orderBy: { startAt: "asc" },
    }),
    prisma.event.findMany({
      where: { published: true, startAt: { lt: now } },
      orderBy: { startAt: "desc" },
      take: 6,
    }),
  ]);

  return (
    <>
      <PageHero
        title="Събития"
        intro="Какво предстои в Бобов дол."
        crumbs={[{ name: "Събития", path: "/sabitiya" }]}
      />
      <div className="container-content py-10">
        <section aria-labelledby="predstoyashti">
          <SectionHeader title="Предстоящи" id="predstoyashti" />
          {upcoming.length === 0 ? (
            <EmptyState
              title="Няма обявени предстоящи събития."
              hint="Организирате събитие в Бобов дол? Пишете ни и ще го добавим в календара."
              action={
                <Link href="/kontakti" className="btn-secondary">
                  Съобщете за събитие
                </Link>
              }
            />
          ) : (
            <ul role="list" className="grid gap-4 md:grid-cols-2">
              {upcoming.map((e) => (
                <EventCard key={e.id} e={e} />
              ))}
            </ul>
          )}
        </section>

        {past.length > 0 && (
          <section aria-labelledby="otminali" className="mt-12">
            <SectionHeader title="Отминали" id="otminali" />
            <ul role="list" className="grid gap-4 md:grid-cols-2">
              {past.map((e) => (
                <EventCard key={e.id} e={e} past />
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
