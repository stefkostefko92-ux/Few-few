"use client";

// Склад: доставки (заприхождаване с партида/срок), ревизия (изравняване),
// брак (изписване). Всичко минава през складовата книга на сървъра.

import { useCallback, useEffect, useState } from "react";
import { Truck, ClipboardText, Trash, Plus, X, Clock, WarningCircle, CheckCircle } from "@phosphor-icons/react";
import { Modal, Field, Badge, Spinner, apiJson } from "@/components/ui";
import { formatEur, formatQty, parseCents, parseQty } from "@/lib/money";
import { UNITS } from "@/lib/constants";

interface Product {
  id: string;
  plu: number;
  name: string;
  unit: "PCS" | "KG";
  stockMilli: number;
  costCents: number;
}
interface Supplier {
  id: string;
  name: string;
}
interface Delivery {
  id: string;
  docNumber: string;
  totalCostCents: number;
  createdAt: string;
  supplier: { name: string };
  user: { name: string };
  items: Array<{ qtyMilli: number; unitCostCents: number; product: { name: string; unit: "PCS" | "KG" } }>;
}

type Tab = "deliveries" | "stocktake" | "writeoff";
type ViewTab = "deliveries" | "stocktake" | "expiry" | "reorder";

interface Batch {
  id: string;
  productId: string;
  plu: number;
  name: string;
  unit: "PCS" | "KG";
  qtyMilli: number;
  batchNumber: string | null;
  expiryDate: string;
  daysLeft: number;
  expired: boolean;
  supplier: string;
}

interface ReorderItem {
  productId: string;
  plu: number;
  name: string;
  unit: "PCS" | "KG";
  stockMilli: number;
  minStockMilli: number;
  suggestedMilli: number;
  lastCostCents: number;
}
interface ReorderGroup {
  supplierId: string | null;
  supplierName: string;
  items: ReorderItem[];
  estimatedCostCents: number;
}

