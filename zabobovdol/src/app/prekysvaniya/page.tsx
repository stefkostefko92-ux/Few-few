import type { Metadata } from "next";
import Link from "next/link";
import {
  Zap,
  Droplets,
  CalendarClock,
  CheckCircle2,
  AlertTriangle,
  Info,
  ExternalLink,
} from "@/components/icons";
import { prisma } from "@/lib/prisma";
import { PageHero, Prose, EmptyState } from "@/components/ui";
import { buildMetadata } from "@/lib/seo";
import { renderMarkdown } from "@/lib/markdown";
import { PrintButton } from "@/components/PrintButton";
import { ShareButton } from "@/components/ShareButton";
import { SITE } from "@/lib/site";
import {
  ERM_MAP_URL,
  ERM_SOURCE,
  STATUS_SETTING_KEY,
  formatSofiaInstant,
  isIngestEnabled,
  isStale,
  parseStatus,
  sofiaWallNow,
  type IngestStatus,
} from "@/lib/ingest-outages-core";
import { outageWhen } from "@/lib/ingest-outages-rss";
import { RssLink } from "./RssLink";

// Последното състояние на автоматичния внос (или null — няма/грешка в базата).
async function ingestStatus(): Promise<IngestStatus | null> {
  try {
    const row = await prisma.siteSetting.findUnique({ where: { key: STATUS_SETTING_KEY } });
    return row ? parseStatus(row.value) : null;
  } catch {
    return null;
  }
}

export const dynamic = "force-dynamic";

const RSS_URL = `${SITE.url}/prekysvaniya/rss.xml`;
const base = buildMetadata({
  title: "Прекъсвания на ток и вода — Бобов дол",
  description:
    "Планови и аварийни прекъсвания на електрозахранването и водоснабдяването в Бобов дол и селата в общината: кои места са засегнати и за кога е обявено.",
  path: "/prekysvaniya",
});

export const metadata: Metadata = {
  ...base,
  keywords: [
    "прекъсвания на тока Бобов дол",
    "спиране на водата Бобов дол",
    "планирани прекъсвания ЕРМ Запад",
    "аварии ток и вода община Бобов дол",
    "спиране на тока села Бобов дол",
    "Carbon Stealth",
  ],
  alternates: {
    ...base.alternates,
    types: { "application/rss+xml": [{ url: RSS_URL, title: "Прекъсвания на ток и вода — RSS" }] },
  },
};

const UTILS: Record<
  string,
  { icon: typeof Zap; label: string; box: string; chip: string }
> = {
  ELECTRICITY: {
    icon: Zap,
    label: "Ток",
    box: "border-amber-300 bg-amber-50",
    chip: "bg-amber-500 text-white",
  },
  WATER: {
    icon: Droplets,
    label: "Вода",
    box: "border-brand-200 bg-brand-50",
    chip: "bg-brand-700 text-white",
  },
};

type Row = {
  id: string;
  slug: string;
  utility: string;
  area: string;
  startAt: Date | null;
  endAt: Date | null;
  note: string;
  planned: boolean;
  source: string;
  sourceUrl: string;
};

function safeHttpUrl(u: string): string | null {
  try {
    const p = new URL(u);
    return p.protocol === "https:" || p.protocol === "http:" ? p.toString() : null;
  } catch {
    return null;
  }
}

