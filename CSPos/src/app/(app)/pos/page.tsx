"use client";

// POS екран — работното място на касиера. Принципи:
// • баркод полето винаги е на фокус (скенерът „пише“ и натиска Enter);
// • < 200 ms от скан до ред — локален каталог в паметта + бърз /api/scan;
// • тегловни стоки → модал за тегло (или тегловен баркод 28…);
// • двойно обозначаване EUR/BGN на тоталите (ЗВЕРБ);
// • F9 плащане, F8 клиентска карта, Esc затваря модала.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Barcode,
  MagnifyingGlass,
  Trash,
  Minus,
  Plus,
  CreditCard,
  Money,
  Wallet,
  Scales,
  IdentificationCard,
  Receipt,
  WarningCircle,
  PauseCircle,
  ArrowCounterClockwise,
  Percent,
  PencilSimpleLine,
  Tag,
  Star,
} from "@phosphor-icons/react";
import { Modal, Badge, apiJson } from "@/components/ui";
import { formatBgnFromEur, formatCents, formatEur, formatQty, lineTotalCents, parseQty, applyDiscount } from "@/lib/money";
import { SERVICE_PLU_MIN, UNITS, VAT_GROUPS } from "@/lib/constants";
import { bestPromotion, matchingMxn, type ActivePromotion } from "@/lib/promotions";

interface Product {
  id: string;
  plu: number;
  name: string;
  categoryId: string;
  unit: "PCS" | "KG";
  vatGroup: keyof typeof VAT_GROUPS;
  priceCents: number;
  stockMilli: number;
  favorite: boolean;
}

interface Category {
  id: string;
  name: string;
  color: string;
  sort: number;
}

interface CartLine {
  product: Product;
  qtyMilli: number;
  discountPermille: number;
  priceLockedCents?: number;
}

interface Customer {
  id: string;
  cardNumber: string;
  name: string;
  discountPermille: number;
  balanceCents: number;
}

/** Редова сума с промоциите (PERCENT/PRICE сменят цената, MxN дава отстъпка). */
function lineTotal(l: CartLine, promos: ActivePromotion[]): number {
  if (l.priceLockedCents !== undefined) return applyDiscount(l.priceLockedCents, l.discountPermille);
  const promo = bestPromotion(l.product, l.qtyMilli, promos, new Date());
  const discount = Math.max(l.discountPermille, promo.discountPermille);
  return applyDiscount(lineTotalCents(promo.unitCents, l.qtyMilli), discount);
}

