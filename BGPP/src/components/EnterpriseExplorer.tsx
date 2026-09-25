"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Enterprise } from "@/data/types";
import { SECTORS } from "@/data/sectors";
import { PRINCIPALS } from "@/data/principals";
import { casesForSlug } from "@/data/cases";
import { Badge } from "./ui";
import { Search, ArrowInflow, ArrowOutflow } from "./icons";

// Карта на предприятие в списъка.
function Card({ e }: { e: Enterprise }) {
  const sectorName = SECTORS.find((s) => s.key === e.sector)?.short ?? e.sector;
  return (
    <Link
      href={`/predpriyatiya/${e.slug}`}
      className="group flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="brand">{sectorName}</Badge>
        <Badge>{e.legalForm}</Badge>
        {e.stateShare === 100 && <Badge>100% държавно</Badge>}
        {casesForSlug(e.slug).length > 0 && (
          <span className="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800">
            ⚑ {casesForSlug(e.slug).length} случая
          </span>
        )}
      </div>
      <h3 className="mt-3 text-lg font-bold text-slate-900 group-hover:text-brand-700">
        {e.shortName ?? e.name}
      </h3>
      <p className="mt-1 line-clamp-3 text-sm text-slate-600">{e.activity}</p>
      <div className="mt-4 flex items-center gap-4 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1">
          <ArrowInflow className="h-3.5 w-3.5 text-inflow-600" aria-hidden />
          {e.moneyIn.length} източника приход
        </span>
        <span className="inline-flex items-center gap-1">
          <ArrowOutflow className="h-3.5 w-3.5 text-outflow-600" aria-hidden />
          {e.moneyOut.length} пера разход
        </span>
      </div>
    </Link>
  );
}

export function EnterpriseExplorer({
  enterprises,
  initialSector = "",
  initialPrincipal = "",
}: {
  enterprises: Enterprise[];
  initialSector?: string;
  initialPrincipal?: string;
}) {
  const [q, setQ] = useState("");
  const [sector, setSector] = useState<string>(initialSector);
  const [principal, setPrincipal] = useState<string>(initialPrincipal);
  const [onlyCases, setOnlyCases] = useState(false);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return enterprises.filter((e) => {
      if (sector && e.sector !== sector) return false;
      if (principal && e.principal !== principal) return false;
      if (onlyCases && casesForSlug(e.slug).length === 0) return false;
      if (!needle) return true;
      return (
        e.name.toLowerCase().includes(needle) ||
        (e.shortName?.toLowerCase().includes(needle) ?? false) ||
        e.activity.toLowerCase().includes(needle)
      );
    });
  }, [enterprises, q, sector, principal, onlyCases]);

  const usedSectors = SECTORS.filter((s) =>
    enterprises.some((e) => e.sector === s.key),
  );
  const usedPrincipals = PRINCIPALS.filter((p) =>
    enterprises.some((e) => e.principal === p.key),
  );

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto]">
        <label className="relative block">
          <span className="sr-only">Търсене на предприятие</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Търсене (напр. БДЖ, газ, болница)…"
            className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
          />
        </label>
        <label className="block">
          <span className="sr-only">Филтър по сектор</span>
          <select
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white py-2.5 px-3 text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
          >
            <option value="">Всички сектори</option>
            {usedSectors.map((s) => (
              <option key={s.key} value={s.key}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="sr-only">Филтър по принципал</span>
          <select
            value={principal}
            onChange={(e) => setPrincipal(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white py-2.5 px-3 text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
          >
            <option value="">Всички принципали</option>
            {usedPrincipals.map((p) => (
              <option key={p.key} value={p.key}>
                {p.short}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500" aria-live="polite">
          Показани {filtered.length} от {enterprises.length} предприятия
        </p>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={onlyCases}
            onChange={(e) => setOnlyCases(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          само с известни случаи
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500">
          Няма предприятие по този филтър. Опитайте с друга дума или махнете филтрите.
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((e) => (
            <Card key={e.slug} e={e} />
          ))}
        </div>
      )}
    </div>
  );
}
