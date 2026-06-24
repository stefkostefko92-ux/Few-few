"use client";

import { useState } from "react";
import { bgnToEur, formatMoney } from "@/lib/euro";

// Помощен калкулатор: разбива годишния местен данък на две вноски и показва
// ориентировъчната отстъпка при ранно плащане. Числата са указателни.
export function TaxInstallments() {
  const [total, setTotal] = useState("200");
  const n = parseFloat(total.replace(",", ".")) || 0;
  const half = n / 2;
  const discounted = n * 0.95;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <label className="label" htmlFor="total">
        Годишен данък (лева)
      </label>
      <input
        id="total"
        inputMode="decimal"
        value={total}
        onChange={(e) => setTotal(e.target.value)}
        className="input max-w-xs text-lg"
      />

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg bg-brand-50 p-4">
          <p className="text-sm text-slate-600">Първа вноска (~30 юни)</p>
          <p className="font-display text-xl font-bold text-slate-900">
            {formatMoney(half)} лв
          </p>
          <p className="text-sm text-slate-500">{formatMoney(bgnToEur(half))} €</p>
        </div>
        <div className="rounded-lg bg-brand-50 p-4">
          <p className="text-sm text-slate-600">Втора вноска (~31 окт.)</p>
          <p className="font-display text-xl font-bold text-slate-900">
            {formatMoney(half)} лв
          </p>
          <p className="text-sm text-slate-500">{formatMoney(bgnToEur(half))} €</p>
        </div>
        <div className="rounded-lg bg-gold-50 p-4">
          <p className="text-sm text-slate-600">Наведнъж с ~5% отстъпка</p>
          <p className="font-display text-xl font-bold text-slate-900">
            {formatMoney(discounted)} лв
          </p>
          <p className="text-sm text-slate-500">
            {formatMoney(bgnToEur(discounted))} €
          </p>
        </div>
      </div>
      <p className="mt-3 text-sm text-slate-500">
        Указателно. Точните срокове, размери и отстъпки за годината се определят от
        закона и общината — проверявайте на сайта на Община Дупница.
      </p>
    </div>
  );
}