export default function PosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | "fav">("fav");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [dualDisplay, setDualDisplay] = useState(true);
  const [hasShift, setHasShift] = useState<boolean | null>(null);
  const [promos, setPromos] = useState<ActivePromotion[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [weighing, setWeighing] = useState<Product | null>(null);
  const [editingQty, setEditingQty] = useState<number | null>(null); // индекс на ред в бона
  const [heldCarts, setHeldCarts] = useState<Array<{ id: string; label: string; lines: CartLine[] }>>([]);
  const [recallOpen, setRecallOpen] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [freeSaleOpen, setFreeSaleOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [cardModal, setCardModal] = useState(false);
  const [receiptText, setReceiptText] = useState<string | null>(null);

  const scanRef = useRef<HTMLInputElement>(null);
  const [scanValue, setScanValue] = useState("");

  // първоначално зареждане
  useEffect(() => {
    void (async () => {
      try {
        const [p, c, sh, st, pr] = await Promise.all([
          apiJson<{ products: Product[] }>(await fetch("/api/products")),
          apiJson<{ categories: Category[] }>(await fetch("/api/categories")),
          apiJson<{ shift: unknown }>(await fetch("/api/shifts")),
          apiJson<{ display: { dualDisplay: boolean } }>(await fetch("/api/settings")).catch(
            () => ({ display: { dualDisplay: true } })
          ),
          apiJson<{ promotions: ActivePromotion[] }>(await fetch("/api/promotions/active")).catch(
            () => ({ promotions: [] })
          ),
        ]);
        setProducts(p.products);
        setCategories(c.categories);
        setHasShift(Boolean(sh.shift));
        setDualDisplay(st.display.dualDisplay);
        setPromos(pr.promotions);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Грешка при зареждане.");
      }
    })();
  }, []);

  // задържани бонове — пазят се локално на касата (преживяват презареждане)
  useEffect(() => {
    try {
      const raw = localStorage.getItem("cspos.heldCarts");
      if (raw) setHeldCarts(JSON.parse(raw));
    } catch {
      /* повреден запис — игнорирай */
    }
  }, []);
  useEffect(() => {
    localStorage.setItem("cspos.heldCarts", JSON.stringify(heldCarts));
  }, [heldCarts]);

  const holdCart = useCallback(() => {
    if (cart.length === 0) return;
    const totalNow = cart.reduce((a, l) => a + lineTotal(l, promos), 0);
    setHeldCarts((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        label: `${new Date().toLocaleTimeString("bg-BG")} · ${cart.length} арт. · ${formatEur(totalNow)}`,
        lines: cart,
      },
    ]);
    setCart([]);
    setCustomer(null);
  }, [cart, promos]);

  // фокусът се връща на скан полето
  useEffect(() => {
    const t = setInterval(() => {
      const active = document.activeElement;
      const isTyping =
        active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
      if (!isTyping && !payOpen && !weighing && !receiptText && !cardModal) {
        scanRef.current?.focus();
      }
    }, 800);
    return () => clearInterval(t);
  }, [payOpen, weighing, receiptText, cardModal]);

  const addToCart = useCallback((product: Product, qtyMilli: number, priceLockedCents?: number) => {
    setCart((prev) => {
      // еднакви стоки на брой се сумират; тегловните и заключените цени — отделни редове
      if (product.unit === "PCS" && priceLockedCents === undefined) {
        const idx = prev.findIndex(
          (l) => l.product.id === product.id && l.priceLockedCents === undefined
        );
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx]!, qtyMilli: next[idx]!.qtyMilli + qtyMilli };
          return next;
        }
      }
      return [...prev, { product, qtyMilli, discountPermille: 0, priceLockedCents }];
    });
    setError(null);
  }, []);

  const handleScan = useCallback(
    async (code: string) => {
      if (!code.trim()) return;
      setScanValue("");
      try {
        const r = await apiJson<{
          product: Product;
          qtyMilli: number;
          priceLockedCents?: number;
        }>(await fetch(`/api/scan?code=${encodeURIComponent(code.trim())}`));
        if (r.product.unit === "KG" && r.qtyMilli === 1000 && r.priceLockedCents === undefined) {
          // тегловна стока без тегло в баркода → искаме тегло
          setWeighing(r.product);
        } else {
          addToCart(r.product, r.qtyMilli, r.priceLockedCents);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Кодът не е намерен.");
      }
    },
    [addToCart]
  );

  const total = useMemo(() => cart.reduce((a, l) => a + lineTotal(l, promos), 0), [cart, promos]);
  const vatTotal = useMemo(() => {
    // информативно на екрана; сървърът смята официално
    return cart.reduce((a, l) => {
      const rate = VAT_GROUPS[l.product.vatGroup].defaultRatePermille;
      const t = lineTotal(l, promos);
      return a + Math.round((t * rate) / (1000 + rate));
    }, 0);
  }, [cart, promos]);

  // клавишни комбинации
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F9") {
        e.preventDefault();
        if (cart.length > 0) setPayOpen(true);
      } else if (e.key === "F8") {
        e.preventDefault();
        setCardModal(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cart.length]);

  const visibleProducts = useMemo(() => {
    // служебните артикули (свободна продажба) не се показват в каталога —
    // достъпни са през бутона „свободна продажба“ и през сканиране
    let list = products.filter((p) => p.plu < SERVICE_PLU_MIN);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (p) => p.name.toLowerCase().includes(q) || String(p.plu).includes(q)
      );
    } else if (activeCategory === "fav") {
      list = list.filter((p) => p.favorite);
    } else {
      list = list.filter((p) => p.categoryId === activeCategory);
    }
    return list.slice(0, 60);
  }, [products, search, activeCategory]);

  // анулирането преди фискализация се одитира (както в Mistral/СУПТО практиката)
  const logCancel = useCallback((action: "LINE_CANCELED" | "CART_CLEARED", detail: object) => {
    void fetch("/api/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, detail }),
    }).catch(() => undefined);
  }, []);

  const applyCustomer = useCallback((c: Customer | null) => {
    setCustomer(c);
    setCart((prev) =>
      prev.map((l) => ({ ...l, discountPermille: c?.discountPermille ?? 0 }))
    );
  }, []);

  if (hasShift === false) {
    return <OpenShiftGate onOpened={() => setHasShift(true)} />;
  }

  return (
    <div className="flex gap-5 h-[calc(100vh-7rem)] -m-2 p-2">
      {/* ЛЯВО: каталог */}
      <section className="flex-1 min-w-0 flex flex-col gap-4">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Barcode
              size={22}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-600"
            />
            <input
              ref={scanRef}
              autoFocus
              value={scanValue}
              onChange={(e) => setScanValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleScan(scanValue);
              }}
              placeholder="Сканирай баркод или въведи PLU / тегловен код 28…"
              className="input w-full !pl-11 h-12 text-lg font-mono"
            />
          </div>
          <div className="relative w-64">
            <MagnifyingGlass
              size={20}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Търсене по име…"
              className="input w-full !pl-10 h-12"
            />
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-coral-600 bg-coral-600/10 border border-coral-600/30 rounded-xl px-4 py-2.5 text-sm font-medium animate-fade-up">
            <WarningCircle size={18} /> {error}
          </div>
        )}

        <div className="flex gap-2 overflow-x-auto pb-1 shrink-0">
          <button
            onClick={() => {
              setActiveCategory("fav");
              setSearch("");
            }}
            className={`chip shrink-0 inline-flex items-center gap-1.5 ${activeCategory === "fav" && !search ? "chip-active !text-brand-700" : ""}`}
          >
            <Star size={15} weight="fill" className="text-brand-500" /> Бързи
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setActiveCategory(c.id);
                setSearch("");
              }}
              className={`chip shrink-0 ${activeCategory === c.id && !search ? "chip-active" : ""}`}
            >
              <span
                className="size-2 rounded-full shrink-0"
                style={{ backgroundColor: c.color, boxShadow: `0 0 8px ${c.color}88` }}
              />
              {c.name}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-3 overflow-y-auto content-start flex-1 pr-1">
          {visibleProducts.map((p) => {
            const cat = categories.find((c) => c.id === p.categoryId);
            const low = p.stockMilli <= 0;
            // промо цена за 1 единица (информативно; сървърът смята официално)
            const promoUnit = bestPromotion(p, 1000, promos, new Date());
            const hasPromo = promoUnit.promotion !== null && promoUnit.unitCents < p.priceCents;
            const mxn = matchingMxn(p, promos, new Date());
            return (
              <button
                key={p.id}
                onClick={() => (p.unit === "KG" ? setWeighing(p) : addToCart(p, 1000))}
                className="card glass-lift !rounded-2xl p-3.5 text-left hover:bg-white/[0.9] group relative overflow-hidden"
              >
                {mxn ? (
                  <span className="absolute top-2.5 right-2.5 inline-flex items-center gap-0.5 rounded-full bg-coral-600 text-white text-[10px] font-bold px-1.5 py-0.5">
                    <Tag size={10} weight="fill" /> {mxn.buyQty} ЗА {mxn.payQty}
                  </span>
                ) : hasPromo ? (
                  <span className="absolute top-2.5 right-2.5 inline-flex items-center gap-0.5 rounded-full bg-coral-600 text-white text-[10px] font-bold px-1.5 py-0.5">
                    <Tag size={10} weight="fill" /> ПРОМО
                  </span>
                ) : (
                  <span
                    className="absolute top-3 right-3 size-2 rounded-full"
                    style={{
                      backgroundColor: cat?.color ?? "#4a5a7d",
                      boxShadow: `0 0 10px ${cat?.color ?? "#4a5a7d"}99`,
                    }}
                  />
                )}
                <div className={`font-semibold leading-snug line-clamp-2 min-h-[2.6em] text-[15px] ${hasPromo || mxn ? "pr-16" : "pr-4"}`}>
                  {p.name}
                </div>
                <div className="mt-2 flex items-end justify-between">
                  <div>
                    <div className="font-black text-lg text-brand-700 flex items-baseline gap-1.5">
                      {formatEur(hasPromo ? promoUnit.unitCents : p.priceCents)}
                      {hasPromo && (
                        <span className="text-[11px] font-medium text-ink-500 line-through">
                          {formatEur(p.priceCents)}
                        </span>
                      )}
                    </div>
                    {dualDisplay && (
                      <div className="text-[12px] font-semibold text-ink-400 tabular-nums">
                        {formatBgnFromEur(hasPromo ? promoUnit.unitCents : p.priceCents)}
                      </div>
                    )}
                    <div className="text-[11px] text-ink-500">
                      {p.unit === "KG" ? "за кг" : "за бр."} · PLU {p.plu}
                    </div>
                  </div>
                  {p.unit === "KG" ? (
                    <Scales size={20} className="text-ink-500 group-hover:text-brand-700" />
                  ) : low ? (
                    <Badge tone="danger">няма</Badge>
                  ) : null}
                </div>
              </button>
            );
          })}
          {visibleProducts.length === 0 && (
            <div className="col-span-full text-center text-ink-500 py-16">
              Няма стоки по този филтър.
            </div>
          )}
        </div>
      </section>

      {/* ДЯСНО: количка */}
      <section className="w-[380px] xl:w-[420px] shrink-0 card flex flex-col">
        <div className="px-4 py-3 border-b border-ink-800 flex items-center justify-between">
          <h2 className="font-bold text-lg">Бон</h2>
          <div className="flex items-center gap-1.5">
            <button
              onClick={holdCart}
              disabled={cart.length === 0}
              className="btn-ghost !px-2 !py-1.5 text-xs"
              title="Задръж бона (обслужи друг клиент)"
            >
              <PauseCircle size={16} />
            </button>
            <button
              onClick={() => setRecallOpen(true)}
              disabled={heldCarts.length === 0}
              className="btn-ghost !px-2 !py-1.5 text-xs relative"
              title="Върни задържан бон"
            >
              <ArrowCounterClockwise size={16} />
              {heldCarts.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 size-4 rounded-full bg-brand-600 text-[#231a05] text-[10px] font-bold flex items-center justify-center">
                  {heldCarts.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setDiscountOpen(true)}
              disabled={cart.length === 0}
              className="btn-ghost !px-2 !py-1.5 text-xs"
              title="Отстъпка на целия бон"
            >
              <Percent size={16} />
            </button>
            <button
              onClick={() => setFreeSaleOpen(true)}
              className="btn-ghost !px-2 !py-1.5 text-xs"
              title="Свободна продажба (ръчна цена)"
            >
              <PencilSimpleLine size={16} />
            </button>
            <button
              onClick={() => setCardModal(true)}
              className={`btn !px-2.5 !py-1.5 text-xs ${customer ? "bg-mint-600/20 text-mint-600" : "bg-ink-800 text-ink-300"}`}
              title="Клиентска карта (F8)"
            >
              <IdentificationCard size={16} />
              {customer ? customer.name : "Карта"}
            </button>
            <button
              onClick={() => {
                if (cart.length > 0) {
                  logCancel("CART_CLEARED", {
                    items: cart.map((l) => ({ name: l.product.name, qtyMilli: l.qtyMilli })),
                  });
                }
                setCart([]);
                applyCustomer(null);
              }}
              disabled={cart.length === 0}
              className="btn-ghost !px-2.5 !py-1.5 text-xs"
            >
              <Trash size={16} /> Изчисти
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-ink-800/60">
          {cart.length === 0 && (
            <div className="text-center text-ink-500 py-20 px-6">
              <Receipt size={44} className="mx-auto mb-3 opacity-40" />
              Сканирайте стока или я изберете от каталога.
            </div>
          )}
          {cart.map((l, i) => (
            <div key={i} className="px-4 py-2.5 flex items-center gap-2 animate-fade-up">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{l.product.name}</div>
                <div className="text-xs text-ink-400">
                  {l.priceLockedCents !== undefined ? (
                    <span>ръчна цена</span>
                  ) : (
                    <>
                      <button
                        className="underline decoration-dotted underline-offset-2 hover:text-brand-700 transition-colors"
                        onClick={() => setEditingQty(i)}
                        title="Промени количеството"
                      >
                        {formatQty(l.qtyMilli, UNITS[l.product.unit].decimals)}{" "}
                        {UNITS[l.product.unit].label}
                      </button>{" "}
                      × {formatCents(l.product.priceCents)}
                    </>
                  )}
                  {l.discountPermille > 0 && (
                    <span className="text-mint-600"> −{(l.discountPermille / 10).toFixed(1)}%</span>
                  )}
                  <span className="ml-1 text-ink-600">
                    [{VAT_GROUPS[l.product.vatGroup].letter}]
                  </span>
                </div>
              </div>
              {l.product.unit === "PCS" && (
                <div className="flex items-center gap-1">
                  <button
                    className="btn-ghost !p-1.5"
                    onClick={() =>
                      setCart((prev) =>
                        prev
                          .map((x, xi) =>
                            xi === i ? { ...x, qtyMilli: x.qtyMilli - 1000 } : x
                          )
                          .filter((x) => x.qtyMilli > 0)
                      )
                    }
                  >
                    <Minus size={14} weight="bold" />
                  </button>
                  <button
                    className="btn-ghost !p-1.5"
                    onClick={() =>
                      setCart((prev) =>
                        prev.map((x, xi) =>
                          xi === i ? { ...x, qtyMilli: x.qtyMilli + 1000 } : x
                        )
                      )
                    }
                  >
                    <Plus size={14} weight="bold" />
                  </button>
                </div>
              )}
              <div className="w-24 text-right tabular-nums leading-tight">
                <div className="font-bold">{formatEur(lineTotal(l, promos))}</div>
                {dualDisplay && (
                  <div className="text-[11px] text-ink-500">{formatBgnFromEur(lineTotal(l, promos))}</div>
                )}
              </div>
              <button
                className="text-ink-500 hover:text-coral-600 p-1"
                onClick={() => {
                  logCancel("LINE_CANCELED", {
                    name: l.product.name,
                    qtyMilli: l.qtyMilli,
                    totalCents: lineTotal(l, promos),
                  });
                  setCart((prev) => prev.filter((_, xi) => xi !== i));
                }}
                aria-label="Премахни"
              >
                <Trash size={16} />
              </button>
            </div>
          ))}
        </div>

        <div className="border-t border-ink-800 p-4 space-y-3">
          <div className="flex justify-between text-sm text-ink-400">
            <span>ДДС (вкл.)</span>
            <span className="tabular-nums">{formatEur(vatTotal)}</span>
          </div>
          <div className="flex items-end justify-between">
            <span className="text-ink-300 font-semibold">ОБЩО</span>
            <div className="text-right">
              <div className="text-3xl font-black gradient-num tabular-nums">
                {formatEur(total)}
              </div>
              {dualDisplay && (
                <div className="text-base font-semibold text-ink-400 tabular-nums">
                  {formatBgnFromEur(total)}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={() => setPayOpen(true)}
            disabled={cart.length === 0}
            className="btn-primary w-full h-14 text-xl"
          >
            <Wallet size={26} weight="duotone" /> Плащане (F9)
          </button>
        </div>
      </section>

      {/* Модали */}
      <RecallModal
        open={recallOpen}
        held={heldCarts}
        cartEmpty={cart.length === 0}
        onClose={() => setRecallOpen(false)}
        onRecall={(id) => {
          const h = heldCarts.find((x) => x.id === id);
          if (!h) return;
          setCart(h.lines);
          setHeldCarts((prev) => prev.filter((x) => x.id !== id));
          setRecallOpen(false);
        }}
        onDrop={(id) => setHeldCarts((prev) => prev.filter((x) => x.id !== id))}
      />
      <DiscountModal
        open={discountOpen}
        totalCents={total}
        onClose={() => setDiscountOpen(false)}
        onApply={(permille) => {
          setCart((prev) => prev.map((l) => ({ ...l, discountPermille: permille })));
          setDiscountOpen(false);
        }}
      />
      <FreeSaleModal
        open={freeSaleOpen}
        products={products}
        onClose={() => setFreeSaleOpen(false)}
        onAdd={(product, amountCents) => {
          addToCart(product, 1000, amountCents);
          setFreeSaleOpen(false);
        }}
      />
      <QtyModal
        line={editingQty !== null ? cart[editingQty] ?? null : null}
        onClose={() => setEditingQty(null)}
        onConfirm={(qtyMilli) => {
          setCart((prev) =>
            prev
              .map((x, xi) => (xi === editingQty ? { ...x, qtyMilli } : x))
              .filter((x) => x.qtyMilli > 0)
          );
          setEditingQty(null);
        }}
      />
      <WeighModal
        product={weighing}
        onClose={() => setWeighing(null)}
        onConfirm={(p, qty) => {
          addToCart(p, qty);
          setWeighing(null);
        }}
      />
      <PaymentModal
        open={payOpen}
        totalCents={total}
        dualDisplay={dualDisplay}
        onClose={() => setPayOpen(false)}
        cart={cart}
        customer={customer}
        onDone={(text) => {
          setPayOpen(false);
          setCart([]);
          applyCustomer(null);
          setReceiptText(text);
          void fetch("/api/products")
            .then((r) => r.json())
            .then((j) => setProducts(j.products));
        }}
      />
      <CustomerModal
        open={cardModal}
        onClose={() => setCardModal(false)}
        onFound={(c) => {
          applyCustomer(c);
          setCardModal(false);
        }}
        onClear={() => {
          applyCustomer(null);
          setCardModal(false);
        }}
        current={customer}
      />
      <Modal
        open={receiptText !== null}
        onClose={() => setReceiptText(null)}
        title="Фискален бон"
      >
        <pre className="font-mono text-[13px] leading-relaxed bg-ink-950 rounded-xl p-4 overflow-x-auto whitespace-pre">
          {receiptText}
        </pre>
        <button className="btn-primary w-full mt-4 h-12" onClick={() => setReceiptText(null)}>
          Нова продажба
        </button>
      </Modal>
    </div>
  );
}

function OpenShiftGate({ onOpened }: { onOpened: () => void }) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const cents = amount.trim() === "" ? 0 : Math.round(parseFloat(amount.replace(",", ".")) * 100);
      if (isNaN(cents) || cents < 0) throw new Error("Невалидна сума.");
      await apiJson(
        await fetch("/api/shifts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "open", openingCashCents: cents }),
        })
      );
      onOpened();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Грешка.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-md mx-auto mt-24 card p-8 text-center animate-fade-up">
      <Money size={44} className="mx-auto text-brand-700 mb-4" weight="duotone" />
      <h1 className="text-2xl font-black mb-2">Отваряне на смяна</h1>
      <p className="text-ink-400 mb-6">
        Въведете началната касова наличност — тя ще бъде регистрирана като
        „служебно въведени суми“ във фискалното устройство.
      </p>
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="0,00 €"
        inputMode="decimal"
        className="input w-full h-14 text-center text-2xl font-bold mb-4"
      />
      {error && <p className="text-coral-600 text-sm mb-3">{error}</p>}
      <button onClick={open} disabled={busy} className="btn-primary w-full h-13 py-3.5 text-lg">
        Отвори смяната
      </button>
    </div>
  );
}

