import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sofiaDay } from "@/lib/stats";
import {
  addDays,
  formatPct,
  MIN_N,
  northStar,
  safeRate,
  weekStart,
  ymd,
} from "@/lib/analytics-core";
import { EVENT_LABELS, NORTH_STAR_METRICS, channelGroup, sourceLabel } from "./labels";

export const dynamic = "force-dynamic";

// Табло „Статистика“ — само за администратор. Чете САМО агрегати от DailyStat
// (брой на ден × метрика × път × източник). Няма посетители, сесии или
// идентификатори — затова няма и „уникални посетители“ или кохорти.
// Определенията → docs/tracking-plan.md.

type SumRow = { _sum: { count: number | null } };
const n = (r: SumRow) => r._sum.count ?? 0;
const fmt = (x: number) => x.toLocaleString("bg-BG");

function Bar({ value, max }: { value: number; max: number }) {
  const w = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-3 w-full rounded bg-slate-100" aria-hidden="true">
      <div className="h-3 rounded bg-brand-600" style={{ width: `${w}%` }} />
    </div>
  );
}

function Section({
  title,
  def,
  children,
}: {
  title: string;
  def: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-600">{def}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Empty() {
  return <p className="text-sm text-slate-600">Все още няма данни за този период.</p>;
}

function monthStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

const MONTHS = [
  "януари", "февруари", "март", "април", "май", "юни",
  "юли", "август", "септември", "октомври", "ноември", "декември",
];

async function load() {
  const today = sofiaDay();
  const from30 = addDays(today, -29);
  const from90 = addDays(today, -89);
  const fromNs = addDays(weekStart(today), -56);
  const thisMonth = monthStart(today);
  const prevMonth = monthStart(addDays(thisMonth, -1));
  const in30 = { gte: from30 };
  const g = prisma.dailyStat;

  const [
    viewsByDay,
    entriesByDay,
    topPages,
    sources,
    events,
    helpful,
    telByPath,
    qrBySource,
    nsRows,
    first,
    adHome,
    adBanner,
  ] = await Promise.all([
    g.groupBy({ by: ["day"], where: { metric: "view", day: in30 }, _sum: { count: true } }),
    g.groupBy({
      by: ["day"],
      where: { metric: "view", day: in30, source: { not: "internal" } },
      _sum: { count: true },
    }),
    g.groupBy({
      by: ["path"],
      where: { metric: "view", day: in30 },
      _sum: { count: true },
      orderBy: { _sum: { count: "desc" } },
      take: 20,
    }),
    g.groupBy({
      by: ["source"],
      where: { metric: "view", day: in30, source: { not: "internal" } },
      _sum: { count: true },
      orderBy: { _sum: { count: "desc" } },
    }),
    g.groupBy({
      by: ["metric"],
      where: { metric: { not: "view" }, day: in30 },
      _sum: { count: true },
    }),
    g.groupBy({
      by: ["path", "metric"],
      where: { metric: { in: ["helpful_yes", "helpful_no"] }, day: { gte: from90 } },
      _sum: { count: true },
    }),
    g.groupBy({
      by: ["path"],
      where: { metric: "tel_click", day: in30 },
      _sum: { count: true },
      orderBy: { _sum: { count: "desc" } },
      take: 20,
    }),
    g.groupBy({
      by: ["source"],
      where: { metric: "qr", day: in30 },
      _sum: { count: true },
      orderBy: { _sum: { count: "desc" } },
    }),
    g.groupBy({
      by: ["day"],
      where: { metric: { in: [...NORTH_STAR_METRICS] }, day: { gte: fromNs } },
      _sum: { count: true },
    }),
    g.aggregate({ _min: { day: true } }),
    g.groupBy({
      by: ["day"],
      where: { metric: "view", path: "/", day: { gte: prevMonth } },
      _sum: { count: true },
    }),
    g.groupBy({
      by: ["day"],
      where: { metric: "banner_click", day: { gte: prevMonth } },
      _sum: { count: true },
    }),
  ]);

  return {
    today,
    from30,
    thisMonth,
    prevMonth,
    viewsByDay,
    entriesByDay,
    topPages,
    sources,
    events,
    helpful,
    telByPath,
    qrBySource,
    nsRows,
    firstDay: first._min.day ?? null,
    adHome,
    adBanner,
  };
}

export default async function StatsPage() {
  await requireAdmin();

  let d: Awaited<ReturnType<typeof load>>;
  try {
    d = await load();
  } catch {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-slate-700">
        Статистиката не може да се зареди в момента (базата не отговаря).
      </div>
    );
  }

  // ── Посещения по ден (последните 30 дни, вкл. дни с нула) ──
  const viewMap = new Map(d.viewsByDay.map((r) => [ymd(r.day), n(r)]));
  const entryMap = new Map(d.entriesByDay.map((r) => [ymd(r.day), n(r)]));
  const days: { day: string; views: number; entries: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const k = ymd(addDays(d.today, -i));
    days.push({ day: k, views: viewMap.get(k) ?? 0, entries: entryMap.get(k) ?? 0 });
  }
  const maxViews = Math.max(0, ...days.map((x) => x.views));
  const totalViews = days.reduce((a, x) => a + x.views, 0);
  const totalEntries = days.reduce((a, x) => a + x.entries, 0);

  // ── Събития ──
  const ev = new Map(d.events.map((r) => [r.metric, n(r)]));
  const evCount = (m: string) => ev.get(m) ?? 0;

  // ── Канали ──
  const channels = new Map<string, number>();
  for (const r of d.sources) {
    const k = channelGroup(r.source);
    channels.set(k, (channels.get(k) ?? 0) + n(r));
  }
  const channelRows = [...channels.entries()].sort((a, b) => b[1] - a[1]);
  const maxChannel = Math.max(0, ...channelRows.map((c) => c[1]));

  // ── North Star ──
  const ns = northStar(
    d.nsRows.map((r) => ({ day: r.day, count: n(r) })),
    d.today,
    d.firstDay,
  );

  // ── „Помогна ли ви“ по страница ──
  const help = new Map<string, { yes: number; no: number }>();
  for (const r of d.helpful) {
    const cur = help.get(r.path) ?? { yes: 0, no: 0 };
    if (r.metric === "helpful_yes") cur.yes += n(r);
    else cur.no += n(r);
    help.set(r.path, cur);
  }
  const helpRows = [...help.entries()]
    .map(([path, v]) => ({ path, ...v, total: v.yes + v.no }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 30);

  // ── Споделяне ──
  const shareClicks = evCount("share_click");
  const shareEntries = d.sources.filter((r) => r.source === "share").reduce((a, r) => a + n(r), 0);

  // ── Търсене ──
  const searches = evCount("search");
  const misses = evCount("search_miss");

  // ── Отчет за рекламодател (само брой) ──
  const inMonth = (rows: { day: Date; _sum: { count: number | null } }[], start: Date, end: Date) =>
    rows
      .filter((r) => r.day.getTime() >= start.getTime() && r.day.getTime() < end.getTime())
      .reduce((a, r) => a + n(r), 0);
  const nextMonth = monthStart(addDays(d.thisMonth, 32));
  const adRows = [
    {
      label: `${MONTHS[d.prevMonth.getUTCMonth()]} ${d.prevMonth.getUTCFullYear()}`,
      home: inMonth(d.adHome, d.prevMonth, d.thisMonth),
      clicks: inMonth(d.adBanner, d.prevMonth, d.thisMonth),
    },
    {
      label: `${MONTHS[d.thisMonth.getUTCMonth()]} ${d.thisMonth.getUTCFullYear()} (досега)`,
      home: inMonth(d.adHome, d.thisMonth, nextMonth),
      clicks: inMonth(d.adBanner, d.thisMonth, nextMonth),
    },
  ];

  const eventOrder = [
    "tel_click",
    "helpful_yes",
    "helpful_no",
    "share_click",
    "install_click",
    "app_open",
    "push_subscribe",
    "push_unsubscribe",
    "viber_click",
    "rss_click",
    "phone_report",
    "banner_click",
    "qr",
    "search",
    "search_miss",
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Статистика</h1>
          <p className="text-slate-600">
            Последните 30 дни (до {d.today.toLocaleDateString("bg-BG", { timeZone: "UTC" })}). Само
            брой на ден — без бисквитки, без IP адреси, без идентификатори на хора. Ботовете и
            предварителното зареждане не се броят.
          </p>
        </div>
        <a
          href="/api/stats/csv"
          className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          Изтегли CSV (само агрегати, 90 дни)
        </a>
      </div>

      <Section
        title="Изпълнени граждански задачи — тази седмица"
        def="North Star (v1): сбор на натиснат телефон + „Помогна ли ви? → Да“ + „Сподели“, понеделник–неделя по българско време. Сравнява се с медианата на предишните до 8 пълни седмици."
      >
        <div className="flex flex-wrap items-end gap-8">
          <div>
            <div className="text-4xl font-bold text-slate-900">{fmt(ns.current)}</div>
            <div className="text-sm text-slate-600">седмицата от {ns.week}</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-800">
              {ns.baseline === null ? "малко данни" : fmt(ns.baseline)}
            </div>
            <div className="text-sm text-slate-600">
              медиана на {ns.weeksOfData} пълни седмици (нужни са поне 4)
            </div>
          </div>
        </div>
        {ns.previous.length > 0 && (
          <table className="mt-4 w-full max-w-md text-sm">
            <caption className="sr-only">Задачи по седмици</caption>
            <tbody className="divide-y divide-slate-100">
              {ns.previous.map((w) => (
                <tr key={w.week}>
                  <td className="py-1 pr-3 text-slate-700">от {w.week}</td>
                  <td className="py-1 text-right font-medium text-slate-900">{fmt(w.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section
        title="Посещения по ден"
        def="Преглед = истинско отваряне на страница (пълно зареждане или навигация в сайта). Вход = преглед, който НЕ идва от друга страница на сайта (т.е. човекът е дошъл отвън, от иконата, QR код, споделена връзка…)."
      >
        <p className="mb-3 text-sm text-slate-700">
          Общо за 30 дни: <strong>{fmt(totalViews)}</strong> прегледа,{" "}
          <strong>{fmt(totalEntries)}</strong> входа.
        </p>
        {totalViews === 0 ? (
          <Empty />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-slate-600">
                <tr>
                  <th className="py-1 pr-3 font-semibold">Ден</th>
                  <th className="py-1 pr-3 text-right font-semibold">Прегледи</th>
                  <th className="py-1 pr-3 text-right font-semibold">Входове</th>
                  <th className="w-1/2 py-1 font-semibold">
                    <span className="sr-only">Лента</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {days.map((x) => (
                  <tr key={x.day}>
                    <td className="py-1 pr-3 text-slate-700">{x.day}</td>
                    <td className="py-1 pr-3 text-right font-medium text-slate-900">{fmt(x.views)}</td>
                    <td className="py-1 pr-3 text-right text-slate-700">{fmt(x.entries)}</td>
                    <td className="py-1">
                      <Bar value={x.views} max={maxViews} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          title="Откъде идват хората"
          def="Входове по канал за 30 дни: маркерът ?s=… в адреса (QR, споделяне, иконата…), иначе домейнът на сайта, от който идват. Само домейнът — никога пълният адрес."
        >
          {channelRows.length === 0 ? (
            <Empty />
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {channelRows.map(([k, v]) => (
                  <tr key={k}>
                    <td className="py-1 pr-3 text-slate-800">{k}</td>
                    <td className="py-1 pr-3 text-right font-medium text-slate-900">{fmt(v)}</td>
                    <td className="py-1 pr-3 text-right text-slate-600">
                      {formatPct(safeRate(v, totalEntries))}
                    </td>
                    <td className="w-1/3 py-1">
                      <Bar value={v} max={maxChannel} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {d.sources.length > 0 && (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer py-2 font-medium text-brand-700">
                Подробно по източник
              </summary>
              <table className="w-full">
                <tbody className="divide-y divide-slate-100">
                  {d.sources.map((r) => (
                    <tr key={r.source}>
                      <td className="py-1 pr-3 text-slate-700">{sourceLabel(r.source)}</td>
                      <td className="py-1 text-right text-slate-900">{fmt(n(r))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </Section>

        <Section
          title="Действия"
          def="Колко пъти за 30 дни е натиснат съответният бутон или се е случило действието. Брои се натискането, не човекът."
        >
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {eventOrder.map((m) => (
                <tr key={m}>
                  <td className="py-1 pr-3 text-slate-800">{EVENT_LABELS[m] ?? m}</td>
                  <td className="py-1 text-right font-medium text-slate-900">{fmt(evCount(m))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          title="Споделяне"
          def={`Коефициент на споделяне = натиснато „Сподели“ ÷ прегледи. Входове от споделяне = прегледи с ?s=share. Процент се показва само при поне ${MIN_N} в знаменателя.`}
        >
          <ul className="space-y-1 text-sm text-slate-800">
            <li>
              Натиснато „Сподели“: <strong>{fmt(shareClicks)}</strong>
            </li>
            <li>
              Коефициент на споделяне: <strong>{formatPct(safeRate(shareClicks, totalViews))}</strong>
            </li>
            <li>
              Входове от споделени връзки: <strong>{fmt(shareEntries)}</strong>
              {shareClicks >= MIN_N && (
                <> ({(shareEntries / shareClicks).toFixed(2).replace(".", ",")} на едно споделяне)</>
              )}
            </li>
          </ul>
        </Section>

        <Section
          title="Търсене"
          def={`Неуспешно търсене = 0 резултата или само слаби съвпадения (думата я няма в заглавие/етикети). Дял = неуспешни ÷ всички търсения (вкл. помощника), само при поне ${MIN_N} търсения.`}
        >
          <ul className="space-y-1 text-sm text-slate-800">
            <li>
              Търсения: <strong>{fmt(searches)}</strong>
            </li>
            <li>
              Неуспешни: <strong>{fmt(misses)}</strong> ({formatPct(safeRate(misses, searches))})
            </li>
          </ul>
          <Link
            href="/admin/search-misses"
            className="mt-3 inline-flex min-h-11 items-center font-medium text-brand-700 hover:underline"
          >
            Към „Търсения без резултат“ →
          </Link>
        </Section>
      </div>

      <Section
        title="Най-посещавани страници"
        def="Прегледи по страница за 30 дни (топ 20). Адресите без познат раздел (грешни адреси, скенери) са събрани в „/other“."
      >
        {d.topPages.length === 0 ? (
          <Empty />
        ) : (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {d.topPages.map((r) => (
                <tr key={r.path}>
                  <td className="break-all py-1 pr-3 text-slate-800">{r.path}</td>
                  <td className="py-1 pr-3 text-right font-medium text-slate-900">{fmt(n(r))}</td>
                  <td className="w-1/3 py-1">
                    <Bar value={n(r)} max={n(d.topPages[0])} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          title="„Помогна ли ви?“ по страница"
          def={`За 90 дни. Полезност = Да ÷ (Да + Не); показва се само при поне ${MIN_N} отговора, иначе „малко данни“.`}
        >
          {helpRows.length === 0 ? (
            <Empty />
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-slate-600">
                <tr>
                  <th className="py-1 pr-3 font-semibold">Страница</th>
                  <th className="py-1 pr-3 text-right font-semibold">Да</th>
                  <th className="py-1 pr-3 text-right font-semibold">Не</th>
                  <th className="py-1 text-right font-semibold">Полезност</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {helpRows.map((r) => (
                  <tr key={r.path}>
                    <td className="break-all py-1 pr-3 text-slate-800">{r.path}</td>
                    <td className="py-1 pr-3 text-right">{fmt(r.yes)}</td>
                    <td className="py-1 pr-3 text-right">{fmt(r.no)}</td>
                    <td className="py-1 text-right font-medium">{formatPct(safeRate(r.yes, r.total))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section
          title="Натиснати телефони по страница"
          def="Колко пъти за 30 дни е натиснат телефонен номер на съответната страница (напр. /uslugi/<услуга>)."
        >
          {d.telByPath.length === 0 ? (
            <Empty />
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {d.telByPath.map((r) => (
                  <tr key={r.path}>
                    <td className="break-all py-1 pr-3 text-slate-800">{r.path}</td>
                    <td className="py-1 text-right font-medium text-slate-900">{fmt(n(r))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          title="QR плакати"
          def="Сканирания на кратък адрес /p/<код> за 30 дни, по код. Брои се сканирането (без ботове и визуализатори на връзки)."
        >
          {d.qrBySource.length === 0 ? (
            <Empty />
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {d.qrBySource.map((r) => (
                  <tr key={r.source}>
                    <td className="py-1 pr-3 text-slate-800">{sourceLabel(r.source)}</td>
                    <td className="py-1 text-right font-medium text-slate-900">{fmt(n(r))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section
          title="Отчет за рекламодател"
          def="Само брой: прегледи на началната страница (където е банерът) и кликове по банера за месеца. Без данни за отделни хора — може да се покаже на рекламодател."
        >
          <table className="w-full text-sm">
            <thead className="text-left text-slate-600">
              <tr>
                <th className="py-1 pr-3 font-semibold">Месец</th>
                <th className="py-1 pr-3 text-right font-semibold">Прегледи на началната</th>
                <th className="py-1 text-right font-semibold">Кликове по банера</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {adRows.map((r) => (
                <tr key={r.label}>
                  <td className="py-1 pr-3 text-slate-800">{r.label}</td>
                  <td className="py-1 pr-3 text-right font-medium">{fmt(r.home)}</td>
                  <td className="py-1 text-right font-medium">{fmt(r.clicks)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </div>

      <p className="text-sm text-slate-600">
        Пълните определения на всяко число са в „docs/tracking-plan.md“. Числата са приблизителни:
        блокирани заявки, кеширани страници и навигация „назад“ не винаги стигат до сървъра.
        Това са описателни числа (какво се случва), не доказателство защо — за „тази промяна помогна“
        е нужен контролиран опит.
      </p>
    </div>
  );
}
