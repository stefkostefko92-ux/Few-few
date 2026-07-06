"use client";

// Табло на управителя: днешният ден с един поглед.

import { useEffect, useState } from "react";
import Link from "next/link";
import { TrendUp, Money, CreditCard, Receipt, Warning, Clock, ArrowRight, CheckCircle } from "@phosphor-icons/react";
import { Spinner, Badge, apiJson } from "@/components/ui";
import { formatEur, formatQty } from "@/lib/money";
import { UNITS } from "@/lib/constants";

interface Report {
  totals: {
    revenueCents: number;
    stornoCents: number;
    cashCents: number;
    cardCents: number;
    salesCount: number;
    stornoCount: number;
  };
  topProducts: Array<{ name: string; qtyMilli: number; totalCents: number }>;
  lowStock: Array<{
    id: string;
    plu: number;
    name: string;
    unit: "PCS" | "KG";
    stockMilli: number;
    minStockMilli: number;
  }>;
  byCashier: Array<{ name: string; totalCents: number; count: number }>;
}

function Tile({
  label,
  value,
  sub,
  icon,
  accent = false,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="card p-5 flex items-start justify-between">
      <div>
        <div className="text-sm text-ink-400 font-medium">{label}</div>
        <div className={`text-2xl font-black mt-1 tabular-nums ${accent ? "gradient-num" : ""}`}>
          {value}
        </div>
        {sub && <div className="text-xs text-ink-500 mt-0.5">{sub}</div>}
      </div>
      <div className="text-brand-700">{icon}</div>
    </div>
  );
}

interface ExpirySummary {
  batches: Array<{
    id: string;
    name: string;
    daysLeft: number;
    expired: boolean;
    expiryDate: string;
    qtyMilli: number;
    unit: "PCS" | "KG";
  }>;
  expiredCount: number;
  soonCount: number;
}

export default function DashboardPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [expiry, setExpiry] = useState<ExpirySummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = () => {
      const today = new Date().toISOString().slice(0, 10);
      fetch(`/api/reports?from=${today}&to=${today}`)
        .then((r) => apiJson<Report>(r))
        .then(setReport)
        .catch((e) => setError(e.message));
      fetch(`/api/expiry?days=7`)
        .then((r) => apiJson<ExpirySummary>(r))
        .then(setExpiry)
        .catch(() => setExpiry(null));
    };
    load();
    // живо табло — авто-опресняване
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  if (error) return <p className="text-coral-600">{error}</p>;
  if (!report) return <Spinner label="Зареждане на таблото…" />;

  const t = report.totals;

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black flex items-center gap-2.5">
          Табло — днес
          <span className="inline-flex items-center gap-1 text-xs font-medium text-mint-600">
            <span className="size-2 rounded-full bg-mint-500 animate-pulse" /> живо
          </span>
        </h1>
        <Link href="/reports" className="btn-ghost text-sm inline-flex items-center gap-1.5">
          Пълни отчети <ArrowRight size={15} weight="bold" />
        </Link>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <Tile
          label="Оборот"
          value={formatEur(t.revenueCents)}
          sub={t.stornoCents > 0 ? `сторно ${formatEur(t.stornoCents)}` : undefined}
          icon={<TrendUp size={28} weight="duotone" />}
          accent
        />
        <Tile
          label="Продажби"
          value={String(t.salesCount)}
          sub={t.stornoCount > 0 ? `${t.stornoCount} сторно` : "без сторно"}
          icon={<Receipt size={28} weight="duotone" />}
        />
        <Tile label="В брой" value={formatEur(t.cashCents)} icon={<Money size={28} weight="duotone" />} />
        <Tile label="С карта" value={formatEur(t.cardCents)} icon={<CreditCard size={28} weight="duotone" />} />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <section className="card p-5">
          <h2 className="font-bold mb-4">Топ стоки днес</h2>
          {report.topProducts.length === 0 && (
            <p className="text-ink-500 text-sm">Още няма продажби днес.</p>
          )}
          <table className="w-full text-sm">
            <tbody>
              {report.topProducts.slice(0, 8).map((p, i) => (
                <tr key={i} className="border-b border-ink-800/60 last:border-0">
                  <td className="py-2 pr-2 text-ink-500 w-6">{i + 1}.</td>
                  <td className="py-2 font-medium">{p.name}</td>
                  <td className="py-2 text-right text-ink-400 tabular-nums">
                    {(p.qtyMilli / 1000).toFixed(p.qtyMilli % 1000 === 0 ? 0 : 3)}
                  </td>
                  <td className="py-2 text-right font-bold tabular-nums w-24">
                    {formatEur(p.totalCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card p-5">
          <h2 className="font-bold mb-4 flex items-center gap-2">
            <Warning size={20} className="text-brand-700" />
            Изчерпващи се наличности
          </h2>
          {report.lowStock.length === 0 && (
            <p className="text-ink-500 text-sm inline-flex items-center gap-1.5">
              <CheckCircle size={16} weight="fill" className="text-mint-600" /> Всичко е заредено.
            </p>
          )}
          <table className="w-full text-sm">
            <tbody>
              {report.lowStock.slice(0, 8).map((p) => (
                <tr key={p.id} className="border-b border-ink-800/60 last:border-0">
                  <td className="py-2 text-ink-500 w-14">PLU {p.plu}</td>
                  <td className="py-2 font-medium">{p.name}</td>
                  <td className="py-2 text-right tabular-nums">
                    <Badge tone={p.stockMilli <= 0 ? "danger" : "warning"}>
                      {formatQty(p.stockMilli, UNITS[p.unit].decimals)} {UNITS[p.unit].label}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      {expiry && expiry.batches.length > 0 && (
        <section className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold flex items-center gap-2">
              <Clock size={20} className="text-coral-600" weight="duotone" />
              Изтичащ срок на годност (7 дни)
            </h2>
            <Link href="/inventory" className="text-brand-700 text-sm hover:text-brand-600 inline-flex items-center gap-1.5">
              Виж всички <ArrowRight size={15} weight="bold" />
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {expiry.batches.slice(0, 6).map((b) => (
              <div key={b.id} className="bg-ink-850 rounded-xl px-4 py-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{b.name}</div>
                  <div className="text-ink-400 text-xs">
                    {formatQty(b.qtyMilli, UNITS[b.unit].decimals)} {UNITS[b.unit].label} ·{" "}
                    {new Date(b.expiryDate).toLocaleDateString("bg-BG")}
                  </div>
                </div>
                <Badge tone={b.expired ? "danger" : "warning"}>
                  {b.expired ? "изтекъл" : `${b.daysLeft} дни`}
                </Badge>
              </div>
            ))}
          </div>
        </section>
      )}

      {report.byCashier.length > 0 && (
        <section className="card p-5">
          <h2 className="font-bold mb-4">По касиери</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {report.byCashier.map((c) => (
              <div key={c.name} className="bg-ink-850 rounded-xl px-4 py-3">
                <div className="font-semibold">{c.name}</div>
                <div className="text-ink-400 text-sm">
                  {c.count} бона · <b className="text-ink-100">{formatEur(c.totalCents)}</b>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