function WeighModal({
  product,
  onClose,
  onConfirm,
}: {
  product: Product | null;
  onClose: () => void;
  onConfirm: (p: Product, qtyMilli: number) => void;
}) {
  const [value, setValue] = useState("");
  useEffect(() => setValue(""), [product]);
  if (!product) return null;
  const qty = parseQty(value);
  const valid = !isNaN(qty) && qty > 0;
  return (
    <Modal open onClose={onClose} title={`Тегло — ${product.name}`}>
      <div className="space-y-4">
        <p className="text-ink-400 text-sm">
          Цена: <b className="text-ink-100">{formatEur(product.priceCents)}/кг</b>. Въведете
          теглото в килограми (напр. 0,450) или сканирайте тегловния етикет от везната.
        </p>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && valid) onConfirm(product, qty);
          }}
          placeholder="0,000 кг"
          inputMode="decimal"
          className="input w-full h-14 text-center text-2xl font-bold"
        />
        {valid && (
          <div className="text-center text-lg">
            = <b className="text-brand-700">{formatEur(lineTotalCents(product.priceCents, qty))}</b>
          </div>
        )}
        <button
          disabled={!valid}
          onClick={() => onConfirm(product, qty)}
          className="btn-primary w-full h-12"
        >
          Добави
        </button>
      </div>
    </Modal>
  );
}

