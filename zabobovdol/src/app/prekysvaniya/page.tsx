import type { Metadata } from "next";
import Link from "next/link";
import {
  Zap,
  Droplets,
  CalendarClock,
  AlertTriangle,
  ExternalLink,
} from "@/components/icons";
import { prisma } from "@/lib/prisma";
import { PageHero, Prose, Notice, SectionHeader } from "@/components/ui";
import { TelLink } from "@/components/TelLink";
import { formatDateTime } from "@/lib/format-date";
import { SECTION } from "@/lib/section-names";
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

// Пълни имена на класовете (не сглобени) — иначе Tailwind не ги вижда.
// „Ток“ беше бял текст върху amber-500 (2,15:1 — B36); сега значка по
// системата: кехлибар за тока, синьо за водата.
const UTILS: Record<string, { icon: typeof Zap; label: string; badge: string }> = {
  ELECTRICITY: { icon: Zap, label: "Ток", badge: "badge-warning" },
  WATER: { icon: Droplets, label: "Вода", badge: "badge" },
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
    <article id={o.slug} className="panel">
      <div className="flex items-start gap-4">
        <span className={o.planned ? "icon-chip" : "icon-chip icon-chip-danger"}>
          <Icon aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={u.badge}>{u.label}</span>
            <span className={o.planned ? "badge-neutral" : "badge-danger"}>
              {o.planned ? "Планово" : "Авария"}
            </span>
          </div>
          <h3 className="h-card mt-2">{o.area || "Засегнат район — вижте подробностите"}</h3>
          {when && (
            <p className="mt-1 flex items-start gap-2 text-base font-medium text-slate-800">
              <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" aria-hidden />
              <span>{when}</span>
            </p>
          )}
          {o.note && (
            <div className="mt-2">
              <Prose html={renderMarkdown(o.note)} />
            </div>
          )}
          {o.source && (
            <p className="text-meta mt-2">
              Източник:{" "}
              {href ? (
                <a href={href} target="_blank" rel="noopener noreferrer" className="link">
                  {o.source}
                  <ExternalLink className="ml-1 inline h-4 w-4 align-[-2px]" aria-hidden />
                  <span className="sr-only"> (отваря се в нов прозорец)</span>
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
        eyebrow={SECTION.daily}
        title="Прекъсвания на ток и вода"
        intro="Обявени планови и аварийни прекъсвания на електрозахранването и водата в Бобов дол и селата в общината. Проверявайте тук, преди да останете без ток или вода."
        crumbs={[{ name: "Прекъсвания на ток и вода", path: "/prekysvaniya" }]}
      />

      <div className="container-content space-y-10 py-10">
        {stale && (
          <Notice tone="danger" role="status" title="Информацията за тока може да е остаряла.">
            <p>
              Проверете на{" "}
              <a href={ERM_MAP_URL} target="_blank" rel="noopener noreferrer" className="link">
                картата на {ERM_SOURCE}
                <span className="sr-only"> (отваря се в нов прозорец)</span>
              </a>{" "}
              или звъннете на аварийния телефон в раздел{" "}
              <Link href="/uslugi?cat=UTILITY" className="link">
                Комунални услуги
              </Link>
              .
            </p>
          </Notice>
        )}

        {outages.length === 0 ? (
          <Notice
            tone="success"
            titleAs="h2"
            title={`Към ${formatDateTime(now)} няма обявени прекъсвания на тока и водата.`}
          >
            <p>
              Когато има планово или аварийно спиране, то ще се появи тук. При неочаквана авария
              звъннете на съответната служба — вижте по-долу.
            </p>
          </Notice>
        ) : (
          <>
            <section aria-labelledby="avarii">
              <SectionHeader id="avarii" title="Аварии сега" />
              {unplanned.length === 0 ? (
                <p className="text-base text-slate-700">Няма обявени аварии.</p>
              ) : (
                <div className="space-y-4">
                  {unplanned.map((o) => (
                    <OutageCard key={o.id} o={o} />
                  ))}
                </div>
              )}
            </section>

            <section aria-labelledby="planirani">
              <SectionHeader id="planirani" title="Планирани спирания" />
              {planned.length === 0 ? (
                <p className="text-base text-slate-700">Няма обявени планирани спирания.</p>
              ) : (
                <div className="space-y-4">
                  {planned.map((o) => (
                    <OutageCard key={o.id} o={o} />
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {/* Откъде са данните — служебна бележка под състоянието. */}
        <p className="max-w-3xl text-base text-slate-600">
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
        </p>

        <div className="grid gap-4 lg:grid-cols-2">
          <section aria-labelledby="avariya-zaglavie" className="panel">
            <h2 id="avariya-zaglavie" className="h-card flex items-center gap-2">
              <AlertTriangle className="h-6 w-6 shrink-0 text-amber-700" aria-hidden />
              При авария — на кого да звъннете
            </h2>
            <p className="mt-2 text-base text-slate-700">
              Ако токът или водата спре неочаквано (без да е обявено тук), подайте сигнал на
              аварийната служба. Телефоните са в раздел{" "}
              <Link href="/uslugi?cat=UTILITY" className="link">
                Комунални услуги
              </Link>
              . При опасност за живота — спешен телефон{" "}
              <TelLink phone="112" className="font-bold text-crimson-700 underline underline-offset-2">
                112
              </TelLink>
              .
            </p>
          </section>

          <section aria-labelledby="izvestiya" className="no-print panel">
            <h2 id="izvestiya" className="h-card">
              Научавайте първи
            </h2>
            <p className="mt-2 text-base text-slate-700">
              Изпратете тази страница на близките си или се абонирайте, за да научавате кога спира
              токът или водата.
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link href="/izvestiya" className="btn-primary">
                Известия на телефона
              </Link>
              <ShareButton
                title="Прекъсвания на ток и вода — Бобов дол"
                text="Кога спира токът и водата в Бобов дол и селата — вижте тук:"
                path="/prekysvaniya"
              />
              <RssLink />
            </div>
          </section>
        </div>

        <div className="no-print flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <PrintButton variant="secondary" label="Отпечатайте" />
          <p className="text-base text-slate-600">
            Знаете за обявено прекъсване, което липсва тук? Кажете ни на{" "}
            <TelLink phone={SITE.contact.phone} className="link whitespace-nowrap" />.
          </p>
        </div>
      </div>
    </>
  );
}
