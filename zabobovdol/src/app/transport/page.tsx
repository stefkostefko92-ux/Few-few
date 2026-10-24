import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { prisma } from "@/lib/prisma";
import { PageHero, EmptyState, SectionHeader } from "@/components/ui";
import { PhoneButton } from "@/components/PhoneButton";
import { TelLink } from "@/components/TelLink";
import { buildMetadata } from "@/lib/seo";
import { SECTION } from "@/lib/section-names";
import { Bus, Car, ExternalLink, Printer, TrainFront } from "@/components/icons";
import { BUS } from "@/lib/bus-schedule";
import { busBoard, inMinutesText } from "@/lib/bus-board";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Транспорт в Бобов дол — автобус, влак, такси и споделено пътуване",
  description:
    "Разписанието на автобуса Бобов дол ⇄ Дупница, влаковете на БДЖ, телефоните на такситата и автогарата и обяви за споделено пътуване — на едно място.",
  path: "/transport",
  keywords: [
    "автобус Бобов дол Дупница",
    "разписание автобус Бобов дол",
    "такси Бобов дол",
    "влак БДЖ Бобов дол",
    "споделено пътуване Бобов дол",
    "Carbon Stealth",
  ],
});

const JUMPS = [
  { href: "#avtobus", label: "Автобус" },
  { href: "#taksi", label: "Такси" },
  { href: "#vlak", label: "Влак и спирки" },
  { href: "#spodeleno", label: "Споделено пътуване" },
];

const GUIDES: [string, string][] = [
  ["kak-da-tursya-novini-internet", "Как да проверя разписание онлайн"],
  ["t-razpisanie-avtobus", "Как да проверя разписание на автобус/влак"],
  ["t-bilet-vlak-online", "Как да си купя билет за влак онлайн"],
  ["t-povikam-taksi", "Как да повикам такси по телефона"],
];

// Външна връзка: иконата и „(отваря се в нов прозорец)“ за екранния четец.
function External({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="btn-secondary w-full sm:w-auto">
      <ExternalLink className="h-5 w-5 shrink-0" aria-hidden />
      {children}
      <span className="sr-only"> (отваря се в нов прозорец)</span>
    </a>
  );
}