function QtyModal({
  line,
  onClose,
  onConfirm,
}: {
  line: CartLine | null;
  onClose: () => void;
  onConfirm: (qtyMilli: number) => void;
}) {
  const [value, setValue] = useState("");
  useEffect(() => {
    if (line) {
      setValue(formatQty(line.qtyMilli, UNITS[line.product.unit].decimals).replace(",", "."));
    }
  }, [line]);
  if (!line) return null;

  const isKg = line.product.unit === "KG";
  const qty = parseQty(value);
  const valid = !isNaN(qty) && qty > 0 && (isKg || qty % 1000 === 0);

  return (
    <Modal open onClose={onClose} title={`Количество — ${line.product.name}`}>
      <div className="space-y-4">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (e.key === "Enter" && valid) onConfirm(qty);
          }}
          placeholder={isKg ? "0,000 кг" : "брой"}
          inputMode="decimal"
          className="input w-full h-14 text-center text-2xl font-bold"
        />
        {!isKg && (
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 5, 10].map((n) => (
              <button key={n} className="btn-ghost h-11" onClick={() => onConfirm(n * 1000)}>
                {n}
              </button>
            ))}
          </div>
        )}
        {valid && (
          <div className="text-center text-lg">
            = <b className="text-brand-700">{formatEur(lineTotalCents(line.product.priceCents, qty))}</b>
          </div>
        )}
        {!valid && value.trim() !== "" && (
          <p className="text-coral-600 text-sm text-center">
            {isKg ? "Невалидно тегло (напр. 0,450)." : "Въведете цял брой."}
          </p>
        )}
        <div className="flex gap-2">
          <button className="btn-danger flex-1 h-12" onClick={() => onConfirm(0)}>
            Премахни реда
          </button>
          <button disabled={!valid} onClick={() => onConfirm(qty)} className="btn-primary flex-1 h-12">
            Запази
          </button>
        </div>
      </div>
    </Modal>
  );
}

