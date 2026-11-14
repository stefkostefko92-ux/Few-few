"use client";

// Справки: (1) по Прил. № 29, т. 18 — деветте таблици за НАП с филтри и експорт;
// (2) оборотни — обороти по дни, ДДС по групи, топ стоки, касиери.

import { useCallback, useEffect, useState } from "react";
import { CalendarBlank } from "@phosphor-icons/react";
import { Spinner, apiJson } from "@/components/ui";
import { ColumnChart, euroAxis, type ColumnDatum } from "@/components/charts";
import { SuptoReports } from "@/components/supto-reports";
import { formatEur } from "@/lib/money";
import { VAT_GROUPS } from "@/lib/constants";

interface Report {
  totals: {
    revenueCents: number;
    stornoCents: number;
    cashCents: number;
    cardCents: number;
    salesCount: number;
    stornoCount: number;
    discountCents: number;
    creditCents: number;
  };
  byDay: Array<{ day: string; totalCents: number; count: number; stornoCents: number }>;
  vat: Array<{ group: string; letter: string; grossCents: number; vatCents: number }>;
  topProducts: Array<{ name: string; qtyMilli: number; totalCents: number }>;
  byCashier: Array<{ name: string; totalCents: number; count: number }>;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysSpan(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

/** Всеки ден от периода (и дните без продажби — иначе празнините изчезват); над 62 дни — по месеци. */
function turnoverSeries(byDay: Report["byDay"], from: string, to: string): ColumnDatum[] {
  const map = new Map(byDay.map((d) => [d.day, d]));
  const days: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`) && days.length < 3700; t += 86_400_000) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  const bounce = (n: number) => `${n} ${n === 1 ? "бон" : "бона"}`;
  if (days.length <= 62) {
    return days.map((day) => {
      const d = map.get(day);
      const [y, m, dd] = day.split("-");
      return {
        key: day,
        label: `${dd}.${m}.${y}`,
        short: `${dd}.${m}`,
        value: d?.totalCents ?? 0,
        detail: d ? bounce(d.count) : "без продажби",
      };
    });
  }
  const months = new Map<string, { value: number; count: number }>();
  for (const day of days) {
    const k = day.slice(0, 7);
    const acc = months.get(k) ?? { value: 0, count: 0 };
    const d = map.get(day);
    acc.value += d?.totalCents ?? 0;
    acc.count += d?.count ?? 0;
    months.set(k, acc);
  }
  return [...months.entries()].map(([k, v]) => {
    const [y, m] = k.split("-");
    return { key: k, label: `${m}.${y}`, short: `${m}.${y?.slice(2)}`, value: v.value, detail: bounce(v.count) };
  });
}

export default function ReportsPage() {
  const [tab, setTab] = useState<"supto" | "turnover">("supto");
  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <h1 className="text-2xl font-black">Справки</h1>
        <div className="flex gap-2" role="tablist" aria-label="Вид справки">
          <button role="tab" aria-selected={tab === "supto"} className={`chip ${tab === "supto" ? "chip-active" : ""}`} onClick={() => setTab("supto")}>
            По Прил. № 29 (НАП)
          </button>
          <button role="tab" aria-selected={tab === "turnover"} className={`chip ${tab === "turnover" ? "chip-active" : ""}`} onClick={() => setTab("turnover")}>
            Оборот и анализ
          </button>
        </div>
      </div>
      {tab === "supto" ? <SuptoReports /> : <TurnoverReports />}
    </div>
  );
}

function TurnoverReports() {
  const today = iso(new Date());
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (f: string, t: string) => {
    setLoading(true);
    setError(null);
    try {
      setReport(await apiJson<Report>(await fetch(`/api/reports?from=${f}&to=${t}`)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Грешка.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(today, today);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function quick(days: number) {
    const t = new Date();
    const f = new Date();
    f.setDate(f.getDate() - days + 1);
    setFrom(iso(f));
    setTo(iso(t));
    void load(iso(f), iso(t));
  }


  return (
    <div className="space-y-6">
      {/* Филтри — един ред над графиките */}
      <div className="card p-4 flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="text-xs text-ink-400 font-medium flex items-center gap-1">
            <CalendarBlank size={14} /> От
          </span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input" />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-ink-400 font-medium">До</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input" />
        </label>
        <button onClick={() => load(from, to)} className="btn-primary h-11">
          Покажи
        </button>
        <div className="flex gap-2 ml-auto">
          {[
            ["Днес", 1],
            ["7 дни", 7],
            ["30 дни", 30],
          ].map(([label, days]) => (
            <button key={label} onClick={() => quick(days as number)} className="btn-ghost text-sm">
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-coral-600">{error}</p>}
      {loading && <Spinner label="Изчисляване…" />}

      {report && !loading && (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="card p-5">
              <div className="text-sm text-ink-400 font-medium">Оборот</div>
              <div className="text-2xl font-black mt-1 tabular-nums gradient-num">{formatEur(report.totals.revenueCents)}</div>
            </div>
            <div className="card p-5">
              <div className="text-sm text-ink-400 font-medium">Бонове</div>
              <div className="text-2xl font-black mt-1 tabular-nums">{report.totals.salesCount}</div>
              <div className="text-xs text-ink-400 mt-0.5 tabular-nums">сторно {report.totals.stornoCount}</div>
            </div>
            <div className="card p-5">
              <div className="text-sm text-ink-400 font-medium">Плащания</div>
              <dl className="mt-1.5 space-y-0.5 text-sm">
                {(
                  [
                    ["В брой", report.totals.cashCents],
                    ["С карта", report.totals.cardCents],
                    ["На вересия", report.totals.creditCents],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-3">
                    <dt className="text-ink-400">{k}</dt>
                    <dd className="font-bold tabular-nums text-ink-100">{formatEur(v)}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="card p-5">
              <div className="text-sm text-ink-400 font-medium">Отстъпки</div>
              <div className="text-2xl font-black mt-1 tabular-nums">{formatEur(report.totals.discountCents)}</div>
            </div>
          </div>

          <ColumnChart
            title={daysSpan(from, to) > 62 ? "Оборот по месеци" : "Оборот по дни"}
            description="Приключени продажби за периода; сторното е отделно в таблицата"
            data={turnoverSeries(report.byDay, from, to)}
            formatValue={formatEur}
            formatAxis={euroAxis}
            emptyText="Няма продажби в периода."
          />

          <div className="grid lg:grid-cols-2 gap-5">
            <section className="card p-5">
              <h2 className="font-bold mb-4">ДДС по данъчни групи (нето, след сторно)</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-ink-400 text-left border-b border-ink-800">
                    <th className="py-2 font-medium">Група</th>
                    <th className="py-2 font-medium text-right">Оборот</th>
                    <th className="py-2 font-medium text-right">ДДС (вкл.)</th>
                  </tr>
                </thead>
                <tbody>
                  {report.vat.map((v) => (
                    <tr key={v.group} className="border-b border-ink-800/60 last:border-0">
                      <td className="py-2.5 font-semibold">
                        {v.letter} — {VAT_GROUPS[v.group as keyof typeof VAT_GROUPS]?.label}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">{formatEur(v.grossCents)}</td>
                      <td className="py-2.5 text-right tabular-nums font-bold">
                        {formatEur(v.vatCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="card p-5">
              <h2 className="font-bold mb-4">По касиери</h2>
              <table className="w-full text-sm">
                <tbody>
                  {report.byCashier.map((c) => (
                    <tr key={c.name} className="border-b border-ink-800/60 last:border-0">
                      <td className="py-2.5 font-medium">{c.name}</td>
                      <td className="py-2.5 text-right text-ink-400 tabular-nums">{c.count} бона</td>
                      <td className="py-2.5 text-right font-bold tabular-nums">
                        {formatEur(c.totalCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>

          <section className="card p-5">
            <h2 className="font-bold mb-4">Топ 20 стоки за периода</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-ink-400 text-left border-b border-ink-800">
                  <th className="py-2 font-medium w-8">№</th>
                  <th className="py-2 font-medium">Стока</th>
                  <th className="py-2 font-medium text-right">Количество</th>
                  <th className="py-2 font-medium text-right">Оборот</th>
                </tr>
              </thead>
              <tbody>
                {report.topProducts.map((p, i) => (
                  <tr key={i} className="border-b border-ink-800/60 last:border-0">
                    <td className="py-2 text-ink-500">{i + 1}.</td>
                    <td className="py-2 font-medium">{p.name}</td>
                    <td className="py-2 text-right tabular-nums">
                      {(p.qtyMilli / 1000).toFixed(p.qtyMilli % 1000 === 0 ? 0 : 3)}
                    </td>
                    <td className="py-2 text-right font-bold tabular-nums">
                      {formatEur(p.totalCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
