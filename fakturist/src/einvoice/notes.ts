import { toFixed, toPlain } from './decimal.js';
import type { Calculated } from './calculate.js';
import type { InvoiceInput } from './model.js';

/**
 * Бележката към документа (BT-22). Peppol BIS допуска само една бележка (PEPPOL-EN16931-R002), затова
 * всичко е в една, на редове:
 * 1. бележките на издателя;
 * 2. основанието за нулева ставка (EN 16931-1:2017 забранява BT-120 при категория Z — BR-Z-10 — а ЗДДС
 *    иска основанието във фактурата, чл. 114, ал. 1, т. 12);
 * 3. основата и ДДС в евро при фактура в друга валута (чл. 114, ал. 5 ЗДДС) — EN 16931 носи само общия
 *    ДДС в евро (BT-111), не основата по ставки.
 */
export function documentNote(input: InvoiceInput, calc: Calculated): string | undefined {
  const lines: string[] = [...input.notes];
  const zero = input.vatExemptions.find((entry) => entry.category === 'Z');
  if (calc.breakdown.some((group) => group.category === 'Z') && zero?.reason) {
    lines.push(`Основание за нулева ставка: ${zero.reason}`);
  }
  if (calc.vatCurrency === 'EUR' && input.eurExchangeRate !== undefined) {
    const parts = calc.breakdown.map((group) => {
      const rate = group.rate ? `${toPlain(group.rate)}%` : 'O';
      const base = group.taxableEur ? toFixed(group.taxableEur, 2) : '-';
      const vat = group.vatEur ? toFixed(group.vatEur, 2) : '-';
      return `${group.category} ${rate}: основа ${base} EUR, ДДС ${vat} EUR`;
    });
    const total = calc.totals.vatInEur ? toFixed(calc.totals.vatInEur, 2) : '-';
    lines.push(
      `В евро по курса на ЕЦБ ${input.eurExchangeRate} ${input.currency}/EUR (чл. 114, ал. 5 ЗДДС): ` +
        `${parts.join('; ')}; общо ДДС ${total} EUR`,
    );
  }
  return lines.length > 0 ? lines.join('\n') : undefined;
}
