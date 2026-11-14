// Сървърно остойностяване на ред от продажба и превръщането му във фискален ред.
// Една функция за плащането, откритата продажба и анулирането — иначе стойността на
// анулирания артикул (т. 12) може да се размине с това, което щеше да се плати.
//
// Инвариант (т. 2): сумата, която ФУ ще изчисли по реда, е равна на записаната сума.
// • Заключена цена (ценови баркод 29…, свободна продажба) → към ФУ 1 × заключената сума;
//   иначе ФУ смята цена × количество и се разминава с ±1 ст. (или печата 0,00 € за служебен PLU).
// • MxN → абсолютна отстъпка по реда (discountCents), не процент.

import { applyDiscount, lineTotalCents } from "./money";
import { includedVatCents, type VatRates } from "./vat";
import { bestPromotion, type ActivePromotion } from "./promotions";
import type { RoleKey, VatGroupKey } from "./constants";
import type { FiscalItem } from "./fiscal/types";

export interface ProductLike {
  id: string;
  plu: number;
  name: string;
  categoryId: string;
  unit: string;
  vatGroup: string;
  priceCents: number;
}

export interface LineInput {
  qtyMilli: number;
  discountPermille: number;
  priceLockedCents?: number | null;
}

export interface PricingContext {
  promos: ActivePromotion[];
  now: Date;
  /** Отстъпката от клиентската карта (от базата, не от клиента). */
  customerDiscountPermille: number;
  vatRates: VatRates;
}

export interface PricedLine {
  product: ProductLike;
  qtyMilli: number;
  /** Заключена редова сума или null. */
  lockedCents: number | null;
  /** Единична цена с ДДС за записа (при заключена — производна, за справките). */
  unitCents: number;
  /** Сума по каталог (с ДДС, преди отстъпки) — за „междинна сума“. */
  catalogCents: number;
  discountPermille: number;
  /** Абсолютна отстъпка (MxN), подава се към ФУ като сума. */
  discountCents: number;
  totalCents: number;
  vatRatePermille: number;
  vatCents: number;
  promotionId: string | null;
}

export function priceLine(input: LineInput, p: ProductLike, ctx: PricingContext): PricedLine {
  const rate = ctx.vatRates[p.vatGroup as VatGroupKey];
  const discount = Math.max(input.discountPermille, ctx.customerDiscountPermille);

  if (input.priceLockedCents !== undefined && input.priceLockedCents !== null) {
    const locked = input.priceLockedCents;
    const total = applyDiscount(locked, discount);
    return {
      product: p,
      qtyMilli: input.qtyMilli,
      lockedCents: locked,
      unitCents: input.qtyMilli > 0 ? Math.round((locked * 1000) / input.qtyMilli) : locked,
      catalogCents: locked,
      discountPermille: discount,
      discountCents: 0,
      totalCents: total,
      vatRatePermille: rate,
      vatCents: includedVatCents(total, rate),
      promotionId: null,
    };
  }

  const catalogLine = lineTotalCents(p.priceCents, input.qtyMilli);
  const promo = bestPromotion(p, input.qtyMilli, ctx.promos, ctx.now);

  if (promo.promotion?.kind === "MXN") {
    // MxN срещу клиентската отстъпка — печели по-изгодното, не се натрупват
    const promoAbs = catalogLine - promo.lineCents;
    const custAbs = catalogLine - applyDiscount(catalogLine, discount);
    const discountCents = Math.max(promoAbs, custAbs);
    const total = catalogLine - discountCents;
    return {
      product: p,
      qtyMilli: input.qtyMilli,
      lockedCents: null,
      unitCents: p.priceCents,
      catalogCents: catalogLine,
      discountPermille: 0,
      discountCents,
      totalCents: total,
      vatRatePermille: rate,
      vatCents: includedVatCents(total, rate),
      promotionId: promo.promotion.id,
    };
  }

  // PERCENT/PRICE сменят единичната цена; ръчната/клиентската отстъпка е отгоре
  const raw = lineTotalCents(promo.unitCents, input.qtyMilli);
  const total = applyDiscount(raw, discount);
  return {
    product: p,
    qtyMilli: input.qtyMilli,
    lockedCents: null,
    unitCents: promo.unitCents,
    catalogCents: catalogLine,
    discountPermille: discount,
    discountCents: 0,
    totalCents: total,
    vatRatePermille: rate,
    vatCents: includedVatCents(total, rate),
    promotionId: promo.promotion?.id ?? null,
  };
}

/** Отстъпката по реда в евроценти с ДДС: (цена без отстъпка × количество) − сума. */
export function lineDiscountCents(l: Pick<PricedLine, "lockedCents" | "unitCents" | "qtyMilli" | "totalCents">): number {
  const base = l.lockedCents ?? Math.round((l.unitCents * l.qtyMilli) / 1000);
  return Math.max(0, base - l.totalCents);
}

/** Фискалният ред — така, че ФУ да получи точно записаната сума. */
export function toFiscalItem(l: PricedLine, unitLabel: string): FiscalItem {
  if (l.lockedCents !== null) {
    return {
      name: l.product.name,
      qtyMilli: 1000,
      unitLabel: "бр.",
      unitPriceCents: l.lockedCents,
      vatGroup: l.product.vatGroup as VatGroupKey,
      discountPermille: l.discountPermille,
      discountCents: 0,
      totalCents: l.totalCents,
    };
  }
  return {
    name: l.product.name,
    qtyMilli: l.qtyMilli,
    unitLabel,
    unitPriceCents: l.unitCents,
    vatGroup: l.product.vatGroup as VatGroupKey,
    discountPermille: l.discountPermille,
    discountCents: l.discountCents,
    totalCents: l.totalCents,
  };
}

/**
 * Ръчна отстъпка от екрана: касиерът — до лимита от настройките, управителят и
 * администраторът — без лимит. Отстъпката от клиентската карта не е ръчна.
 */
export function manualDiscountAllowed(permille: number, role: RoleKey, cashierLimitPermille: number): boolean {
  if (permille <= 0) return true;
  if (role === "MANAGER" || role === "ADMIN") return true;
  return permille <= cashierLimitPermille;
}
