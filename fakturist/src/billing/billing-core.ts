/** Общото на поръчките и фактурата за план — без база (ДДС върху цели центове, грешките). */
export const VAT_RATE_PERCENT = 20;
export type OrderMethod = 'card' | 'transfer';
export type Interval = 'MONTH' | 'YEAR';

export class BillingError extends Error {
  constructor(
    readonly code:
      'notFound' | 'audience' | 'free' | 'noPrice' | 'noSupplier' | 'notPending' | 'amountMismatch',
  ) {
    super(code);
  }
}

/** ДДС върху цели центове, half-up — без float. */
export function vatCents(netCents: number, ratePercent = VAT_RATE_PERCENT): number {
  return Math.floor((netCents * ratePercent + 50) / 100);
}
