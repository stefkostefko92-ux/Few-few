"use client";

// Стоки: списък с търсене, създаване/редакция, деактивиране (без изтриване —
// СУПТО принцип), баркодове и цени с двойно обозначаване.

import { useCallback, useEffect, useState } from "react";
import { Plus, PencilSimple, Star } from "@phosphor-icons/react";
import { Modal, Field, Badge, Spinner, apiJson } from "@/components/ui";
import { formatDual, formatEur, formatQty, parseCents } from "@/lib/money";
import { UNITS, VAT_GROUPS } from "@/lib/constants";

interface Category {
  id: string;
  name: string;
}
interface Product {
  id: string;
  plu: number;
  name: string;
  categoryId: string;
  category: Category;
  unit: "PCS" | "KG";
  vatGroup: keyof typeof VAT_GROUPS;
  priceCents: number;
  costCents: number;
  stockMilli: number;
  minStockMilli: number;
  favorite: boolean;
  active: boolean;
  barcodes: Array<{ id: string; code: string }>;
}

const EMPTY = {
  plu: "",
  name: "",
  categoryId: "",
  unit: "PCS" as "PCS" | "KG",
  vatGroup: "B" as keyof typeof VAT_GROUPS,
  price: "",
  cost: "",
  minStock: "0",
  favorite: false,
  barcodes: "",
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (query: string) => {
    const j = await apiJson<{ products: Product[] }>(
      await fetch(`/api/products?all=1${query ? `&q=${encodeURIComponent(query)}` : ""}`)
    );
    setProducts(j.products);
  }, []);

  useEffect(() => {
    void load("");
    fetch("/api/categories")
      .then((r) => apiJson<{ categories: Category[] }>(r))
      .then((j) => setCategories(j.categories));
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => void load(q), 250);
    return () => clearTimeout(t);
  }, [q, load]);

  function openEditor(p: Product | "new") {
    setEditing(p);
    setError(null);
    if (p === "new") {
      setForm({ ...EMPTY, categoryId: categories[0]?.id ?? "" });
    } else {
      setForm({
        plu: String(p.plu),
        name: p.name,
        categoryId: p.categoryId,
        unit: p.unit,
        vatGroup: p.vatGroup,
        price: (p.priceCents / 100).toFixed(2),
        cost: (p.costCents / 100).toFixed(2),
        minStock: String(p.minStockMilli / 1000),
        favorite: p.favorite,
        barcodes: p.barcodes.map((b) => b.code).join(", "),
      });
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const priceCents = parseCents(form.price);
      const costCents = form.cost.trim() === "" ? 0 : parseCents(form.cost);
      if (isNaN(priceCents) || priceCents < 0) throw new Error("Невалидна продажна цена.");
      if (isNaN(costCents) || costCents < 0) throw new Error("Невалидна доставна цена.");
      const payload = {
        name: form.name.trim(),
        categoryId: form.categoryId,
        unit: form.unit,
        vatGroup: form.vatGroup,
        priceCents,
        costCents,
        minStockMilli: Math.round(parseFloat(form.minStock.replace(",", ".") || "0") * 1000),
        favorite: form.favorite,
        barcodes: form.barcodes
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      };
      if (editing === "new") {
        await apiJson(
          await fetch("/api/products", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...payload, plu: parseInt(form.plu, 10) }),
          })
        );
      } else if (editing) {
        await apiJson(
          await fetch(`/api/products/${editing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        );
      }
      setEditing(null);
      void load(q);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Грешка при запис.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(p: Product) {
    await apiJson(
      await fetch(`/api/products/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !p.active }),
      })
    );
    void load(q);
  }

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <h1 className="text-2xl font-black">Стоки</h1>
        <div className="flex gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Търсене по име или PLU…"
            className="input w-72"
          />
          <button onClick={() => openEditor("new")} className="btn-primary">
            <Plus size={18} weight="bold" /> Нова стока
          </button>
        </div>
      </div>

      {!products ? (
        <Spinner label="Зареждане…" />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-ink-400 text-left border-b border-ink-800 bg-ink-900">
                <th className="py-3 px-4 font-medium w-16">PLU</th>
                <th className="py-3 px-2 font-medium">Наименование</th>
                <th className="py-3 px-2 font-medium">Категория</th>
                <th className="py-3 px-2 font-medium text-center">ДДС</th>
                <th className="py-3 px-2 font-medium text-right">Цена</th>
                <th className="py-3 px-2 font-medium text-right">Наличност</th>
                <th className="py-3 px-4 font-medium text-right">Действия</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr
                  key={p.id}
                  className={`border-b border-ink-800/60 last:border-0 hover:bg-ink-850/50 ${!p.active ? "opacity-45" : ""}`}
                >
                  <td className="py-2.5 px-4 font-mono text-ink-400">{p.plu}</td>
                  <td className="py-2.5 px-2 font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      {p.favorite && <Star size={14} weight="fill" className="text-brand-700" />}
                      {p.name}
                    </span>
                    {p.barcodes.length > 0 && (
                      <span className="block text-[11px] text-ink-500 font-mono">
                        {p.barcodes.map((b) => b.code).join(" · ")}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-2 text-ink-400">{p.category?.name}</td>
                  <td className="py-2.5 px-2 text-center">
                    <Badge tone="info">{VAT_GROUPS[p.vatGroup].letter}</Badge>
                  </td>
                  <td className="py-2.5 px-2 text-right tabular-nums">
                    <div className="font-bold">{formatEur(p.priceCents)}</div>
                    <div className="text-[11px] text-ink-500">
                      {formatDual(p.priceCents, true).split("(")[1]?.replace(")", "")}
                    </div>
                  </td>
                  <td className="py-2.5 px-2 text-right tabular-nums">
                    <Badge
                      tone={
                        p.stockMilli <= 0
                          ? "danger"
                          : p.stockMilli <= p.minStockMilli
                            ? "warning"
                            : "success"
                      }
                    >
                      {formatQty(p.stockMilli, UNITS[p.unit].decimals)} {UNITS[p.unit].label}
                    </Badge>
                  </td>
                  <td className="py-2.5 px-4 text-right whitespace-nowrap">
                    <button className="btn-ghost !p-2" onClick={() => openEditor(p)} title="Редакция">
                      <PencilSimple size={16} />
                    </button>
                    <button
                      className={`btn !p-2 ml-1 text-xs ${p.active ? "bg-ink-800 text-ink-300" : "bg-mint-600/20 text-mint-600"}`}
                      onClick={() => toggleActive(p)}
                      title={p.active ? "Деактивирай (не се трие — одитна следа)" : "Активирай"}
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

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Нова стока" : "Редакция на стока"}
        wide
      >
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="PLU (кратък номер)">
            <input
              value={form.plu}
              disabled={editing !== "new"}
              onChange={(e) => setForm((f) => ({ ...f, plu: e.target.value }))}
              className="input w-full disabled:opacity-50"
              inputMode="numeric"
            />
          </Field>
          <Field label="Наименование">
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="input w-full"
            />
          </Field>
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
          <Field label="Мерна единица">
            <select
              value={form.unit}
              onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value as "PCS" | "KG" }))}
              className="input w-full"
            >
              <option value="PCS">брой</option>
              <option value="KG">килограм (тегловна)</option>
            </select>
          </Field>
          <Field label="Данъчна група (чл. 27 Н-18)">
            <select
              value={form.vatGroup}
              onChange={(e) =>
                setForm((f) => ({ ...f, vatGroup: e.target.value as keyof typeof VAT_GROUPS }))
              }
              className="input w-full"
            >
              {Object.entries(VAT_GROUPS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.letter} — {v.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Продажна цена (EUR, с ДДС)">
            <input
              value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              className="input w-full"
              inputMode="decimal"
              placeholder="0,00"
            />
          </Field>
          <Field label="Доставна цена (EUR, без ДДС)">
            <input
              value={form.cost}
              onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
              className="input w-full"
              inputMode="decimal"
              placeholder="0,00"
            />
          </Field>
          <Field label="Минимална наличност (праг за аларма)">
            <input
              value={form.minStock}
              onChange={(e) => setForm((f) => ({ ...f, minStock: e.target.value }))}
              className="input w-full"
              inputMode="decimal"
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Баркодове (разделени със запетая)">
              <input
                value={form.barcodes}
                onChange={(e) => setForm((f) => ({ ...f, barcodes: e.target.value }))}
                className="input w-full font-mono"
                placeholder="3800…, 3800…"
              />
            </Field>
          </div>
          <label className="flex items-center gap-2.5 sm:col-span-2">
            <input
              type="checkbox"
              checked={form.favorite}
              onChange={(e) => setForm((f) => ({ ...f, favorite: e.target.checked }))}
              className="size-5 accent-brand-500"
            />
            <span className="font-medium inline-flex items-center gap-1">
              Бърз бутон на POS екрана
              <Star size={15} weight="fill" className="text-brand-500" />
            </span>
          </label>
        </div>
        {error && <p className="text-coral-600 text-sm mt-3">{error}</p>}
        <button onClick={save} disabled={busy} className="btn-primary w-full mt-5 h-12">
          {busy ? "Записва се…" : "Запази"}
        </button>
      </Modal>
    </div>
  );
}