function PaymentModal({
  open,
  totalCents,
  dualDisplay,
  cart,
  customer,
  onClose,
  onDone,
}: {
  open: boolean;
  totalCents: number;
  dualDisplay: boolean;
  cart: CartLine[];
  customer: Customer | null;
  onClose: () => void;
  onDone: (receiptText: string | null) => void;
}) {
  const [mode, setMode] = useState<"CASH" | "CARD" | "MIXED" | "CREDIT">("CASH");
  const [given, setGiven] = useState("");
  const [cardPart, setCardPart] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMode("CASH");
      setGiven("");
      setCardPart("");
      setError(null);
    }
  }, [open]);

  const givenCents = given.trim() === "" ? 0 : Math.round(parseFloat(given.replace(",", ".")) * 100) || 0;
  const cardCents =
    mode === "CARD"
      ? totalCents
      : mode === "MIXED"
        ? Math.round(parseFloat(cardPart.replace(",", ".")) * 100) || 0
        : 0;
  const cashDue = totalCents - cardCents;
  const change = mode === "CASH" || mode === "MIXED" ? givenCents - cashDue : 0;

  const canPay =
    (mode === "CASH" && givenCents >= totalCents) ||
    mode === "CARD" ||
    (mode === "CREDIT" && customer !== null) ||
    (mode === "MIXED" && cardCents > 0 && cardCents < totalCents && givenCents >= cashDue);

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      const r = await apiJson<{ receiptText: string | null }>(
        await fetch("/api/sales", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: cart.map((l) => ({
              productId: l.product.id,
              qtyMilli: l.qtyMilli,
              discountPermille: l.discountPermille,
              ...(l.priceLockedCents !== undefined
                ? { priceLockedCents: l.priceLockedCents }
                : {}),
            })),
            payment: {
              type: mode,
              cashCents: mode === "CARD" || mode === "CREDIT" ? 0 : givenCents,
              cardCents: mode === "CREDIT" ? 0 : cardCents,
            },
            ...(customer ? { customerCard: customer.cardNumber } : {}),
          }),
        })
      );
      onDone(r.receiptText);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Грешка при плащане.");
    } finally {
      setBusy(false);
    }
  }

  const quick = [500, 1000, 2000, 5000].filter((q) => q >= totalCents).slice(0, 3);

  return (
    <Modal open={open} onClose={() => !busy && onClose()} title="Плащане">
      <div className="space-y-5">
        <div className="text-center">
          <div className="text-4xl font-black gradient-num tabular-nums">
            {formatEur(totalCents)}
          </div>
          {dualDisplay && (
            <div className="text-ink-400 tabular-nums mt-1">
              {formatBgnFromEur(totalCents)} · курс 1,95583
            </div>
          )}
        </div>

        <div className="grid grid-cols-4 gap-2">
          {(
            [
              ["CASH", "В брой", <Money key="m" size={22} />],
              ["CARD", "С карта", <CreditCard key="c" size={22} />],
              ["MIXED", "Смесено", <Wallet key="w" size={22} />],
              ["CREDIT", "Вересия", <IdentificationCard key="v" size={22} />],
            ] as const
          ).map(([key, label, icon]) => (
            <button
              key={key}
              onClick={() => setMode(key)}
              className={`btn h-14 flex-col !gap-1 text-sm ${
                mode === key ? "bg-brand-500 text-[#231a05]" : "bg-ink-800 text-ink-300"
              }`}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>

        {mode === "MIXED" && (
          <div>
            <label className="text-sm text-ink-400 block mb-1.5">Сума с карта</label>
            <input
              value={cardPart}
              onChange={(e) => setCardPart(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
              className="input w-full h-12 text-lg font-bold text-center"
            />
          </div>
        )}

        {(mode === "CASH" || mode === "MIXED") && (
          <div>
            <label className="text-sm text-ink-400 block mb-1.5">
              Получено в брой {mode === "MIXED" && `(дължимо ${formatEur(Math.max(cashDue, 0))})`}
            </label>
            <input
              autoFocus
              value={given}
              onChange={(e) => setGiven(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canPay) void pay();
              }}
              inputMode="decimal"
              placeholder="0,00"
              className="input w-full h-12 text-lg font-bold text-center"
            />
            <div className="flex gap-2 mt-2">
              <button
                className="btn-ghost flex-1 !py-2 text-sm"
                onClick={() => setGiven(formatCents(Math.max(cashDue, 0)).replace(",", "."))}
              >
                Точно
              </button>
              {quick.map((q) => (
                <button
                  key={q}
                  className="btn-ghost flex-1 !py-2 text-sm"
                  onClick={() => setGiven(String(q / 100))}
                >
                  {q / 100} €
                </button>
              ))}
            </div>
            {change >= 0 && givenCents > 0 && (
              <div className="mt-3 text-center text-lg">
                Ресто: <b className="text-mint-600 tabular-nums">{formatEur(change)}</b>
                {dualDisplay && change > 0 && (
                  <span className="text-ink-500 text-sm"> ({formatBgnFromEur(change)})</span>
                )}
              </div>
            )}
          </div>
        )}

        {mode === "CARD" && (
          <p className="text-center text-ink-400 text-sm">
            Терминалът ще поиска картата при потвърждение.
          </p>
        )}

        {mode === "CREDIT" &&
          (customer ? (
            <p className="text-center text-ink-400 text-sm">
              Задължението се записва на <b className="text-ink-100">{customer.name}</b> (карта{" "}
              {customer.cardNumber}). Издава се фискален бон с плащане „отложено плащане“.
            </p>
          ) : (
            <p className="text-center text-coral-600 text-sm font-medium">
              Вересия изисква клиентска карта — добавете я с F8 преди плащането.
            </p>
          ))}

        {error && (
          <p className="text-coral-600 text-sm text-center font-medium">{error}</p>
        )}

        <button disabled={!canPay || busy} onClick={pay} className="btn-success w-full h-14 text-lg">
          {busy ? "Обработва се…" : "Потвърди и издай бон"}
        </button>
      </div>
    </Modal>
  );
}

function CustomerModal({
  open,
  onClose,
  onFound,
  onClear,
  current,
}: {
  open: boolean;
  onClose: () => void;
  onFound: (c: Customer) => void;
  onClear: () => void;
  current: Customer | null;
}) {
  const [card, setCard] = useState("");
  const [settle, setSettle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCard("");
      setSettle("");
      setError(null);
      setInfo(null);
    }
  }, [open]);

  async function settleDebt() {
    if (!current) return;
    const cents = Math.round(parseFloat(settle.replace(",", ".")) * 100);
    if (isNaN(cents) || cents <= 0) {
      setError("Невалидна сума за погасяване.");
      return;
    }
    try {
      const r = await apiJson<{ customer: Customer }>(
        await fetch("/api/customers/settle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customerId: current.id, amountCents: cents }),
        })
      );
      onFound(r.customer); // опреснява баланса
      setSettle("");
      setError(null);
      setInfo("Погасено. Печата се служебен бон.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Грешка при погасяване.");
    }
  }

  async function lookup() {
    try {
      const r = await apiJson<{ customer: Customer }>(
        await fetch(`/api/customers?card=${encodeURIComponent(card.trim())}`)
      );
      onFound(r.customer);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Картата не е намерена.");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Клиентска карта">
      <div className="space-y-4">
        {current && (
          <div className="flex items-center justify-between bg-mint-600/10 border border-mint-600/30 rounded-xl px-4 py-3">
            <div>
              <div className="font-semibold">{current.name}</div>
              <div className="text-xs text-ink-400">
                карта {current.cardNumber} · отстъпка {(current.discountPermille / 10).toFixed(1)}%
              </div>
              {current.balanceCents > 0 && (
                <div className="text-xs font-semibold text-coral-600 mt-0.5">
                  вересия: {formatEur(current.balanceCents)}
                </div>
              )}
            </div>
            <button className="btn-danger !py-1.5 !px-3 text-sm" onClick={onClear}>
              Премахни
            </button>
          </div>
        )}
        {current && current.balanceCents > 0 && (
          <div className="flex gap-2">
            <input
              value={settle}
              onChange={(e) => setSettle(e.target.value)}
              inputMode="decimal"
              placeholder={`до ${formatEur(current.balanceCents)}`}
              className="input flex-1 h-11"
            />
            <button className="btn-success h-11 px-4" onClick={settleDebt}>
              Погаси
            </button>
          </div>
        )}
        {info && <p className="text-mint-600 text-sm font-medium">{info}</p>}
        <input
          autoFocus
          value={card}
          onChange={(e) => setCard(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && card.trim()) void lookup();
          }}
          placeholder="Сканирай / въведи номер на карта"
          className="input w-full h-12 font-mono"
        />
        {error && <p className="text-coral-600 text-sm">{error}</p>}
        <button disabled={!card.trim()} onClick={lookup} className="btn-primary w-full h-11">
          Търси
        </button>
        <p className="text-ink-500 text-xs">Демо карта: 1000001 (3% отстъпка)</p>
      </div>
    </Modal>
  );
}

