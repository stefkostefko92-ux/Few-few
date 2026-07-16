import type { Metadata } from "next";
import Link from "next/link";
import { PageHero, Section, StatCard } from "@/components/ui";
import { JsonLd } from "@/components/JsonLd";
import { buildMetadata, breadcrumbLd } from "@/lib/seo";
import { Banknote, ArrowInflow, ArrowOutflow, Building, Info } from "@/components/icons";
import {
  NATIONAL,
  COUNT_BY_MINISTRY,
  COUNT_BY_FORM,
  EMPLOYEES_BY_SECTOR,
  HIGHLIGHTS,
  METHODOLOGY_POINTS,
  APPK_REPORT_2024,
} from "@/data/national";

export const metadata: Metadata = buildMetadata({
  title: "Картината на сектора",
  description:
    "Обобщена национална картина на държавните предприятия в България: колко са, общи приходи и разходи, печалба/загуба, задължения, заети, дивиденти към бюджета — по данни на АППК.",
  path: "/kartina",
});

function bln(mln: number): string {
  return (mln / 1000).toLocaleString("bg-BG", { maximumFractionDigits: 1 });
}

export default function NationalPage() {
  const y = NATIONAL.year;
  return (
    <>
      <JsonLd
        data={breadcrumbLd([
          { name: "Начало", path: "/" },
          { name: "Картината на сектора", path: "/kartina" },
        ])}
      />
      <PageHero
        eyebrow={`Обобщени данни · ${y}`}
        title="Картината на целия сектор"
        intro="Държавните предприятия, погледнати наведнъж: колко са, колко пари влизат и излизат и какво остава за държавата. Всички числа са от Годишния обобщен доклад на АППК."
        crumbs={[{ name: "Картината на сектора", path: "/kartina" }]}
      />

      <div className="container-content space-y-14 py-10">
        <Section>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard value={NATIONAL.totalEnterprises} label="публични предприятия в портфейла" icon={<Building className="h-7 w-7" aria-hidden />} />
            <StatCard value={`${bln(NATIONAL.revenueMln[y])} млрд. лв.`} label={`общи приходи (${y})`} icon={<ArrowInflow className="h-7 w-7" aria-hidden />} />
            <StatCard value={`${bln(NATIONAL.netResultMln[y])} млрд. лв.`} label={`нетна печалба (${y})`} icon={<Banknote className="h-7 w-7" aria-hidden />} />
            <StatCard value={`${NATIONAL.dividendToStateMln.toLocaleString("bg-BG")} млн. лв.`} label="дивидент за държавата" icon={<ArrowOutflow className="h-7 w-7" aria-hidden />} />
          </div>
          <p className="mt-4 text-sm text-slate-500">
            Заети: около {NATIONAL.employees.toLocaleString("bg-BG")} души ({NATIONAL.employeesShareText}). „Големи“ предприятия по Закона за счетоводството: {NATIONAL.largeEnterprises}.
          </p>
        </Section>

        {/* Приходи/разходи по години */}
        <Section title="Пари навътре и навън по години" icon={<ArrowInflow className="h-6 w-6 text-brand-700" aria-hidden />}>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3">Показател (млрд. лв.)</th>
                  <th className="px-4 py-3 text-right">2022</th>
                  <th className="px-4 py-3 text-right">2023</th>
                  <th className="px-4 py-3 text-right">2024</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[
                  { label: "Общи приходи", row: NATIONAL.revenueMln, tone: "text-inflow-700" },
                  { label: "Общи разходи", row: NATIONAL.expenseMln, tone: "text-outflow-700" },
                  { label: "Нетен резултат (печалба)", row: NATIONAL.netResultMln, tone: "text-slate-900" },
                  { label: "Задължения (пасиви)", row: NATIONAL.liabilitiesMln, tone: "text-slate-900" },
                ].map((r) => (
                  <tr key={r.label}>
                    <td className={`px-4 py-3 font-medium ${r.tone}`}>{r.label}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{bln(r.row["2022"])}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{bln(r.row["2023"])}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">{bln(r.row["2024"])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-slate-500">
            Забележете разминаването: приходите намаляват, но <strong>задълженията растат</strong> (от 24,2 на 27,1 млрд. лв. за три години).
          </p>
        </Section>

        {/* Разпределения */}
        <div className="grid gap-8 lg:grid-cols-2">
          <Section title="По министерство-принципал (брой)">
            <ul className="space-y-2">
              {COUNT_BY_MINISTRY.map((m) => (
                <li key={m.name} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 text-sm text-slate-700">{m.name}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <span
                      className="block h-full rounded-full bg-brand-500"
                      style={{ width: `${(m.count / COUNT_BY_MINISTRY[0].count) * 100}%` }}
                    />
                  </span>
                  <span className="w-8 text-right text-sm font-semibold text-slate-900">{m.count}</span>
                </li>
              ))}
            </ul>
          </Section>
          <Section title="По правна форма (брой)">
            <ul className="space-y-2">
              {COUNT_BY_FORM.map((f) => (
                <li key={f.name} className="flex items-center gap-3">
                  <span className="w-52 shrink-0 text-sm text-slate-700">{f.name}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <span
                      className="block h-full rounded-full bg-brand-400"
                      style={{ width: `${(f.count / COUNT_BY_FORM[0].count) * 100}%` }}
                    />
                  </span>
                  <span className="w-8 text-right text-sm font-semibold text-slate-900">{f.count}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-slate-500">
              Заетите се концентрират в:{" "}
              {EMPLOYEES_BY_SECTOR.map((e) => `${e.name} (${e.share})`).join(", ")}.
            </p>
          </Section>
        </div>

        {/* Крайности */}
        <Section title="Крайностите: печели държавата, губят няколко гиганта">
          <div className="grid gap-4 md:grid-cols-2">
            <HighlightCard title="Най-големи дивиденти за държавата" tone="inflow" items={HIGHLIGHTS.biggestDividends} />
            <HighlightCard title="Най-големи загуби" tone="outflow" items={HIGHLIGHTS.biggestLosses} />
            <HighlightCard title="Най-големи субсидии от бюджета" tone="outflow" items={HIGHLIGHTS.biggestSubsidies} />
            <HighlightCard title="Най-големи работодатели" tone="brand" items={HIGHLIGHTS.topEmployers} />
          </div>
        </Section>

        {/* Методология */}
        <Section title="Как се дефинира „публично предприятие“" icon={<Info className="h-6 w-6 text-brand-700" aria-hidden />}>
          <ul className="list-disc space-y-2 pl-6 text-slate-600">
            {METHODOLOGY_POINTS.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
          <a href={APPK_REPORT_2024.url} target="_blank" rel="noopener noreferrer" className="btn-primary mt-5">
            Виж доклада на АППК
          </a>
        </Section>

        <p className="text-sm text-slate-500">
          Разгледай отделните предприятия зад тези числа в{" "}
          <Link href="/predpriyatiya" className="font-medium text-brand-700 hover:underline">
            каталога
          </Link>
          , виж кой печели поръчките в{" "}
          <Link href="/koncentraciya" className="font-medium text-brand-700 hover:underline">
            концентрацията
          </Link>
          , или класацията по{" "}
          <Link href="/prozrachnost-indeks" className="font-medium text-brand-700 hover:underline">
            индекс на прозрачност
          </Link>
          .
        </p>
      </div>
    </>
  );
}

function HighlightCard({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "inflow" | "outflow" | "brand";
  items: readonly { name: string; value: string }[];
}) {
  const border =
    tone === "inflow" ? "border-inflow-200" : tone === "outflow" ? "border-outflow-200" : "border-brand-200";
  return (
    <div className={`rounded-xl border ${border} bg-white p-5 shadow-sm`}>
      <h3 className="font-bold text-slate-900">{title}</h3>
      <ul className="mt-3 space-y-2">
        {items.map((it) => (
          <li key={it.name} className="flex items-start justify-between gap-3 text-sm">
            <span className="text-slate-700">{it.name}</span>
            <span className="shrink-0 font-semibold text-slate-900">{it.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
