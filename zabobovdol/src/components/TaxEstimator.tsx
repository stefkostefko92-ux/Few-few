"use client";

// Ориентировъчен калкулатор за годишен данък/такса = данъчна оценка × ставка (‰).
// Ставките се определят от Общинския съвет — затова са въвеждаеми, а резултатът
// е само ориентир. Точните числа са в съобщението от данъчната служба.
import { useState } from "react";

function bgn(n: number): string {
  return n.toLocaleString("bg-BG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function TaxEstimator() {
  const [ocenka, setOcenka] = useState("");
  const [stavka, setStavka] = useState("1.5");

  const base = Number(ocenka.replace(",", "."));
  const rate = Number(stavka.replace(",", "."));
  const valid = Number.isFinite(base) && base > 0 && Number.isFinite(rate) && rate > 0;
  const yearly = valid ? (base * rate) / 1000 : 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="text-xl font-bold text-slate-900">Ориентировъчен калкулатор</h2>
      <p className="mt-1 text-sm text-slate-600">
        Годишен данък/такса = данъчна оценка × ставка. Въведете числата от съобщението си.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="ocenka">
            Данъчна оценка (лв.)
          </label>
          <input
            id="ocenka"
            inputMode="decimal"
            value={ocenka}
            onChange={(e) => setOcenka(e.target.value)}
            placeholder="напр. 25000"
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="stavka">
            Ставка (‰ промил)
          </label>
          <input
            id="stavka"
            inputMode="decimal"
            value={stavka}
            onChange={(e) => setStavka(e.target.value)}
            placeholder="напр. 1.5"
            className="input"
          />
        </div>
      </div>

      <div className="mt-4 rounded-lg bg-brand-50 p-4" aria-live="polite">
        {valid ? (
          <p className="text-lg text-slate-800">
            Ориентировъчно годишно:{" "}
            <strong className="text-brand-800">{bgn(yearly)} лв.</strong>{" "}
            <span className="text-slate-600">(≈ {bgn(yearly / 1.95583)} €)</span>
          </p>
        ) : (
          <p className="text-slate-600">Въведете данъчна оценка и ставка, за да видите резултат.</p>
        )}
      </div>
      <p className="mt-3 text-xs text-slate-600">
        Това е приблизителна сметка. Точните ставки се определят от Общинския съвет и може да се
        различават; меродавно е съобщението от данъчната служба.
      </p>
    </div>
  );
}
