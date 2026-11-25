/** Постъпление от банково извлечение (SPEC 54) — само кредит; суми в центове (BigInt). */
export interface BankEntry {
  bookingDate: string;
  amountCents: bigint;
  currency: string;
  counterparty?: string | undefined;
  counterpartyIban?: string | undefined;
  remittance: string;
  bankRef?: string | undefined;
}

export class BankFormatError extends Error {
  constructor(
    readonly code: 'xml' | 'notCamt' | 'csvHeader' | 'csvEmpty' | 'encoding' | 'tooMany',
    message: string = code,
  ) {
    super(message);
  }
}

/** Таван на редовете в едно извлечение. */
export const MAX_ENTRIES = 20_000;
