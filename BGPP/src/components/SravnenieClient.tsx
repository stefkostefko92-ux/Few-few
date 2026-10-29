"use client";

import { useState } from "react";
import Link from "next/link";
import type { Enterprise } from "@/data/types";
import { sector as getSector } from "@/data/sectors";
import { principal as getPrincipal } from "@/data/principals";
import { transparency } from "@/lib/aggregate";
import { casesForSlug } from "@/data/cases";

function Select({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Enterprise[];
  label: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
      >
        {options.map((o) => (
          <option key={o.slug} value={o.slug}>
            {o.shortName ?? o.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function Col({ e }: { e: Enterprise }) {
  const t = transparency(e);
  const cases = casesForSlug(e.slug).length;
  const rows: [string, string][] = [
    ["Правна форма", e.legalForm],
    ["Държавно участие", `${e.stateShare}%`],
    ["Сектор", getSector(e.sector).short],
    ["Принципал", getPrincipal(e.principal).short],
    ["ЕИК", e.eik ?? "—"],
    ["Седалище", e.hq ?? "—"],
    ["Индекс на прозрачност", `${t.score}/${t.max} · ${t.label}`],
    ["Източници на приход", String(e.moneyIn.length)],
    ["Пера разход", String(e.moneyOut.length)],
    ["Известни случаи", cases > 0 ? String(cases) : "—"],
    ["Финансови данни", e.financial ? e.financial.text : "—"],
  ];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <Link href={`/predpriyatiya/${e.slug}`} className="text-lg font-bold text-slate-900 hover:text-brand-700">
        {e.shortName ?? e.name}
      </Link>
      <dl className="mt-3 space-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-2 gap-2 border-b border-slate-100 pb-2">
            <dt className="text-slate-500">{k}</dt>
            <dd className="font-medium text-slate-800">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function SravnenieClient({ enterprises }: { enterprises: Enterprise[] }) {
  const [a, setA] = useState(enterprises[0]?.slug ?? "");
  const [b, setB] = useState(enterprises[1]?.slug ?? "");
  const ea = enterprises.find((e) => e.slug === a);
  const eb = enterprises.find((e) => e.slug === b);
  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Select value={a} onChange={setA} options={enterprises} label="Първо предприятие" />
        <Select value={b} onChange={setB} options={enterprises} label="Второ предприятие" />
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {ea && <Col e={ea} />}
        {eb && <Col e={eb} />}
      </div>
    </div>
  );
}
