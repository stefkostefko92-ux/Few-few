"use client";

// Отчети за период: обороти по дни (барове с директни етикети + табличен
// характер), ДДС по групи, топ стоки, касиери, експорт CSV за НАП.

import { useCallback, useEffect, useState } from "react";
import { DownloadSimple, CalendarBlank } from "@phosphor-icons/react";
import { Spinner, apiJson } from "@/components/ui";
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

export default function ReportsPage() {
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

  const maxDay = Math.max(1, ...(report?.byDay.map((d) => d.totalCents) ?? [1]));

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <h1 className="text-2xl font-black">Отчети</h1>
        <a
          href={`/api/export/nap?from=${from}&to=${to}`}
          className="btn-ghost text-sm"
          download
        >
          <DownloadSimple size={18} /> Експорт CSV (НАП одит)
        </a>
      </div>

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
            {[
              ["Оборот", formatEur(report.totals.revenueCents)],
              ["Бонове", `${report.totals.salesCount} (сторно ${report.totals.stornoCount})`],
              [
                "Брой / карта / вересия",
                `${formatEur(report.totals.cashCents)} / ${formatEur(report.totals.cardCents)} / ${formatEur(report.totals.creditCents)}`,
              ],
              ["Отстъпки", formatEur(report.totals.discountCents)],
            ].map(([label, value]) => (
              <div key={label} className="card p-5">
                <div className="text-sm text-ink-400 font-medium">{label}</div>
                <div className={`text-xl font-black mt-1 tabular-nums ${label === "Оборот" ? "gradient-num" : ""}`}>
                  {value}
                </div>
              </div>
            ))}
          </div>

          {/* Оборот по дни — хоризонтални барове, една серия (един цвят), директни етикети */}
          <section className="card p-5">
            <h2 className="font-bold mb-4">Оборот по дни</h2>
            {report.byDay.length === 0 && (
              <p className="text-ink-500 text-sm">Няма продажби в периода.</p>
            )}
            <div className="space-y-2">
              {report.byDay.map((d) => (
                <div key={d.day} className="flex items-center gap-3 text-sm">
                  <span className="w-24 shrink-0 text-ink-400 tabular-nums">
                    {new Date(d.day).toLocaleDateString("bg-BG", { day: "2-digit", month: "2-digit" })}
                  </span>
                  <div className="flex-1 h-6 bg-ink-850 rounded-md overflow-hidden relative">
                    <div
                      className="h-full bg-brand-600/90 rounded-r-md"
                      style={{ width: `${Math.max(2, (d.totalCents / maxDay) * 100)}%` }}
                      title={`${d.day}: ${formatEur(d.totalCents)} от ${d.count} бона`}
                    />
                  </div>
                  <span className="w-24 text-right font-bold tabular-nums">
                    {formatEur(d.totalCents)}
                  </span>
                  <span className="w-16 text-right text-ink-500 tabular-nums">{d.count} б.</span>
                </div>
              ))}
            </div>
          </section>

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
