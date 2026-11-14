"use client";

// Справки по Прил. № 29, т. 18 (18.1–18.9): визуализация в таблица и експорт в XLSX/CSV с
// филтри по период, ФУ, работно място и оператор. Достъпни и за одиторския профил (т. 19).

import { useCallback, useEffect, useState } from "react";
import { DownloadSimple, FileXls, CaretLeft, CaretRight, FunnelSimple } from "@phosphor-icons/react";
import { Spinner, EmptyState, apiJson } from "@/components/ui";
import { SUPTO_TABLES } from "@/lib/supto-export";

interface Preview {
  table: { id: string; title: string; headers: string[]; kinds: string[] };
  total: number;
  rows: string[][];
}

const PAGE = 100;
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${new Date().toISOString().slice(0, 7)}-01`;

export function SuptoReports() {
  const [tableId, setTableId] = useState<string>("18.1");
  const [form, setForm] = useState({ from: monthStart(), to: today(), operator: "", device: "", workplace: "" });
  const [applied, setApplied] = useState(form);
  const [page, setPage] = useState(0);
  const [data, setData] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const qs = useCallback(
    (extra: Record<string, string>) => {
      const p = new URLSearchParams({ table: tableId, ...extra });
      if (tableId !== "18.9") {
        p.set("from", applied.from);
        p.set("to", applied.to);
      }
      if (applied.operator) p.set("operator", applied.operator);
      if (applied.device) p.set("device", applied.device);
      if (applied.workplace) p.set("workplace", applied.workplace);
      return p.toString();
    },
    [tableId, applied]
  );

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/export/supto?${qs({ format: "json", take: String(PAGE), skip: String(page * PAGE) })}`, { cache: "no-store" })
      .then((r) => apiJson<Preview>(r))
      .then(setData)
      .catch((e) => {
        setData(null);
        setError(e instanceof Error ? e.message : "Справката не се зареди.");
      })
      .finally(() => setLoading(false));
  }, [qs, page]);

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE)) : 1;
  const current = SUPTO_TABLES.find((t) => t.id === tableId)!;

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Справки по т. 18">
        {SUPTO_TABLES.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={t.id === tableId}
            onClick={() => {
              setTableId(t.id);
              setPage(0);
            }}
            className={`chip shrink-0 ${t.id === tableId ? "chip-active" : ""}`}
            title={t.title}
          >
            <span className="font-bold tabular-nums">{t.id}</span>
            <span className="hidden lg:inline">{t.title}</span>
          </button>
        ))}
      </div>

      <form
        className="card p-4 grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6 items-end"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(0);
          setApplied(form);
        }}
      >
        <label className="block space-y-1">
          <span className="text-xs font-medium text-ink-400">От</span>
          <input type="date" className="input w-full" value={form.from} disabled={tableId === "18.9"} onChange={(e) => setForm({ ...form, from: e.target.value })} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-ink-400">До</span>
          <input type="date" className="input w-full" value={form.to} disabled={tableId === "18.9"} onChange={(e) => setForm({ ...form, to: e.target.value })} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-ink-400">Код на оператор</span>
          <input inputMode="numeric" className="input w-full" placeholder="всички" value={form.operator} onChange={(e) => setForm({ ...form, operator: e.target.value.replace(/\D/g, "").slice(0, 4) })} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-ink-400">ИН на ФУ</span>
          <input className="input w-full" placeholder="всички" value={form.device} onChange={(e) => setForm({ ...form, device: e.target.value.trim() })} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-ink-400">Работно място</span>
          <input className="input w-full" placeholder="всички" value={form.workplace} onChange={(e) => setForm({ ...form, workplace: e.target.value.trim() })} />
        </label>
        <button type="submit" className="btn-primary h-[46px]">
          <FunnelSimple size={18} /> Покажи
        </button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold">
            {current.id} {current.title}
          </h2>
          <p className="text-xs text-ink-400">
            Суми в евро; периодът не може да пресича 01.01.2026 (§ 74 ПЗР на Н-18).
          </p>
        </div>
        <div className="flex gap-2">
          <a className="btn-ghost text-sm" href={`/api/export/supto?${qs({ format: "xlsx" })}`}>
            <FileXls size={18} /> XLSX
          </a>
          <a className="btn-ghost text-sm" href={`/api/export/supto?${qs({ format: "csv" })}`}>
            <DownloadSimple size={18} /> CSV
          </a>
        </div>
      </div>

      {error && <p className="text-coral-600 font-medium">{error}</p>}
      {loading && <Spinner label="Подготвяне на справката…" />}

      {data && !loading && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto max-h-[60vh]">
            <table className="data-table !w-max min-w-full !text-xs">
              <thead>
                <tr>
                  {data.table.headers.map((h, i) => (
                    <th key={h} className={data.table.kinds[i] === "text" ? "" : "!text-right"}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, ri) => (
                  <tr key={ri}>
                    {r.map((v, ci) => (
                      <td key={ci} className={`whitespace-nowrap selectable ${data.table.kinds[ci] === "text" ? "" : "text-right tabular-nums"}`}>
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
                {data.rows.length === 0 && (
                  <tr>
                    <td colSpan={data.table.headers.length}>
                      <EmptyState
                        compact
                        icon={<FunnelSimple size={26} weight="duotone" />}
                        title="Няма данни за избрания период"
                        hint="Проверете периода и филтрите — справката показва само записи в тях."
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-4 py-3 border-t border-ink-800 text-sm text-ink-400">
            <span>
              {data.total} реда, страница {page + 1} от {pages}
            </span>
            <div className="flex gap-2">
              <button className="btn-ghost !py-1.5 !px-3" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="Предишна страница">
                <CaretLeft size={16} />
              </button>
              <button className="btn-ghost !py-1.5 !px-3" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Следваща страница">
                <CaretRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
