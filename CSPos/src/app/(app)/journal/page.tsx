"use client";

// Одиторски дневник (Прил. № 29, т. 15–17): преглед с филтри по период, оператор, вид
// действие и УНП; страниране до всички записи; експорт със същите филтри; проверка на
// хеш веригата. Само четене — достъпен и за одиторския профил (т. 19).

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DownloadSimple,
  ShieldCheck,
  ShieldWarning,
  CaretLeft,
  CaretRight,
  FunnelSimple,
  ArrowCounterClockwise,
} from "@phosphor-icons/react";
import { Spinner, Badge, apiJson } from "@/components/ui";
import { AUDIT_ACTIONS, actionLabel } from "@/lib/audit-actions";

interface Log {
  id: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  detail: string | null;
  unp: string | null;
  hash: string | null;
  createdAt: string;
  user: { name: string; operatorCode: number } | null;
}

type Tone = "neutral" | "success" | "danger" | "warning" | "info";
function toneOf(action: string): Tone {
  if (/FAILED|STORNO$|ANNULLED/.test(action)) return "danger";
  if (/^SALE_COMPLETED|DELIVERY|CREDIT_SETTLED/.test(action)) return "success";
  if (/PRICE|SETTINGS|CASH_|WRITEOFF|SUPTO|HELD/.test(action)) return "warning";
  if (/LOGIN|LOGOUT|SHIFT|USER|REPORT|EXPORT/.test(action)) return "info";
  return "neutral";
}

