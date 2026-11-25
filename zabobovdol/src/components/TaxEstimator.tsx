"use client";

// Ориентировъчен калкулатор за годишен данък/такса = данъчна оценка × ставка (‰).
// Ставките се определят от Общинския съвет — затова са въвеждаеми, а резултатът
// е само ориентир. Точните числа са в съобщението от данъчната служба.
// От 1 януари 2026 г. сумите са в евро; левовете — само в скоби, за ориентир.
import { useState } from "react";

const RATE = 1.95583; // фиксиран курс: 1 евро = 1,95583 лева

const FMT = new Intl.NumberFormat("bg-BG", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// „1 234,50 €“ — числото и знакът не се разделят на два реда.
function money(n: number, unit: string): string {
  return `${FMT.format(n)} ${unit}`;
}

function toNum(v: string): number {
  const t = v.replace(/\s/g, "").replace(",", ".");
  return t === "" ? NaN : Number(t);
}

export function TaxEstimator() {
  const [ocenka, setOcenka] = useState("");
  const [stavka, setStavka] = useState("1,5");

  const base = toNum(ocenka);
  const rate = toNum(stavka);
  const valid = Number.isFinite(base) && base > 0 && Number.isFinite(rate) && rate > 0;
  const yearly = valid ? (base * rate) / 1000 : 0;

  return (
    <div className="panel sm:p-6">
      <h3 className="font-sans text-xl font-semibold text-slate-900">Ориентировъчен калкулатор</h3>
      <p className="mt-1 text-base text-slate-600">
        Годишен данък/такса = данъчна оценка × ставка. Въведете числата от съобщението си.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="ocenka">
            Данъчна оценка (€)
          </label>
          <input
            id="ocenka"
            inputMode="decimal"
            autoComplete="off"
            value={ocenka}
            onChange={(e) => setOcenka(e.target.value)}
            placeholder="напр. 12 800"
            className="input tabular-nums"
          />
        </div>
        <div>
          <label className="label" htmlFor="stavka">
            Ставка (‰ — промил)
          </label>
          <input
            id="stavka"
            inputMode="decimal"
            autoComplete="off"
            value={stavka}
            onChange={(e) => setStavka(e.target.value)}
            placeholder="напр. 1,5"
            className="input tabular-nums"
          />
        </div>
      </div>

      <div className="callout-info mt-4 rounded-xl" aria-live="polite">
        {valid ? (
          <p className="text-lg text-slate-800">
            Ориентировъчно годишно:{" "}
            <strong className="whitespace-nowrap text-brand-800">{money(yearly, "€")}</strong>{" "}
            <span className="whitespace-nowrap text-slate-600">
              (≈ {money(yearly * RATE, "лв.")})
            </span>
          </p>
        ) : (
          <p className="text-base text-slate-700">
            Въведете данъчна оценка и ставка, за да видите резултат.
          </p>
        )}
      </div>
      <p className="mt-3 text-base text-slate-600">
        Това е приблизителна сметка. Точните ставки се определят от Общинския съвет и може да се
        различават; меродавно е съобщението от данъчната служба.
      </p>
    </div>
  );
}
