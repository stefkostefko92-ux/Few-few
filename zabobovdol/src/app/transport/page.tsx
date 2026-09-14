import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { PageHero, EmptyState } from "@/components/ui";
import { buildMetadata } from "@/lib/seo";
import { Phone, TrainFront, Bus, Car } from "@/components/icons";

import { BUS } from "@/lib/bus-schedule";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Транспорт в Бобов дол — такси, автобуси, влак, спирки и споделено пътуване",
  description:
    "Полезна транспортна информация за Бобов дол: важни телефони (такси, автогара), разписания на влаковете (БДЖ), как да намерите спирка и обяви за споделено пътуване.",
  path: "/transport",
});

export default async function TransportPage() {
  const services = await prisma.service.findMany({
    where: { published: true, category: "TRANSPORT" },
    orderBy: { order: "asc" },
  });

  return (
    <>
      <PageHero
        title="Транспорт"
        intro="Всичко за пътуването от и до Бобов дол на едно място — телефони, разписания, спирки и споделено пътуване."
        crumbs={[{ name: "Транспорт", path: "/transport" }]}
      />
      <div className="container-content space-y-10 py-10">
        {/* Важни телефони (такси, автогара и др.) */}
        <section>
          <h2 className="section-title mb-5">Важни телефони</h2>
          {services.length === 0 ? (
            <EmptyState
              title="Тук ще добавим местните таксита и автогарата."
              hint="Знаете номер на местно такси? Пишете ни, за да го добавим."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {services.map((s) => (
                <div key={s.id} className="card">
                  <Link href={`/uslugi/${s.slug}`} className="font-display text-lg font-bold text-slate-900 hover:text-brand-700">
                    {s.name}
                  </Link>
                  {s.description && <p className="mt-1 text-sm text-slate-600">{s.description}</p>}
                  {s.phone && (
                    <a href={`tel:${s.phone}`} className="btn-secondary mt-3 w-full"><Phone className="h-4 w-4" aria-hidden /> {s.phone}</a>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Разписание автобус Бобов дол ⇄ Дупница */}
        <section>
          <h2 className="section-title mb-1">Автобус Бобов дол ⇄ Дупница</h2>
          <p className="mb-5 text-sm text-slate-600">Превозвач: {BUS.carrier}</p>
          <div className="grid gap-4 md:grid-cols-2">
            {BUS.directions.map((d) => (
              <div key={d.title} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="flex items-center gap-2 font-display text-lg font-bold text-slate-900">
                  <Bus className="h-5 w-5 text-brand-700" aria-hidden />
                  {d.title}
                </h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {d.times.map((t) => (
                    <span
                      key={t}
                      className="rounded-lg bg-brand-50 px-2.5 py-1 text-base font-semibold text-brand-800"
                    >
                      {t}
                    </span>
                  ))}
                </div>
                <ul className="mt-4 space-y-1 text-sm text-slate-600">
                  {d.notes.map((n, i) => (
                    <li key={i}>• {n}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link href="/pechat/avtobus" className="btn-secondary">
              Принтирай разписанието
            </Link>
            <p className="text-sm text-slate-600">
              Разписанието може да се променя. При съмнение проверете на спирката
              или с превозвача.
            </p>
          </div>
        </section>

        {/* Влак и автобус */}
        <section className="grid gap-4 md:grid-cols-2">
          <div className="card">
            <h2 className="font-display text-lg font-bold text-slate-900"><TrainFront className="mr-1 inline h-5 w-5 align-text-bottom text-brand-700" aria-hidden />Влак (БДЖ)</h2>
            <p className="mt-1 text-sm text-slate-700">
              Проверете разписания и купете билети онлайн от официалния сайт на
              БДЖ. Информация на телефон 02 931 11 11.
            </p>
            <a href="https://razpisanie.bdz.bg" target="_blank" rel="noopener noreferrer" className="btn-secondary mt-3">
              Разписание на влаковете
            </a>
          </div>
          <div className="card">
            <h2 className="font-display text-lg font-bold text-slate-900"><Bus className="mr-1 inline h-5 w-5 align-text-bottom text-brand-700" aria-hidden />Автобуси и спирки</h2>
            <p className="mt-1 text-sm text-slate-700">
              Намерете най-близката спирка и маршрут с Google Карти — потърсете
              „автобусна спирка“ или изберете упътване с обществен транспорт.
            </p>
            <a href="https://www.google.com/maps/search/автобусна+спирка+Бобов+дол" target="_blank" rel="noopener noreferrer" className="btn-secondary mt-3">
              Намери спирка
            </a>
          </div>
        </section>

        {/* Споделено пътуване */}
        <section className="rounded-2xl border border-gold-200 bg-gold-50 p-6">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="font-display text-xl font-bold text-slate-900">
                <Car className="mr-1 inline h-6 w-6 align-text-bottom text-brand-700" aria-hidden />Споделено пътуване
              </h2>
              <p className="mt-1 max-w-2xl text-slate-700">
                Пътувате редовно до Дупница, Кюстендил или София? Споделете колата
                със съседи и разделете разходите — по-евтино и по-приятно.
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Link href="/spodeleno-patuvane" className="btn-secondary">Виж обявите</Link>
              <Link href="/spodeleno-patuvane/nova" className="btn-gold">Пусни обява</Link>
            </div>
          </div>
        </section>

        {/* Полезни обяснения */}
        <section>
          <h2 className="section-title mb-5">Полезно „Как да…“</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["kak-da-tursya-novini-internet", "Как да проверя разписание онлайн"],
              ["t-razpisanie-avtobus", "Как да проверя разписание на автобус/влак"],
              ["t-bilet-vlak-online", "Как да си купя билет за влак онлайн"],
              ["t-povikam-taksi", "Как да повикам такси по телефона"],
            ].map(([slug, label]) => (
              <Link key={slug} href={`/kak-da/${slug}`} className="card text-sm font-medium text-slate-800">
                {label} →
              </Link>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