function OutageCard({ o }: { o: Row }) {
  const u = UTILS[o.utility] ?? UTILS.ELECTRICITY;
  const Icon = u.icon;
  const when = outageWhen(o);
  const href = o.sourceUrl ? safeHttpUrl(o.sourceUrl) : null;
  return (
    <article id={o.slug} className={"scroll-mt-24 rounded-xl border p-5 " + u.box}>
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-slate-700">
          <Icon className="h-6 w-6" aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={"inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold " + u.chip}>
              {u.label}
            </span>
            <span
              className={
                "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold " +
                (o.planned ? "bg-green-50 text-green-700" : "bg-red-100 text-red-800")
              }
            >
              {o.planned ? "Планово" : "Авария"}
            </span>
          </div>
          <h3 className="mt-1.5 text-lg font-bold text-slate-900">
            {o.area || "Засегнат район — вижте подробностите"}
          </h3>
          {when && (
            <p className="mt-1 flex items-center gap-1.5 text-slate-700">
              <CalendarClock className="h-4 w-4 shrink-0" aria-hidden />
              {when}
            </p>
          )}
          {o.note && (
            <div className="mt-2">
              <Prose html={renderMarkdown(o.note)} />
            </div>
          )}
          {o.source && (
            <p className="mt-2 text-sm text-slate-600">
              Източник:{" "}
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[44px] items-center gap-1 font-medium text-brand-700 hover:underline"
                >
                  {o.source}
                  <ExternalLink className="h-4 w-4" aria-hidden />
                  <span className="sr-only">(отваря се в нов прозорец)</span>
                </a>
              ) : (
                <span className="font-medium text-slate-700">{o.source}</span>
              )}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

export default async function OutagesPage() {
  const now = new Date();
  // Времената на прекъсванията се пазят като стенно време на София (виж
  // ingest-outages-core.ts) — затова сравняваме със „сега“ по същия часовник.
  const nowWall = sofiaWallNow(now);
  const [outages, status] = await Promise.all([
    prisma.outage.findMany({
      where: {
        published: true,
        OR: [{ endAt: null }, { endAt: { gte: nowWall } }],
      },
      orderBy: [{ startAt: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        slug: true,
        utility: true,
        area: true,
        startAt: true,
        endAt: true,
        note: true,
        planned: true,
        source: true,
        sourceUrl: true,
      },
    }),
    ingestStatus(),
  ]);

  const unplanned = outages.filter((o) => !o.planned);
  const planned = outages.filter((o) => o.planned);
  const auto = isIngestEnabled(process.env.ERM_INGEST_ENABLED) && status !== null;
  const lastOk = status?.lastOkAt ? new Date(status.lastOkAt) : null;
  const stale = auto && isStale(status?.lastOkAt ?? null, now);

  return (
    <>
      <PageHero
        eyebrow="Комунални услуги"
        title="Прекъсвания на ток и вода"
        intro="Обявени планови и аварийни прекъсвания на електрозахранването и водата в Бобов дол и селата в общината. Проверявайте тук, преди да останете без ток или вода."
        crumbs={[{ name: "Прекъсвания на ток и вода", path: "/prekysvaniya" }]}
      />

      <div className="container-content space-y-8 py-10">
        <section
          aria-label="Откъде са данните"
          className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-700"
        >
          <p className="flex items-start gap-2">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" aria-hidden />
            <span>
              {auto ? (
                <>
                  Спиранията на <strong>тока</strong> се взимат автоматично от картата на{" "}
                  <strong>{ERM_SOURCE}</strong>.{" "}
                  {lastOk ? (
                    <>
                      Последна проверка: <strong>{formatSofiaInstant(lastOk)}</strong>.
                    </>
                  ) : (
                    <>Все още няма успешна проверка.</>
                  )}{" "}
                  Спиранията на <strong>водата</strong> се въвеждат ръчно от екипа на сайта.
                </>
              ) : (
                <>Прекъсванията се въвеждат ръчно от екипа на сайта по обявленията на дружествата.</>
              )}
            </span>
          </p>
        </section>

        {stale && (
          <div
            role="status"
            className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-800"
          >
            <p className="flex items-start gap-2 font-semibold">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
              Информацията за тока може да е остаряла.
            </p>
            <p className="mt-1">
              Проверете на{" "}
              <a
                href={ERM_MAP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-red-800 underline"
              >
                картата на {ERM_SOURCE}
                <span className="sr-only"> (отваря се в нов прозорец)</span>
              </a>{" "}
              или звъннете на аварийния телефон в раздел{" "}
              <Link href="/uslugi?cat=UTILITY" className="font-semibold text-red-800 underline">
                Комунални услуги
              </Link>
              .
            </p>
          </div>
        )}

        {outages.length === 0 ? (
          <EmptyState
            title="В момента няма обявени прекъсвания"
            hint="Когато има планово или аварийно спиране на тока или водата, то ще се появи тук. При спешна авария звъннете на съответната служба."
          />
        ) : (
          <>
            <section aria-labelledby="avarii" className="space-y-4">
              <h2 id="avarii" className="section-title">
                Аварии сега
              </h2>
              {unplanned.length === 0 ? (
                <p className="text-slate-700">Няма обявени аварии.</p>
              ) : (
                unplanned.map((o) => <OutageCard key={o.id} o={o} />)
              )}
            </section>

            <section aria-labelledby="planirani" className="space-y-4">
              <h2 id="planirani" className="section-title">
                Планирани спирания
              </h2>
              {planned.length === 0 ? (
                <p className="text-slate-700">Няма обявени планирани спирания.</p>
              ) : (
                planned.map((o) => <OutageCard key={o.id} o={o} />)
              )}
            </section>
          </>
        )}

        <section
          aria-labelledby="izvestiya"
          className="no-print rounded-2xl border border-slate-200 bg-white p-6"
        >
          <h2 id="izvestiya" className="text-lg font-bold text-slate-900">
            Научавайте първи
          </h2>
          <p className="mt-2 text-slate-700">
            Изпратете тази страница на близките си или се абонирайте, за да научавате кога
            спира токът или водата.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <ShareButton
              title="Прекъсвания на ток и вода — Бобов дол"
              text="Кога спира токът и водата в Бобов дол и селата — вижте тук:"
              path="/prekysvaniya"
            />
            <a href="/izvestiya" className="btn-primary">
              Известия на телефона
            </a>
            <RssLink />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-brand-700" aria-hidden />
            <h2 className="text-lg font-bold text-slate-900">При авария — на кого да звънна</h2>
          </div>
          <p className="mt-2 text-slate-700">
            Ако токът или водата спре неочаквано (без да е обявено тук), подайте
            сигнал на аварийната служба. Телефоните са в раздел{" "}
            <Link href="/uslugi?cat=UTILITY" className="font-medium text-brand-700 hover:underline">
              Комунални услуги
            </Link>
            . При опасност за живота — спешен телефон{" "}
            <a href="tel:112" className="font-bold text-crimson-700">
              112
            </a>
            .
          </p>
        </section>

        <div className="no-print">
          <PrintButton variant="secondary" label="Принтирай" />
        </div>

        <p className="text-sm text-slate-600">
          Знаете за обявено прекъсване, което липсва тук? Кажете ни на{" "}
          <a href={`tel:${SITE.contact.phone}`} className="font-medium text-brand-700 hover:underline">
            {SITE.contact.phone}
          </a>
          .
        </p>
      </div>
    </>
  );
}
