"use client";

// Промоции (роля управител): промо цена или % отстъпка за стока/категория,
// период (дати) + по избор happy hour часове и минимално количество.

import { useCallback, useEffect, useState } from "react";
import { Plus, Tag, Clock, Percent } from "@phosphor-icons/react";
import { Modal, Field, Badge, Spinner, apiJson } from "@/components/ui";
import { formatEur, parseCents } from "@/lib/money";

interface Product {
  id: string;
  plu: number;
  name: string;
}
interface Category {
  id: string;
  name: string;
}
interface Promotion {
  id: string;
  name: string;
  productId: string | null;
  categoryId: string | null;
  kind: "PERCENT" | "PRICE" | "MXN";
  percent: number | null;
  priceCents: number | null;
  buyQty: number | null;
  payQty: number | null;
  startDate: string;
  endDate: string;
  startMinute: number | null;
  endMinute: number | null;
  minQtyMilli: number;
  active: boolean;
  product: { name: string; plu: number } | null;
  category: { name: string } | null;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function minutesToHHMM(m: number | null): string {
  if (m === null) return "";
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
function hhmmToMinutes(s: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(s)) return null;
  const [h, m] = s.split(":").map(Number);
  return h! * 60 + m!;
}

const EMPTY = {
  name: "",
  scope: "product" as "product" | "category",
  productId: "",
  categoryId: "",
  kind: "PERCENT" as "PERCENT" | "PRICE" | "MXN",
  percent: "10",
  price: "",
  buyQty: "3",
  payQty: "2",
  startDate: iso(new Date()),
  endDate: iso(new Date(Date.now() + 7 * 864e5)),
  happyHour: false,
  startTime: "08:00",
  endTime: "10:00",
  minQty: "0",
};

export default function PromotionsPage() {
  const [promotions, setPromotions] = useState<Promotion[] | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const j = await apiJson<{ promotions: Promotion[] }>(await fetch("/api/promotions"));
    setPromotions(j.promotions);
  }, []);

  useEffect(() => {
    void load();
    void (async () => {
      const [p, c] = await Promise.all([
        apiJson<{ products: Product[] }>(await fetch("/api/products?all=1")),
        apiJson<{ categories: Category[] }>(await fetch("/api/categories")),
      ]);
      setProducts(p.products);
      setCategories(c.categories);
    })();
  }, [load]);

  function openNew() {
    setForm({ ...EMPTY, productId: products[0]?.id ?? "", categoryId: categories[0]?.id ?? "" });
    setError(null);
    setOpen(true);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        kind: form.kind,
        startDate: form.startDate,
        endDate: form.endDate,
        minQtyMilli: Math.round(parseFloat(form.minQty.replace(",", ".") || "0") * 1000),
        ...(form.scope === "product"
          ? { productId: form.productId, categoryId: null }
          : { categoryId: form.categoryId, productId: null }),
      };
      if (form.kind === "PERCENT") {
        const pct = parseFloat(form.percent.replace(",", "."));
        if (isNaN(pct) || pct <= 0 || pct > 100) throw new Error("Невалиден процент.");
        payload.percent = Math.round(pct * 10);
      } else if (form.kind === "PRICE") {
        const cents = parseCents(form.price);
        if (isNaN(cents) || cents < 0) throw new Error("Невалидна промо цена.");
        payload.priceCents = cents;
      } else {
        const buy = parseInt(form.buyQty, 10);
        const pay = parseInt(form.payQty, 10);
        if (isNaN(buy) || isNaN(pay) || buy <= pay) {
          throw new Error("„М за N“: вземаш повече, отколкото плащаш (напр. 3 за 2).");
        }
        payload.buyQty = buy;
        payload.payQty = pay;
      }
      if (form.happyHour) {
        payload.startMinute = hhmmToMinutes(form.startTime);
        payload.endMinute = hhmmToMinutes(form.endTime);
      }
      await apiJson(
        await fetch("/api/promotions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      );
      setOpen(false);
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Грешка при запис.");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(p: Promotion) {
    await apiJson(
      await fetch(`/api/promotions/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !p.active }),
      })
    );
    void load();
  }

  const todayIso = iso(new Date());
  function isLive(p: Promotion): boolean {
    return p.active && p.startDate.slice(0, 10) <= todayIso && p.endDate.slice(0, 10) >= todayIso;
  }

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black">Промоции</h1>
          <p className="text-ink-400 text-sm mt-1">
            Промо цена или % отстъпка за стока/категория, за период и по избор в часови диапазон.
            POS автоматично прилага най-изгодната.
          </p>
        </div>
        <button onClick={openNew} className="btn-primary">
          <Plus size={18} weight="bold" /> Нова промоция
        </button>
      </div>

      {!promotions ? (
        <Spinner label="Зареждане…" />
      ) : promotions.length === 0 ? (
        <div className="card p-10 text-center text-ink-400">
          <Tag size={40} className="mx-auto mb-3 text-brand-600" weight="duotone" />
          Още няма промоции.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-ink-400 text-left border-b border-ink-800">
                <th className="py-3 px-4 font-medium">Промоция</th>
                <th className="py-3 px-2 font-medium">Обхват</th>
                <th className="py-3 px-2 font-medium">Отстъпка</th>
                <th className="py-3 px-2 font-medium">Период</th>
                <th className="py-3 px-2 font-medium">Часове</th>
                <th className="py-3 px-2 font-medium text-center">Статус</th>
                <th className="py-3 px-4 font-medium text-right">Действия</th>
              </tr>
            </thead>
            <tbody>
              {promotions.map((p) => (
                <tr
                  key={p.id}
                  className={`border-b border-ink-800/60 last:border-0 ${!p.active ? "opacity-45" : ""}`}
                >
                  <td className="py-2.5 px-4 font-medium">{p.name}</td>
                  <td className="py-2.5 px-2 text-ink-400">
                    {p.product ? `${p.product.name}` : `катег.: ${p.category?.name}`}
                  </td>
                  <td className="py-2.5 px-2 font-semibold">
                    {p.kind === "PERCENT" ? (
                      <span className="inline-flex items-center gap-1 text-coral-600">
                        <Percent size={13} weight="bold" />
                        {(p.percent! / 10).toFixed(p.percent! % 10 ? 1 : 0)}%
                      </span>
                    ) : p.kind === "PRICE" ? (
                      <span className="text-brand-700">{formatEur(p.priceCents!)}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-coral-600">
                        <Tag size={13} weight="fill" />
                        {p.buyQty} за {p.payQty}
                      </span>
                    )}
                    {p.minQtyMilli > 0 && (
                      <span className="text-ink-500 text-xs"> · от {p.minQtyMilli / 1000}</span>
                    )}
                  </td>
                  <td className="py-2.5 px-2 text-ink-400 tabular-nums">
                    {new Date(p.startDate).toLocaleDateString("bg-BG", { day: "2-digit", month: "2-digit" })}
                    {" – "}
                    {new Date(p.endDate).toLocaleDateString("bg-BG", { day: "2-digit", month: "2-digit" })}
                  </td>
                  <td className="py-2.5 px-2 text-ink-400 tabular-nums">
                    {p.startMinute !== null ? (
                      <span className="inline-flex items-center gap-1">
                        <Clock size={13} />
                        {minutesToHHMM(p.startMinute)}–{minutesToHHMM(p.endMinute)}
                      </span>
                    ) : (
                      "цял ден"
                    )}
                  </td>
                  <td className="py-2.5 px-2 text-center">
                    <Badge tone={isLive(p) ? "success" : p.active ? "warning" : "neutral"}>
                      {isLive(p) ? "активна" : p.active ? "планирана/изтекла" : "спряна"}
                    </Badge>
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <button
                      className={`btn !py-1.5 !px-3 text-xs ${p.active ? "bg-ink-800 text-ink-300" : "bg-mint-600/20 text-mint-600"}`}
                      onClick={() => toggle(p)}
                    >
                      {p.active ? "спри" : "пусни"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Нова промоция" wide>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Field label="Име на промоцията">
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="input w-full"
                placeholder="напр. Лятна отстъпка на млечни"
              />
            </Field>
          </div>

          <Field label="Обхват">
            <select
              value={form.scope}
              onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value as "product" | "category" }))}
              className="input w-full"
            >
              <option value="product">Конкретна стока</option>
              <option value="category">Цяла категория</option>
            </select>
          </Field>
          {form.scope === "product" ? (
            <Field label="Стока">
              <select
                value={form.productId}
                onChange={(e) => setForm((f) => ({ ...f, productId: e.target.value }))}
                className="input w-full"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.plu} · {p.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <Field label="Категория">
              <select
                value={form.categoryId}
                onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
                className="input w-full"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field label="Тип">
            <select
              value={form.kind}
              onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as "PERCENT" | "PRICE" | "MXN" }))}
              className="input w-full"
            >
              <option value="PERCENT">Процент отстъпка</option>
              <option value="PRICE">Фиксирана промо цена</option>
              <option value="MXN">„М за N“ (напр. 3 за 2)</option>
            </select>
          </Field>
          {form.kind === "PERCENT" ? (
            <Field label="Процент (%)">
              <input
                value={form.percent}
                onChange={(e) => setForm((f) => ({ ...f, percent: e.target.value }))}
                className="input w-full"
                inputMode="decimal"
              />
            </Field>
          ) : form.kind === "PRICE" ? (
            <Field label="Промо цена (EUR, с ДДС)">
              <input
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                className="input w-full"
                inputMode="decimal"
                placeholder="0,00"
              />
            </Field>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Вземаш (брой)">
                <input
                  value={form.buyQty}
                  onChange={(e) => setForm((f) => ({ ...f, buyQty: e.target.value }))}
                  className="input w-full"
                  inputMode="numeric"
                />
              </Field>
              <Field label="Плащаш (брой)">
                <input
                  value={form.payQty}
                  onChange={(e) => setForm((f) => ({ ...f, payQty: e.target.value }))}
                  className="input w-full"
                  inputMode="numeric"
                />
              </Field>
            </div>
          )}

          <Field label="От дата">
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              className="input w-full"
            />
          </Field>
          <Field label="До дата">
            <input
              type="date"
              value={form.endDate}
              onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
              className="input w-full"
            />
          </Field>

          <Field label="Минимално количество (0 = без)">
            <input
              value={form.minQty}
              onChange={(e) => setForm((f) => ({ ...f, minQty: e.target.value }))}
              className="input w-full"
              inputMode="decimal"
            />
          </Field>
          <div className="flex items-end">
            <label className="flex items-center gap-2.5 pb-2.5">
              <input
                type="checkbox"
                checked={form.happyHour}
                onChange={(e) => setForm((f) => ({ ...f, happyHour: e.target.checked }))}
                className="size-5 accent-brand-500"
              />
              <span className="font-medium">Happy hour (само в часови диапазон)</span>
            </label>
          </div>
          {form.happyHour && (
            <>
              <Field label="От час">
                <input
                  type="time"
                  value={form.startTime}
                  onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                  className="input w-full"
                />
              </Field>
              <Field label="До час">
                <input
                  type="time"
                  value={form.endTime}
                  onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                  className="input w-full"
                />
              </Field>
            </>
          )}
        </div>
        {error && <p className="text-coral-600 text-sm mt-3">{error}</p>}
        <button onClick={save} disabled={busy} className="btn-primary w-full mt-5 h-12">
          {busy ? "Записва се…" : "Създай промоцията"}
        </button>
      </Modal>
    </div>
  );
}
