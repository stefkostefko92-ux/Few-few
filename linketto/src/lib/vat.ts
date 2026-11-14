// ДДС за продажбите на планове (spec §7.1 P11; казусът на Данъчника 14.11.2026) —
// чисто, тества се. Не е данъчен съвет: правилата минават през консултанта.
//
// Под прага €10 000 за трансгранични B2C електронни услуги (текущата И
// предходната година, чл. 20б ЗДДС) мястото на доставка е България → 20%
// (чл. 66, ал. 1). Над прага — ставката на държавата на потребителя (OSS), но
// таблицата на 27-те ставки още НЕ е проверена от TEDB → fail closed.
// Цените са с включен ДДС.

export const VAT_THRESHOLD_CENTS = 1_000_000;
const BG_RATE_BP = 2000; // 20,00% в базисни точки

export type VatDecision =
  | { ok: true; country: 'BG'; rateBp: number; vatCents: number; netCents: number }
  | { ok: false; reason: 'over-threshold-rates-unverified' };

export function vatForPlanSale(input: {
  grossCents: number;
  /** Трансгранични B2C продажби (без BG) от началото на годината, евроцентове. */
  crossBorderCents: number;
  prevYearCrossBorderCents: number;
}): VatDecision {
  if (
    input.prevYearCrossBorderCents > VAT_THRESHOLD_CENTS ||
    input.crossBorderCents + input.grossCents > VAT_THRESHOLD_CENTS
  ) {
    return { ok: false, reason: 'over-threshold-rates-unverified' };
  }
  const vatCents = Math.round((input.grossCents * BG_RATE_BP) / (10_000 + BG_RATE_BP));
  return { ok: true, country: 'BG', rateBp: BG_RATE_BP, vatCents, netCents: input.grossCents - vatCents };
}
