"use client";

// Проверка на цена — клиентски терминал. Сканирай и виж голяма цена + промоция.
// Ползва /api/scan (същото разпознаване като касата); не прави продажба.
// Автоматично се изчиства след няколко секунди, готово за следващия клиент.

import { useCallback, useEffect, useRef, useState } from "react";
import { Barcode, Tag } from "@phosphor-icons/react";
import { apiJson } from "@/components/ui";
import { formatEur, formatBgnFromEur } from "@/lib/money";
import { bestPromotion, matchingMxn, type ActivePromotion } from "@/lib/promotions";

interface Product {
  id: string;
  plu: number;
  name: string;
  categoryId: string;
  unit: "PCS" | "KG";
  priceCents: number;
}

export default function CheckPage() {
  const [product, setProduct] = useState<Product | null>(null);
  const [promos, setPromos] = useState<ActivePromotion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/promotions/active")
      .then((r) => r.json())
      .then((j) => setPromos(j.promotions ?? []))
      .catch(() => setPromos([]));
  }, []);

  // фокусът винаги на скан полето
  useEffect(() => {
    const t = setInterval(() => {
      if (document.activeElement !== inputRef.current) inputRef.current?.focus();
    }, 600);
    return () => clearInterval(t);
  }, []);

  const scan = useCallback(async (code: string) => {
    if (!code.trim()) return;
    setValue("");
    setError(null);
    try {
      const r = await apiJson<{ product: Product }>(
        await fetch(`/api/scan?code=${encodeURIComponent(code.trim())}`)
      );
      setProduct(r.product);
    } catch {
      setProduct(null);
      setError("Стоката не е намерена. Обърнете се към касиер.");
    }
    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => {
      setProduct(null);
      setError(null);
    }, 8000);
  }, []);

  const promo = product ? bestPromotion(product, 1000, promos, new Date()) : null;
  const hasPromo = promo?.promotion && promo.unitCents < (product?.priceCents ?? 0);
  const mxn = product ? matchingMxn(product, promos, new Date()) : null;
  const shownCents = hasPromo ? promo!.unitCents : product?.priceCents ?? 0;

  return (
    <div className="min-h-[calc(100vh-7rem)] flex flex-col items-center justify-center -m-6 p-6 text-center">
      <input
        ref={inputRef}
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void scan(value);
        }}
        className="sr-only"
        aria-label="Сканирай баркод"
      />

      {!product && !error && (
        <div className="animate-fade-up">
          <div className="inline-flex items-center justify-center size-24 rounded-[2rem] text-[#231a05] mb-6" style={{ background: "linear-gradient(180deg,#ffd166,#f5a623)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.5), 0 20px 50px -12px rgba(245,166,35,.5)" }}>
            <Barcode size={52} weight="fill" />
          </div>
          <h1 className="text-4xl font-black">Проверка на цена</h1>
          <p className="text-ink-400 text-xl mt-3">Поднесете баркода на стоката към скенера</p>
        </div>
      )}

      {error && (
        <div className="animate-scale-in">
          <h1 className="text-3xl font-black text-coral-600">{error}</h1>
        </div>
      )}

      {product && (
        <div className="animate-scale-in max-w-2xl">
          {mxn && (
            <div className="inline-flex items-center gap-1.5 rounded-full bg-coral-600 text-white text-lg font-bold px-4 py-1.5 mb-4">
              <Tag size={20} weight="fill" /> {mxn.buyQty} ЗА {mxn.payQty}
            </div>
          )}
          <h1 className="text-4xl xl:text-5xl font-black leading-tight">{product.name}</h1>
          <div className="mt-8">
            <div className="text-7xl xl:text-8xl font-black text-brand-700 tabular-nums flex items-baseline justify-center gap-4">
              {formatEur(shownCents)}
              {hasPromo && (
                <span className="text-3xl font-semibold text-ink-500 line-through">
                  {formatEur(product.priceCents)}
                </span>
              )}
            </div>
            <div className="text-3xl text-ink-400 tabular-nums mt-2">
              {formatBgnFromEur(shownCents)}
            </div>
            <div className="text-lg text-ink-500 mt-4">
              {product.unit === "KG" ? "цена за килограм" : "цена за брой"} · PLU {product.plu} ·
              курс 1 € = 1,95583 лв.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
