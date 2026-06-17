"use client";

import { useState } from "react";
import { ArrowRightLeft } from "lucide-react";

// Фиксиран официален курс на превалутиране.
const RATE = 1.95583;

function toNum(v: string): number {
  return parseFloat(v.replace(",", ".").replace(/\s/g, ""));
}

export function EuroConverter() {
  const [bgn, setBgn] = useState("");
  const [eur, setEur] = useState("");

  const onBgn = (v: string) => {
    setBgn(v);
    const n = toNum(v);
    setEur(v.trim() === "" || !Number.isFinite(n) ? "" : (n / RATE).toFixed(2));
  };
  const onEur = (v: string) => {
    setEur(v);
    const n = toNum(v);
    setBgn(v.trim() === "" || !Number.isFinite(n) ? "" : (n * RATE).toFixed(2));
  };

  return (
    <section className="rounded-2xl border-2 border-brand-200 bg-white p-6 shadow-sm">
      <h2 className="flex items-center gap-2 font-display text-xl font-bold text-slate-900">
        <ArrowRightLeft className="h-6 w-6 text-brand-700" aria-hidden />
        Бърз конвертор: евро ↔ левове
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        Напишете сума в едното поле и веднага виждате колко прави в другото.
      </p>

      <div className="mt-4 grid items-end gap-4 sm:grid-cols-[1fr,auto,1fr]">
        <div>
          <label htmlFor="conv-bgn" className="label text-base">
            Левове (лв)
          </label>
          <input
            id="conv-bgn"
            type="text"
            inputMode="decimal"
            value={bgn}
            onChange={(e) => onBgn(e.target.value)}
            placeholder="напр. 100"
            className="input text-2xl font-bold"
            aria-label="Сума в левове"
          />
        </div>

        <div className="hidden pb-3 text-center text-2xl text-slate-400 sm:block" aria-hidden>
          =
        </div>

        <div>
          <label htmlFor="conv-eur" className="label text-base">
            Евро (€)
          </label>
          <input
            id="conv-eur"
            type="text"
            inputMode="decimal"
            value={eur}
            onChange={(e) => onEur(e.target.value)}
            placeholder="напр. 51.13"
            className="input text-2xl font-bold"
            aria-label="Сума в евро"
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
        <span>
          Фиксиран курс: <strong>1 евро = 1.95583 лева</strong>
        </span>
        <button
          type="button"
          onClick={() => {
            setBgn("");
            setEur("");
          }}
          className="text-brand-700 underline hover:text-brand-800"
        >
          Изчисти
        </button>
      </div>
    </section>
  );
}
