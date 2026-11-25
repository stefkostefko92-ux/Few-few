"use client";

import { useState } from "react";
import { ArrowRightLeft } from "@/components/icons";

// Фиксиран официален курс на превалутиране (1 евро = 1,95583 лева).
const RATE = 1.95583;
const RATE_TEXT = "1,95583";

// Българският десетичен знак е запетая; приемаме и точка.
function toNum(v: string): number {
  return parseFloat(v.replace(/\s/g, "").replace(",", "."));
}

// Стойност за полето: „51,13“ (без интервали за хилядите — по-лесно за поправка).
const FMT = new Intl.NumberFormat("bg-BG", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: false,
});

export function EuroConverter({ className = "" }: { className?: string }) {
  const [bgn, setBgn] = useState("");
  const [eur, setEur] = useState("");

  const onBgn = (v: string) => {
    setBgn(v);
    const n = toNum(v);
    setEur(v.trim() === "" || !Number.isFinite(n) ? "" : FMT.format(n / RATE));
  };
  const onEur = (v: string) => {
    setEur(v);
    const n = toNum(v);
    setBgn(v.trim() === "" || !Number.isFinite(n) ? "" : FMT.format(n * RATE));
  };

  return (
    <section aria-labelledby="konvertor" className={`panel sm:p-6 ${className}`}>
      <h2
        id="konvertor"
        className="flex items-center gap-2 font-sans text-xl font-semibold text-slate-900"
      >
        <ArrowRightLeft className="h-6 w-6 shrink-0 text-brand-700" aria-hidden />
        Конвертор: левове ↔ евро
      </h2>
      <p className="mt-1 text-base text-slate-600">
        Напишете сума в едното поле — в другото веднага виждате колко прави. Удобно за стари цени,
        спестявания в левове и суми от стари документи.
      </p>

      <div className="mt-4 grid items-end gap-4 sm:grid-cols-[1fr,auto,1fr]">
        <div>
          <label htmlFor="conv-bgn" className="label">
            Левове (лв.)
          </label>
          <input
            id="conv-bgn"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={bgn}
            onChange={(e) => onBgn(e.target.value)}
            placeholder="напр. 100"
            className="input text-2xl font-bold tabular-nums"
          />
        </div>

        <div className="hidden pb-3 text-center text-2xl text-slate-600 sm:block" aria-hidden>
          =
        </div>

        <div>
          <label htmlFor="conv-eur" className="label">
            Евро (€)
          </label>
          <input
            id="conv-eur"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={eur}
            onChange={(e) => onEur(e.target.value)}
            placeholder="напр. 51,13"
            className="input text-2xl font-bold tabular-nums"
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <p className="text-base text-slate-700">
          Фиксиран курс: <strong className="whitespace-nowrap">1 евро = {RATE_TEXT} лева</strong>
        </p>
        <button
          type="button"
          onClick={() => {
            setBgn("");
            setEur("");
          }}
          className="link-quiet inline-flex min-h-tap items-center text-base font-medium text-brand-700"
        >
          Изчистете
        </button>
      </div>
    </section>
  );
}
