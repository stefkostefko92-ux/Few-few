// Промоции: избор на най-изгодната активна промоция за стока в даден момент.
// Чиста логика (без БД) — тества се самостоятелно. Периодът по дата се
// филтрира в заявката; тук са обхват, happy-hour часовете, количеството и
// изборът на най-ниска редова сума.
//
// Типове:
//   PERCENT — % отстъпка → намалява единичната цена
//   PRICE   — фиксирана промо цена → сменя единичната цена
//   MXN     — „M за N" (напр. 3 за 2) → отстъпка по количество, изразена като
//             промилна отстъпка на реда (за да е съвместима с ФУ); само за бройки

import { lineTotalCents } from "./money";

export type PromoKind = "PERCENT" | "PRICE" | "MXN";

export interface ActivePromotion {
  id: string;
  name: string;
  productId: string | null;
  categoryId: string | null;
  kind: PromoKind;
  percent: number | null; // промили при PERCENT
  priceCents: number | null; // промо цена при PRICE
  buyQty: number | null; // при MXN: на всеки buyQty броя
  payQty: number | null; // …плащаш payQty
  startMinute: number | null; // happy hour (минути от полунощ)
  endMinute: number | null;
  minQtyMilli: number;
}

export interface PromoResult {
  /** Ефективна единична цена (за фискалния ред и показване). */
  unitCents: number;
  /** Отстъпка на реда в промили (MxN и др. количествени); 0 за ценови/процентни. */
  discountPermille: number;
  /** Ефективна редова сума за подаденото количество. */
  lineCents: number;
  promotion: { id: string; name: string; kind: PromoKind } | null;
}

export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function windowContains(
  startMinute: number | null,
  endMinute: number | null,
  mins: number
): boolean {
  if (startMinute === null || endMinute === null) return true;
  if (startMinute === endMinute) return true;
  if (startMinute < endMinute) return mins >= startMinute && mins < endMinute;
  return mins >= startMinute || mins < endMinute; // напр. 22:00–02:00
}

/**
 * Най-изгодната приложима промоция за стока сега — по НАЙ-НИСКА редова сума.
 * Продуктовите промоции имат предимство пред категорийните при равна сума.
 */
export function bestPromotion(
  product: { id: string; categoryId: string; priceCents: number },
  qtyMilli: number,
  promos: ActivePromotion[],
  now: Date
): PromoResult {
  const mins = minutesOfDay(now);
  const catalogLine = lineTotalCents(product.priceCents, qtyMilli);
  let best: PromoResult = {
    unitCents: product.priceCents,
    discountPermille: 0,
    lineCents: catalogLine,
    promotion: null,
  };
  let bestIsProduct = false;

  for (const p of promos) {
    const scopeMatch =
      p.productId === product.id ||
      (p.productId === null && p.categoryId !== null && p.categoryId === product.categoryId);
    if (!scopeMatch) continue;
    if (qtyMilli < p.minQtyMilli) continue;
    if (!windowContains(p.startMinute, p.endMinute, mins)) continue;

    let cand: PromoResult | null = null;

    if (p.kind === "PERCENT" && p.percent != null) {
      const unit = Math.max(0, product.priceCents - Math.round((product.priceCents * p.percent) / 1000));
      cand = { unitCents: unit, discountPermille: 0, lineCents: lineTotalCents(unit, qtyMilli), promotion: mark(p) };
    } else if (p.kind === "PRICE" && p.priceCents != null) {
      const unit = Math.max(0, p.priceCents);
      cand = { unitCents: unit, discountPermille: 0, lineCents: lineTotalCents(unit, qtyMilli), promotion: mark(p) };
    } else if (p.kind === "MXN" && p.buyQty && p.payQty && p.buyQty > p.payQty) {
      // само за цели бройки (не тегловни стоки)
      if (qtyMilli % 1000 !== 0) continue;
      const units = qtyMilli / 1000;
      if (units < p.buyQty) continue;
      const groups = Math.floor(units / p.buyQty);
      const freeUnits = groups * (p.buyQty - p.payQty);
      // ТОЧНА редова сума: платените бройки × каталожна цена (без загуба от закръгляне)
      const lineCents = (units - freeUnits) * product.priceCents;
      // промилите са само информативни (за отчети/показване)
      const permille = Math.round((freeUnits / units) * 1000);
      cand = { unitCents: product.priceCents, discountPermille: permille, lineCents, promotion: mark(p) };
    }

    if (!cand) continue;
    const isProduct = p.productId !== null;
    if (cand.lineCents < best.lineCents || (cand.lineCents === best.lineCents && isProduct && !bestIsProduct && best.promotion !== null)) {
      best = cand;
      bestIsProduct = isProduct;
    }
  }

  return best;
}

function mark(p: ActivePromotion): { id: string; name: string; kind: PromoKind } {
  return { id: p.id, name: p.name, kind: p.kind };
}

/** MxN промоция, покриваща стоката сега (обхват + часове) — за етикет в POS. */
export function matchingMxn(
  product: { id: string; categoryId: string },
  promos: ActivePromotion[],
  now: Date
): { buyQty: number; payQty: number } | null {
  const mins = minutesOfDay(now);
  for (const p of promos) {
    if (p.kind !== "MXN" || !p.buyQty || !p.payQty) continue;
    const scopeMatch =
      p.productId === product.id ||
      (p.productId === null && p.categoryId !== null && p.categoryId === product.categoryId);
    if (!scopeMatch) continue;
    if (!windowContains(p.startMinute, p.endMinute, mins)) continue;
    return { buyQty: p.buyQty, payQty: p.payQty };
  }
  return null;
}
