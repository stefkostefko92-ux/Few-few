import { dec, divRound, percentOf, toFixed, ZERO, type Dec } from '../../einvoice/decimal.js';
import { el, leaf, type XmlElement } from '../../einvoice/xml.js';

/**
 * Сумите във фрагментите: `SAFmonetaryType` — до 18 цифри, 2 след точката; `AmountStructure` — сумата в евро
 * (`DefaultCurrencyCode` е само EUR по XSD 1.0.3) и в валутата на документа, с курса при чужда валута.
 */
export const money = (value: Dec): string => toFixed(value, 2);

/** Сума от валутата на документа в евро по курса му (единици за 1 евро), half-up до центове. */
export function toEur(amount: Dec, currency: string, rate: Dec | null): Dec {
  if (currency === 'EUR' || !rate) return amount;
  return divRound(amount, rate, 2);
}

export function amountStructure(
  name: string,
  amount: Dec,
  currency: string,
  rate: Dec | null,
): XmlElement | null {
  const foreign = currency !== 'EUR' && rate !== null;
  return el(
    name,
    null,
    leaf('Amount', money(toEur(amount, currency, rate))),
    leaf('CurrencyCode', currency),
    leaf('CurrencyAmount', money(amount)),
    foreign ? leaf('ExchangeRate', toFixed(rate, 4)) : null,
  );
}

/** ДДС за реда: основата × ставката, half-up до центове (0 без ставка). */
export function lineVat(net: Dec, rate: Dec | null): Dec {
  return rate ? percentOf(net, rate) : ZERO;
}

export const parseRate = (value: string | undefined): Dec | null => (value ? dec(value) : null);
