// Пари: цели int в евроценти. България е в еврозоната от 01.01.2026 —
// касата работи в EUR, а левът се показва информативно по фиксирания курс
// до края на двойното обозначаване (ЗВЕРБ чл. 16/20; Регламент 1103/97 чл. 4–5:
// закръгляване до цент по третия знак, ≥5 нагоре, без междинни закръглявания).

import { BGN_PER_EUR } from "./constants";

/** Стандартно математическо закръгляване (half-up) на положителни и отрицателни суми. */
function roundHalfUp(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

/** Евроценти → стотинки (информативно, по курс 1.95583). */
export function eurCentsToBgnCents(eurCents: number): number {
  return roundHalfUp(eurCents * BGN_PER_EUR);
}

/** Стотинки → евроценти (превалутиране чрез ДЕЛЕНЕ на пълния курс — чл. 13 ЗВЕРБ). */
export function bgnCentsToEurCents(bgnCents: number): number {
  return roundHalfUp(bgnCents / BGN_PER_EUR);
}

/** 1234 → „12,34“ (без валутен знак). */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${sign}${whole},${frac}`;
}

/** 1234 → „12,34 €“. */
export function formatEur(cents: number): string {
  return `${formatCents(cents)} €`;
}

/** 1234 → „24,13 лв.“ (по курса). */
export function formatBgnFromEur(eurCents: number): string {
  return `${formatCents(eurCentsToBgnCents(eurCents))} лв.`;
}

/**
 * Двойно обозначаване: „12,34 € (24,13 лв.)“.
 * От 01.01.2026 еврото се изписва първо (ЗВЕРБ).
 */
export function formatDual(eurCents: number, dualDisplay: boolean): string {
  if (!dualDisplay) return formatEur(eurCents);
  return `${formatEur(eurCents)} (${formatBgnFromEur(eurCents)})`;
}

/** „12,34“ / „12.34“ / „12“ → евроценти; NaN при невалиден вход. */
export function parseCents(input: string): number {
  const norm = input.trim().replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(norm)) return NaN;
  return roundHalfUp(parseFloat(norm) * 100);
}

/** Количества: 1500 (millis) → „1,500“ или „1“ според мерната единица. */
export function formatQty(qtyMilli: number, decimals: number): string {
  if (decimals === 0) return String(Math.round(qtyMilli / 1000));
  const sign = qtyMilli < 0 ? "-" : "";
  const abs = Math.abs(qtyMilli);
  const whole = Math.floor(abs / 1000);
  const frac = String(abs % 1000).padStart(3, "0");
  return `${sign}${whole},${frac}`;
}

/** „1,5“ / „1.5“ / „2“ → millis (1500/2000); NaN при невалиден вход. */
export function parseQty(input: string): number {
  const norm = input.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,3})?$/.test(norm)) return NaN;
  return Math.round(parseFloat(norm) * 1000);
}

/** Редова сума: цена × количество (millis), закръглена до цент. */
export function lineTotalCents(unitPriceCents: number, qtyMilli: number): number {
  return roundHalfUp((unitPriceCents * qtyMilli) / 1000);
}

/** Прилага отстъпка в промили и закръглява до цент. */
export function applyDiscount(cents: number, discountPermille: number): number {
  return cents - roundHalfUp((cents * discountPermille) / 1000);
}