const PAGE = 100;
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${new Date().toISOString().slice(0, 7)}-01`;

interface Filters {
  from: string;
  to: string;
  operator: string;
  action: string;
  unp: string;
}

function query(f: Filters, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams();
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", f.to);
  if (f.operator.trim()) p.set("operator", f.operator.trim());
  if (f.action) p.set("action", f.action);
  if (f.unp.trim()) p.set("unp", f.unp.trim());
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  return p.toString();
}

function Detail({ raw }: { raw: string | null }) {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return <span>{raw}</span>;
  }
  if (!parsed || typeof parsed !== "object") return <span>{String(parsed)}</span>;
  const entries = Object.entries(parsed as Record<string, unknown>).filter(([, v]) => v !== null && v !== undefined);
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-0.5">
      {entries.map(([k, v]) => (
        <span key={k}>
          <span className="text-ink-500">{k}:</span>{" "}
          <span className="text-ink-300">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
        </span>
      ))}
    </span>
  );
}

export default function JournalPage() {
  const [draft, setDraft] = useState<Filters>({ from: monthStart(), to: today(), operator: "", action: "", unp: "" });
  const [filters, setFilters] = useState<Filters>(draft);
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ logs: Log[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chain, setChain] = useState<
    { ok: boolean; checked: number; brokenAt?: string; legacy?: number; at: string } | "checking" | null
  >(null);

  useEffect(() => {
    setData(null);
    setError(null);
    fetch(`/api/audit?${query(filters, { take: String(PAGE), skip: String(page * PAGE) })}`, { cache: "no-store" })
      .then((r) => apiJson<{ logs: Log[]; total: number }>(r))
      .then(setData)
      .catch((e) => setError(e.message));
  }, [filters, page]);

  const verify = useCallback(async () => {
    setChain("checking");
    try {
      const r = await apiJson<{ result: { ok: boolean; checked: number; brokenAt?: string; legacy?: number }; checkedAt: string }>(
        await fetch("/api/audit/verify", { cache: "no-store" })
      );
      setChain({ ...r.result, at: r.checkedAt });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Проверката не успя.");
      setChain(null);
    }
  }, []);

  useEffect(() => {
    void verify();
  }, [verify]);

  const actions = useMemo(() => Object.entries(AUDIT_ACTIONS).sort((a, b) => a[1].localeCompare(b[1], "bg")), []);
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE)) : 1;

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black">Одиторски дневник</h1>
          <p className="text-ink-400 text-sm mt-1 max-w-3xl">
            Всяко действие с оператор, дата и час, а при сторно и анулиране — и с УНП. Записите не
            могат да се променят или изтриват; веригата от хешове показва, ако някой опита.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {chain === "checking" && <Badge tone="neutral">Проверка на целостта…</Badge>}
          {chain && chain !== "checking" && (
            <span
              className={`chip !py-1.5 !px-3 text-xs font-semibold pointer-events-none ${chain.ok ? "!text-mint-600" : "!text-coral-600"}`}
              title={`Проверено на ${new Date(chain.at).toLocaleString("bg-BG")}`}
            >
              {chain.ok ? <ShieldCheck size={16} weight="duotone" /> : <ShieldWarning size={16} weight="duotone" />}
              {chain.ok
                ? `Целостта е потвърдена: ${chain.checked} записа`
                : `Нарушена цялост при запис ${chain.brokenAt}`}
              {chain.legacy ? `, ${chain.legacy} отпреди веригата` : ""}
            </span>
          )}
          <button className="btn-ghost !py-1.5 !px-3 text-xs" onClick={() => void verify()}>
            <ArrowCounterClockwise size={14} /> Провери
          </button>
        </div>
      </div>

      <form
        className="card p-4 grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6 items-end"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(0);
          setFilters(draft);
        }}
      >
        <label className="block space-y-1">
          <span className="text-xs font-medium text-ink-400">От</span>
          <input type="date" className="input w-full" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-ink-400">До</span>
          <input type="date" className="input w-full" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-ink-400">Код на оператор</span>
          <input
            inputMode="numeric"
            className="input w-full"
            placeholder="всички"
            value={draft.operator}
            onChange={(e) => setDraft({ ...draft, operator: e.target.value.replace(/\D/g, "").slice(0, 4) })}
          />
        </label>
        <label className="block space-y-1 col-span-2 md:col-span-1">
          <span className="text-xs font-medium text-ink-400">Вид действие</span>
          <select className="input w-full" value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value })}>
            <option value="">Всички</option>
            {actions.map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-ink-400">УНП</span>
          <input className="input w-full" placeholder="част от номера" value={draft.unp} onChange={(e) => setDraft({ ...draft, unp: e.target.value })} />
        </label>
        <div className="flex gap-2">
          <button type="submit" className="btn-primary flex-1 h-[46px]">
            <FunnelSimple size={18} /> Филтрирай
          </button>
          <a className="btn-ghost h-[46px] !px-3" href={`/api/audit/export?${query(filters)}`} title="Експорт в CSV със същите филтри">
            <DownloadSimple size={18} />
          </a>
        </div>
      </form>

      {error && <p className="text-coral-600">{error}</p>}
      {!data && !error && <Spinner label="Зареждане на дневника…" />}

      {data && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-ink-400 text-left border-b border-ink-800">
                  <th className="py-3 px-4 font-medium w-44">Дата и час</th>
                  <th className="py-3 px-2 font-medium w-48">Оператор</th>
                  <th className="py-3 px-2 font-medium w-56">Действие</th>
                  <th className="py-3 px-2 font-medium w-56">УНП</th>
                  <th className="py-3 px-4 font-medium">Подробности</th>
                </tr>
              </thead>
              <tbody>
                {data.logs.map((l) => (
                  <tr key={l.id} className="border-b border-ink-800/60 last:border-0 align-top">
                    <td className="py-2.5 px-4 text-ink-400 tabular-nums whitespace-nowrap selectable">
                      {new Date(l.createdAt).toLocaleDateString("bg-BG", { day: "2-digit", month: "2-digit", year: "numeric" })}
                      <span className="block text-xs">{new Date(l.createdAt).toLocaleTimeString("bg-BG")}</span>
                    </td>
                    <td className="py-2.5 px-2">
                      {l.user ? (
                        <>
                          {l.user.name}
                          <span className="text-ink-500"> код {String(l.user.operatorCode).padStart(4, "0")}</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2.5 px-2">
                      <Badge tone={toneOf(l.action)}>{actionLabel(l.action)}</Badge>
                    </td>
                    <td className="py-2.5 px-2 tabular-nums text-xs text-ink-300 selectable">{l.unp ?? ""}</td>
                    <td className="py-2.5 px-4 text-xs break-all selectable">
                      <Detail raw={l.detail} />
                    </td>
                  </tr>
                ))}
                {data.logs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-ink-500">
                      Няма записи по тези филтри. Разширете периода или изчистете вида действие.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-4 py-3 border-t border-ink-800 text-sm text-ink-400">
            <span>
              {data.total} записа, страница {page + 1} от {pages}
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
