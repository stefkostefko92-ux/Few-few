// ДДС: включен в продажната цена (цени „с ДДС“ по ЗЗП).
// Изчисляване на включения данък: ДДС = брутно × r / (1000 + r), r в промили.

import { VAT_GROUPS, type VatGroupKey } from "./constants";

export type VatRates = Record<VatGroupKey, number>; // промили

export const DEFAULT_VAT_RATES: VatRates = {
  A: VAT_GROUPS.A.defaultRatePermille,
  B: VAT_GROUPS.B.defaultRatePermille,
  C: VAT_GROUPS.C.defaultRatePermille,
  D: VAT_GROUPS.D.defaultRatePermille,
};

/** Включеният ДДС в брутна сума (евроценти), закръглен до цент. */
export function includedVatCents(grossCents: number, ratePermille: number): number {
  if (ratePermille <= 0) return 0;
  return Math.sign(grossCents) *
    Math.round(Math.abs((grossCents * ratePermille) / (1000 + ratePermille)));
}

/** Разбивка по данъчни групи за отчети и фискален бон. */
export function vatBreakdown(
  items: Array<{ vatGroup: string; totalCents: number; vatCents: number }>
): Array<{ group: VatGroupKey; letter: string; grossCents: number; vatCents: number }> {
  const map = new Map<VatGroupKey, { grossCents: number; vatCents: number }>();
  for (const it of items) {
    const g = it.vatGroup as VatGroupKey;
    const acc = map.get(g) ?? { grossCents: 0, vatCents: 0 };
    acc.grossCents += it.totalCents;
    acc.vatCents += it.vatCents;
    map.set(g, acc);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, acc]) => ({
      group,
      letter: VAT_GROUPS[group].letter,
      ...acc,
    }));
}
