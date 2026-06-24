"use client";

import { useState } from "react";
import { BGN_PER_EUR, bgnToEur, eurToBgn, formatMoney } from "@/lib/euro";

export function EuroConverter() {
  const [bgn, setBgn] = useState("100");
  const [eur, setEur] = useState(formatMoney(bgnToEur(100)));

  function onBgn(v: string) {
    setBgn(v);
    const n = parseFloat(v.replace(",", "."));
    setEur(Number.isFinite(n) ? formatMoney(bgnToEur(n)) : "");
  }
  function onEur(v: string) {
    setEur(v);
    const n = parseFloat(v.replace(",", "."));
    setBgn(Number.isFinite(n) ? formatMoney(eurToBgn(n)) : "");
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="grid items-end gap-4 sm:grid-cols-[1fr_auto_1fr]">
        <div>
          <label className="label" htmlFor="bgn">
            Лева (BGN)
          </label>
          <input
            id="bgn"
            inputMode="decimal"
            value={bgn}
            onChange={(e) => onBgn(e.target.value)}
            className="input text-lg"
          />
        </div>
        <div className="pb-3 text-center text-2xl text-slate-600" aria-hidden>
          ⇄
        </div>
        <div>
          <label className="label" htmlFor="eur">
            Евро (EUR)
          </label>
          <input
            id="eur"
            inputMode="decimal"
            value={eur}
            onChange={(e) => onEur(e.target.value)}
            className="input text-lg"
          />
        </div>
      </div>
      <p className="mt-3 text-sm text-slate-500">
        Фиксиран курс: 1 евро = {formatMoney(BGN_PER_EUR)} лева.
      </p>
    </div>
  );
}