export default async function TransportPage() {
  const services = await prisma.service.findMany({
    where: { published: true, category: "TRANSPORT" },
    orderBy: { order: "asc" },
  });
  const now = new Date();
  const boards = BUS.directions.map((d) => ({ dir: d, board: busBoard(d, now) }));
  const anyWorkday = boards.some((b) => b.board.hasWorkdayOnly);

  return (
    <>
      <PageHero
        eyebrow={SECTION.daily}
        title="Транспорт"
        intro="Всичко за пътуването от и до Бобов дол на едно място — разписания, телефони, спирки и споделено пътуване."
        crumbs={[{ name: "Транспорт", path: "/transport" }]}
      >
        <nav aria-label="Към раздел от страницата" className="no-print">
          <ul className="flex flex-wrap gap-2">
            {JUMPS.map((j) => (
              <li key={j.href}>
                <a href={j.href} className="chip">
                  {j.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </PageHero>

      <div className="container-content space-y-12 py-10">
        {/* Разписание автобус Бобов дол ⇄ Дупница — най-търсеното, затова първо. */}
        <section id="avtobus" aria-labelledby="avtobus-zaglavie">
          <SectionHeader id="avtobus-zaglavie" title="Автобус Бобов дол ⇄ Дупница" className="mb-2" />
          <p className="mb-5 text-base text-slate-600">Превозвач: „{BUS.carrier}“</p>
          <div className="grid gap-4 md:grid-cols-2">
            {boards.map(({ dir, board }) => (
              <div key={dir.title} className="panel">
                <h3 className="h-card flex items-center gap-2">
                  <Bus className="h-6 w-6 shrink-0 text-brand-700" aria-hidden />
                  {dir.title}
                </h3>
                <p className="mt-2 text-base text-slate-800">
                  {board.next ? (
                    <>
                      Следващ автобус днес:{" "}
                      <strong className="tabular-nums">{board.next.time}</strong>{" "}
                      <span className="text-slate-600">({inMinutesText(board.next.inMinutes)})</span>
                    </>
                  ) : (
                    <span className="text-slate-600">Днес няма повече курсове по разписание.</span>
                  )}
                </p>
                <ul role="list" className="mt-3 flex flex-wrap gap-2" aria-label={`Часове на тръгване: ${dir.title}`}>
                  {board.times.map((t) => (
                    <li
                      key={t.time}
                      className={
                        t.next
                          ? "rounded-full bg-brand-700 px-3 py-1 text-base font-bold tabular-nums text-white"
                          : t.past
                            ? "rounded-full bg-slate-100 px-3 py-1 text-base font-medium tabular-nums text-slate-600"
                            : "rounded-full bg-brand-50 px-3 py-1 text-base font-semibold tabular-nums text-brand-800"
                      }
                    >
                      {t.time}
                      {t.workdayOnly && (
                        <>
                          <sup aria-hidden="true" className="ml-0.5 font-semibold">
                            Р
                          </sup>
                          <span className="sr-only"> (само в работни дни)</span>
                        </>
                      )}
                      {t.next && <span className="sr-only"> — следващ</span>}
                    </li>
                  ))}
                </ul>
                <ul className="mt-4 list-disc space-y-1 pl-5 text-base text-slate-700">
                  {dir.notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href="/pechat/avtobus" className="btn-secondary w-full shrink-0 sm:w-auto">
              <Printer className="h-5 w-5 shrink-0" aria-hidden />
              Отпечатайте разписанието
            </Link>
            <p className="text-base text-slate-600">
              {anyWorkday && (
                <>
                  <strong className="font-semibold">Р</strong> — само в работни дни. Синьо — следващият
                  курс днес.{" "}
                </>
              )}
              Разписанието може да се променя — при съмнение проверете на спирката или при превозвача.
            </p>
          </div>
        </section>

        {/* Такси и автогара */}
        <section id="taksi" aria-labelledby="taksi-zaglavie">
          <SectionHeader id="taksi-zaglavie" title="Такси и автогара" />
          {services.length === 0 ? (
            <EmptyState
              icon={Car}
              title="Тук ще добавим местните таксита и автогарата."
              hint="Знаете номер на местно такси? Пишете ни, за да го добавим."
              action={
                <Link href="/kontakti" className="btn-secondary">
                  Пишете ни
                </Link>
              }
            />
          ) : (
            <ul role="list" className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
              {services.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
                >
                  <div className="min-w-0">
                    <Link href={`/uslugi/${s.slug}`} className="h-card link-quiet">
                      {s.name}
                    </Link>
                    {s.description && <p className="mt-1 text-base text-slate-600">{s.description}</p>}
                  </div>
                  {s.phone && <PhoneButton phone={s.phone} className="shrink-0" />}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Влак и спирки */}
        <section id="vlak" aria-labelledby="vlak-zaglavie">
          <SectionHeader id="vlak-zaglavie" title="Влак и автобусни спирки" />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="panel flex flex-col gap-3">
              <h3 className="h-card flex items-center gap-2">
                <TrainFront className="h-6 w-6 shrink-0 text-brand-700" aria-hidden />
                Влак (БДЖ)
              </h3>
              <p className="text-base text-slate-700">
                Проверете разписания и купете билети онлайн от сайта на БДЖ. Информация на телефон{" "}
                <TelLink phone="029311111" className="link whitespace-nowrap" />.
              </p>
              <div className="mt-auto">
                <External href="https://razpisanie.bdz.bg">Разписание на влаковете</External>
              </div>
            </div>
            <div className="panel flex flex-col gap-3">
              <h3 className="h-card flex items-center gap-2">
                <Bus className="h-6 w-6 shrink-0 text-brand-700" aria-hidden />
                Автобуси и спирки
              </h3>
              <p className="text-base text-slate-700">
                Намерете най-близката спирка и маршрут с Google Карти — потърсете „автобусна
                спирка“ или изберете упътване с обществен транспорт.
              </p>
              <div className="mt-auto">
                <External href="https://www.google.com/maps/search/автобусна+спирка+Бобов+дол">
                  Намерете спирка
                </External>
              </div>
            </div>
          </div>
        </section>

        {/* Споделено пътуване */}
        <section id="spodeleno" aria-labelledby="spodeleno-zaglavie" className="panel">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-4">
              <span className="icon-chip">
                <Car aria-hidden />
              </span>
              <div className="min-w-0">
                <h2 id="spodeleno-zaglavie" className="h-sub">
                  Споделено пътуване
                </h2>
                <p className="mt-1 max-w-2xl text-base text-slate-700">
                  Пътувате редовно до Дупница, Кюстендил или София? Споделете колата със съседи и
                  разделете разходите — по-евтино и по-приятно.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              <Link href="/spodeleno-patuvane" className="btn-secondary">
                Вижте обявите
              </Link>
              <Link href="/spodeleno-patuvane/nova" className="btn-primary">
                Подайте обява
              </Link>
            </div>
          </div>
        </section>

        {/* Полезни обяснения */}
        <section aria-labelledby="kak-da-zaglavie">
          <SectionHeader id="kak-da-zaglavie" title="Полезно „Как да…“" href="/kak-da" />
          <ul role="list" className="grid gap-3 sm:grid-cols-2">
            {GUIDES.map(([slug, label]) => (
              <li key={slug}>
                <Link
                  href={`/kak-da/${slug}`}
                  className="card flex h-full items-center justify-between gap-3 text-base font-medium text-slate-800"
                >
                  <span>{label}</span>
                  <span aria-hidden="true" className="shrink-0 text-brand-700">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