export default function InventoryPage() {
  const [tab, setTab] = useState<ViewTab>("deliveries");
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[] | null>(null);
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [reorder, setReorder] = useState<ReorderGroup[] | null>(null);
  const [modal, setModal] = useState<Tab | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [p, s, d, ex, ro] = await Promise.all([
      apiJson<{ products: Product[] }>(await fetch("/api/products?all=1")),
      apiJson<{ suppliers: Supplier[] }>(await fetch("/api/suppliers")),
      apiJson<{ deliveries: Delivery[] }>(await fetch("/api/deliveries")),
      apiJson<{ batches: Batch[] }>(await fetch("/api/expiry?days=30")),
      apiJson<{ suppliers: ReorderGroup[] }>(await fetch("/api/reorder")),
    ]);
    setProducts(p.products);
    setSuppliers(s.suppliers);
    setDeliveries(d.deliveries);
    setBatches(ex.batches);
    setReorder(ro.suppliers);
  }, []);

  async function quickWriteOff(b: Batch) {
    if (!confirm(`Бракуване на „${b.name}" — ${formatQty(b.qtyMilli, UNITS[b.unit].decimals)} ${UNITS[b.unit].label}?`)) {
      return;
    }
    try {
      await apiJson(
        await fetch("/api/writeoffs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reason: `Изтекъл срок на годност${b.batchNumber ? ` (партида ${b.batchNumber})` : ""}`,
            items: [{ productId: b.productId, qtyMilli: b.qtyMilli }],
          }),
        })
      );
      setMessage(`Бракувано: ${b.name}.`);
      void load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Грешка при брак.");
    }
  }

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black">Склад</h1>
        <div className="flex gap-2">
          <button onClick={() => setModal("deliveries")} className="btn-primary text-sm">
            <Truck size={18} /> Нова доставка
          </button>
          <button onClick={() => setModal("stocktake")} className="btn-ghost text-sm">
            <ClipboardText size={18} /> Ревизия
          </button>
          <button onClick={() => setModal("writeoff")} className="btn-ghost text-sm">
            <Trash size={18} /> Брак
          </button>
        </div>
      </div>

      {message && (
        <div className="bg-mint-600/10 border border-mint-600/30 text-mint-600 rounded-xl px-4 py-3 text-sm font-medium">
          {message}
        </div>
      )}

      <div className="flex gap-2">
        {(
          [
            ["deliveries", "Доставки"],
            ["stocktake", "Наличности"],
            ["expiry", "Срок на годност"],
            ["reorder", "За поръчка"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`chip ${tab === key ? "chip-active" : ""}`}
          >
            {label}
            {key === "expiry" && batches && batches.some((b) => b.expired || b.daysLeft <= 7) && (
              <span className="ml-1 size-2 rounded-full bg-coral-600 inline-block" />
            )}
            {key === "reorder" && reorder && reorder.length > 0 && (
              <span className="ml-1 size-2 rounded-full bg-brand-600 inline-block" />
            )}
          </button>
        ))}
      </div>

      {tab === "deliveries" &&
        (deliveries === null ? (
          <Spinner label="Зареждане…" />
        ) : (
          <div className="space-y-3">
            {deliveries.length === 0 && (
              <p className="text-ink-500">Още няма доставки.</p>
            )}
            {deliveries.map((d) => (
              <details key={d.id} className="card p-4 group">
                <summary className="flex items-center justify-between cursor-pointer list-none">
                  <div>
                    <span className="font-bold">{d.supplier.name}</span>
                    <span className="text-ink-400 text-sm ml-2">
                      док. {d.docNumber} · {new Date(d.createdAt).toLocaleString("bg-BG")} · {d.user.name}
                    </span>
                  </div>
                  <span className="font-bold tabular-nums">{formatEur(d.totalCostCents)}</span>
                </summary>
                <table className="w-full text-sm mt-3 border-t border-ink-800 pt-2">
                  <tbody>
                    {d.items.map((it, i) => (
                      <tr key={i} className="border-b border-ink-800/50 last:border-0">
                        <td className="py-1.5">{it.product.name}</td>
                        <td className="py-1.5 text-right tabular-nums">
                          {formatQty(it.qtyMilli, UNITS[it.product.unit].decimals)}{" "}
                          {UNITS[it.product.unit].label}
                        </td>
                        <td className="py-1.5 text-right tabular-nums w-28">
                          {formatEur(it.unitCostCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            ))}
          </div>
        ))}

      {tab === "stocktake" && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-ink-400 text-left border-b border-ink-800">
                <th className="py-3 px-4 font-medium w-16">PLU</th>
                <th className="py-3 px-2 font-medium">Стока</th>
                <th className="py-3 px-4 font-medium text-right">Наличност</th>
                <th className="py-3 px-4 font-medium text-right">Доставна ст-ст</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-b border-ink-800/60 last:border-0">
                  <td className="py-2 px-4 font-mono text-ink-400">{p.plu}</td>
                  <td className="py-2 px-2 font-medium">{p.name}</td>
                  <td className="py-2 px-4 text-right tabular-nums">
                    {formatQty(p.stockMilli, UNITS[p.unit].decimals)} {UNITS[p.unit].label}
                  </td>
                  <td className="py-2 px-4 text-right tabular-nums text-ink-400">
                    {formatEur(Math.round((p.costCents * p.stockMilli) / 1000))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "expiry" &&
        (batches === null ? (
          <Spinner label="Зареждане…" />
        ) : batches.length === 0 ? (
          <div className="card p-10 text-center text-ink-400">
            <Clock size={40} className="mx-auto mb-3 text-brand-600" weight="duotone" />
            Няма партиди с наближаващ срок (следващите 30 дни).
            <p className="text-ink-500 text-sm mt-2">
              Срокът се въвежда при доставка. Списъкът показва доставените партиди по
              ред на изтичане (FEFO).
            </p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-ink-400 text-left border-b border-ink-800">
                  <th className="py-3 px-4 font-medium">Стока</th>
                  <th className="py-3 px-2 font-medium">Партида</th>
                  <th className="py-3 px-2 font-medium">Доставчик</th>
                  <th className="py-3 px-2 font-medium text-right">Количество</th>
                  <th className="py-3 px-2 font-medium">Срок</th>
                  <th className="py-3 px-2 font-medium text-center">Остават</th>
                  <th className="py-3 px-4 font-medium text-right">Действие</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id} className="border-b border-ink-800/60 last:border-0">
                    <td className="py-2.5 px-4 font-medium">
                      <span className="text-ink-500 font-mono text-xs mr-1">{b.plu}</span>
                      {b.name}
                    </td>
                    <td className="py-2.5 px-2 text-ink-400 font-mono text-xs">
                      {b.batchNumber ?? "—"}
                    </td>
                    <td className="py-2.5 px-2 text-ink-400">{b.supplier}</td>
                    <td className="py-2.5 px-2 text-right tabular-nums">
                      {formatQty(b.qtyMilli, UNITS[b.unit].decimals)} {UNITS[b.unit].label}
                    </td>
                    <td className="py-2.5 px-2 tabular-nums">
                      {new Date(b.expiryDate).toLocaleDateString("bg-BG")}
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <Badge tone={b.expired ? "danger" : b.daysLeft <= 7 ? "warning" : "neutral"}>
                        {b.expired ? (
                          <>
                            <WarningCircle size={12} /> изтекъл
                          </>
                        ) : (
                          `${b.daysLeft} дни`
                        )}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        className="btn-danger !py-1.5 !px-3 text-xs"
                        onClick={() => quickWriteOff(b)}
                      >
                        <Trash size={13} /> Бракувай
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {tab === "reorder" &&
        (reorder === null ? (
          <Spinner label="Зареждане…" />
        ) : reorder.length === 0 ? (
          <div className="card p-10 text-center text-ink-400">
            <CheckCircle size={40} className="mx-auto mb-3 text-mint-600" weight="duotone" />
            Нищо за поръчка — всички стоки с зададен минимум са над прага.
          </div>
        ) : (
          <div className="space-y-4">
            {reorder.map((g) => (
              <section key={g.supplierId ?? "none"} className="card overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-ink-800">
                  <h2 className="font-bold flex items-center gap-2">
                    <Truck size={18} className="text-brand-700" weight="duotone" />
                    {g.supplierName}
                  </h2>
                  <span className="text-sm text-ink-400">
                    прибл. стойност:{" "}
                    <b className="text-ink-100 tabular-nums">{formatEur(g.estimatedCostCents)}</b>
                  </span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-ink-400 text-left border-b border-ink-800">
                      <th className="py-2.5 px-5 font-medium">Стока</th>
                      <th className="py-2.5 px-2 font-medium text-right">Наличност</th>
                      <th className="py-2.5 px-2 font-medium text-right">Минимум</th>
                      <th className="py-2.5 px-5 font-medium text-right">Предложи поръчка</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map((it) => (
                      <tr key={it.productId} className="border-b border-ink-800/60 last:border-0">
                        <td className="py-2.5 px-5 font-medium">
                          <span className="text-ink-500 font-mono text-xs mr-1">{it.plu}</span>
                          {it.name}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums">
                          <Badge tone={it.stockMilli <= 0 ? "danger" : "warning"}>
                            {formatQty(it.stockMilli, UNITS[it.unit].decimals)} {UNITS[it.unit].label}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-ink-400">
                          {formatQty(it.minStockMilli, UNITS[it.unit].decimals)}
                        </td>
                        <td className="py-2.5 px-5 text-right tabular-nums font-bold text-brand-700">
                          {formatQty(it.suggestedMilli, UNITS[it.unit].decimals)} {UNITS[it.unit].label}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))}
          </div>
        ))}

      <ItemsModal
        kind={modal}
        products={products}
        suppliers={suppliers}
        onClose={() => setModal(null)}
        onDone={(msg) => {
          setModal(null);
          setMessage(msg);
          void load();
        }}
      />
    </div>
  );
}

interface Line {
  productId: string;
  qty: string;
  cost: string;
}

function ItemsModal({
  kind,
  products,
  suppliers,
  onClose,
  onDone,
}: {
  kind: Tab | null;
  products: Product[];
  suppliers: Supplier[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [lines, setLines] = useState<Line[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [docNumber, setDocNumber] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (kind) {
      setLines([{ productId: products[0]?.id ?? "", qty: "", cost: "" }]);
      setSupplierId(suppliers[0]?.id ?? "");
      setDocNumber("");
      setReason("");
      setError(null);
    }
  }, [kind, products, suppliers]);

  if (!kind) return null;

  const titles: Record<Tab, string> = {
    deliveries: "Нова доставка",
    stocktake: "Ревизия — преброени количества",
    writeoff: "Брак — изписване",
  };

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const items = lines
        .filter((l) => l.productId && l.qty.trim() !== "")
        .map((l) => {
          const qtyMilli = parseQty(l.qty);
          if (isNaN(qtyMilli)) throw new Error("Невалидно количество.");
          return { ...l, qtyMilli };
        });
      if (items.length === 0) throw new Error("Добавете поне един ред.");

      if (kind === "deliveries") {
        if (!supplierId || !docNumber.trim()) throw new Error("Изберете доставчик и номер на документ.");
        await apiJson(
          await fetch("/api/deliveries", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              supplierId,
              docNumber: docNumber.trim(),
              items: items.map((l) => {
                const unitCostCents = parseCents(l.cost || "0");
                if (isNaN(unitCostCents)) throw new Error("Невалидна доставна цена.");
                return { productId: l.productId, qtyMilli: l.qtyMilli, unitCostCents };
              }),
            }),
          })
        );
        onDone("Доставката е заприходена.");
      } else if (kind === "stocktake") {
        await apiJson(
          await fetch("/api/stocktakes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              items: items.map((l) => ({ productId: l.productId, countedMilli: l.qtyMilli })),
            }),
          })
        );
        onDone("Ревизията е записана и наличностите са изравнени.");
      } else {
        if (!reason.trim()) throw new Error("Посочете причина за брака.");
        await apiJson(
          await fetch("/api/writeoffs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              reason: reason.trim(),
              items: items.map((l) => ({ productId: l.productId, qtyMilli: l.qtyMilli })),
            }),
          })
        );
        onDone("Бракът е изписан.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Грешка.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={titles[kind]} wide>
      <div className="space-y-4">
        {kind === "deliveries" && (
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Доставчик">
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="input w-full"
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="№ на фактура / стокова разписка">
              <input
                value={docNumber}
                onChange={(e) => setDocNumber(e.target.value)}
                className="input w-full"
              />
            </Field>
          </div>
        )}
        {kind === "writeoff" && (
          <Field label="Причина (изтекъл срок, повреда…)">
            <input value={reason} onChange={(e) => setReason(e.target.value)} className="input w-full" />
          </Field>
        )}

        <div className="space-y-2">
          {lines.map((l, i) => {
            const product = products.find((p) => p.id === l.productId);
            return (
              <div key={i} className="flex gap-2 items-center">
                <select
                  value={l.productId}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((x, xi) => (xi === i ? { ...x, productId: e.target.value } : x))
                    )
                  }
                  className="input flex-1"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.plu} · {p.name}
                    </option>
                  ))}
                </select>
                <input
                  value={l.qty}
                  onChange={(e) =>
                    setLines((prev) => prev.map((x, xi) => (xi === i ? { ...x, qty: e.target.value } : x)))
                  }
                  placeholder={
                    kind === "stocktake"
                      ? `преброено (${product ? formatQty(product.stockMilli, UNITS[product.unit].decimals) : "?"})`
                      : "количество"
                  }
                  inputMode="decimal"
                  className="input w-44"
                />
                {kind === "deliveries" && (
                  <input
                    value={l.cost}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((x, xi) => (xi === i ? { ...x, cost: e.target.value } : x))
                      )
                    }
                    placeholder="ед. цена €"
                    inputMode="decimal"
                    className="input w-32"
                  />
                )}
                <button
                  className="text-ink-500 hover:text-coral-600 p-1.5"
                  onClick={() => setLines((prev) => prev.filter((_, xi) => xi !== i))}
                  aria-label="Премахни ред"
                >
                  <X size={18} />
                </button>
              </div>
            );
          })}
          <button
            className="btn-ghost text-sm"
            onClick={() =>
              setLines((prev) => [...prev, { productId: products[0]?.id ?? "", qty: "", cost: "" }])
            }
          >
            <Plus size={16} /> Добави ред
          </button>
        </div>

        {error && <p className="text-coral-600 text-sm">{error}</p>}
        <button onClick={save} disabled={busy} className="btn-primary w-full h-12">
          {busy ? "Записва се…" : "Запиши"}
        </button>
      </div>
    </Modal>
  );
}