function RecallModal({
  open,
  held,
  cartEmpty,
  onClose,
  onRecall,
  onDrop,
}: {
  open: boolean;
  held: Array<{ id: string; label: string; lines: CartLine[] }>;
  cartEmpty: boolean;
  onClose: () => void;
  onRecall: (id: string) => void;
  onDrop: (id: string) => void;
}) {
  if (!open) return null;
  return (
    <Modal open onClose={onClose} title="Задържани бонове">
      <div className="space-y-2">
        {!cartEmpty && (
          <p className="text-brand-700 text-sm font-medium">
            Първо приключете или задръжте текущия бон, за да върнете друг.
          </p>
        )}
        {held.length === 0 && <p className="text-ink-500 text-sm">Няма задържани бонове.</p>}
        {held.map((h) => (
          <div key={h.id} className="flex items-center gap-2">
            <button
              disabled={!cartEmpty}
              onClick={() => onRecall(h.id)}
              className="btn-ghost flex-1 !justify-start h-12"
            >
              <ArrowCounterClockwise size={18} className="text-brand-700" />
              {h.label}
            </button>
            <button
              className="text-ink-500 hover:text-coral-600 p-2"
              onClick={() => onDrop(h.id)}
              title="Изхвърли задържания бон"
            >
              <Trash size={16} />
            </button>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function DiscountModal({
  open,
  totalCents,
  onClose,
  onApply,
}: {
  open: boolean;
  totalCents: number;
  onClose: () => void;
  onApply: (permille: number) => void;
}) {
  const [value, setValue] = useState("");
  useEffect(() => {
    if (open) setValue("");
  }, [open]);
  if (!open) return null;

  const pct = parseFloat(value.replace(",", "."));
  const valid = !isNaN(pct) && pct >= 0 && pct <= 99.9;
  const permille = valid ? Math.round(pct * 10) : 0;

  return (
    <Modal open onClose={onClose} title="Отстъпка на целия бон">
      <div className="space-y-4">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && valid) onApply(permille);
          }}
          placeholder="% отстъпка"
          inputMode="decimal"
          className="input w-full h-14 text-center text-2xl font-bold"
        />
        <div className="grid grid-cols-4 gap-2">
          {[5, 10, 15, 20].map((n) => (
            <button key={n} className="btn-ghost h-11" onClick={() => onApply(n * 10)}>
              {n}%
            </button>
          ))}
        </div>
        {valid && pct > 0 && (
          <div className="text-center text-lg">
            Нова сума:{" "}
            <b className="text-brand-700">{formatEur(applyDiscount(totalCents, permille))}</b>
          </div>
        )}
        <p className="text-xs text-ink-500">
          Отстъпката се прилага на всеки ред и се вижда на фискалния бон. Записва се в
          одиторския дневник към продажбата.
        </p>
        <div className="flex gap-2">
          <button className="btn-ghost flex-1 h-12" onClick={() => onApply(0)}>
            Премахни отстъпката
          </button>
          <button disabled={!valid} className="btn-primary flex-1 h-12" onClick={() => onApply(permille)}>
            Приложи
          </button>
        </div>
      </div>
    </Modal>
  );
}

function FreeSaleModal({
  open,
  products,
  onClose,
  onAdd,
}: {
  open: boolean;
  products: Product[];
  onClose: () => void;
  onAdd: (product: Product, amountCents: number) => void;
}) {
  const [amount, setAmount] = useState("");
  const [group, setGroup] = useState<"B" | "A" | "D">("B");
  useEffect(() => {
    if (open) {
      setAmount("");
      setGroup("B");
    }
  }, [open]);
  if (!open) return null;

  // свободната продажба ползва служебните артикули PLU 990 (Б), 991 (А), 992 (Г)
  const FREE_PLU: Record<"B" | "A" | "D", number> = { B: 990, A: 991, D: 992 };
  const product = products.find((p) => p.plu === FREE_PLU[group]);
  const cents = Math.round(parseFloat(amount.replace(",", ".")) * 100);
  const valid = !isNaN(cents) && cents > 0 && Boolean(product);

  return (
    <Modal open onClose={onClose} title="Свободна продажба (ръчна цена)">
      <div className="space-y-4">
        <input
          autoFocus
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && valid && product) onAdd(product, cents);
          }}
          placeholder="0,00 €"
          inputMode="decimal"
          className="input w-full h-14 text-center text-2xl font-bold"
        />
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ["B", "Б — 20%"],
              ["A", "А — 0%"],
              ["D", "Г — 9%"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setGroup(key)}
              className={`btn h-11 text-sm ${group === key ? "bg-brand-500 text-[#231a05]" : "chip"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {!product && (
          <p className="text-coral-600 text-sm">
            Липсва служебният артикул за свободна продажба (PLU {FREE_PLU[group]}) — пуснете
            `npm run db:seed` или го създайте от „Стоки“.
          </p>
        )}
        <button
          disabled={!valid}
          className="btn-primary w-full h-12"
          onClick={() => product && onAdd(product, cents)}
        >
          Добави в бона
        </button>
      </div>
    </Modal>
  );
}
