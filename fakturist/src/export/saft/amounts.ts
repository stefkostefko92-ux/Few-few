import {
  cmp,
  dec,
  divRound,
  mul,
  neg,
  percentOf,
  sub,
  toFixed,
  ZERO,
  type Dec,
} from '../../einvoice/decimal.js';
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
    foreign ? leaf('ExchangeRate', saftExchangeRate(rate)) : null,
  );
}

/**
 * Курсът в SAF-T е множител към евро — „CurrencyAmount x ExchangeRate = Amount“ (XSD 1.0.3,
 * AmountStructure/ExchangeRate), до 4 знака. Курсът на документа (BT-6, ЕЦБ) е обратният: единици
 * валута за 1 евро — затова 1 / курса, half-up.
 */
export function saftExchangeRate(rate: Dec): string {
  return toFixed(divRound(dec('1'), rate, 4), 4);
}

/**
 * Записан с 4 знака, обратният курс губи точност при висок курс (JPY 160 → 0.0063, ~0,8 %): тогава
 * „CurrencyAmount x ExchangeRate = Amount“ не се сверява — документът е за ръчно. Допуск 0,05 %.
 */
export function saftExchangeRateExact(rate: Dec): boolean {
  const drift = sub(mul(dec(saftExchangeRate(rate)), rate), dec('1'));
  const abs = cmp(drift, ZERO) < 0 ? neg(drift) : drift;
  return cmp(abs, dec('0.0005')) <= 0;
}

/** ДДС за реда: основата × ставката, half-up до центове (0 без ставка). */
export function lineVat(net: Dec, rate: Dec | null): Dec {
  return rate ? percentOf(net, rate) : ZERO;
}

export const parseRate = (value: string | undefined): Dec | null => (value ? dec(value) : null);
