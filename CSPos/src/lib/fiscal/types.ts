// Абстракция над фискалните устройства. Всеки драйвер печата фискални бонове,
// сторно бонове, служебни суми и отчети. Продажбата минава ЕДИНСТВЕНО оттук —
// без фискален бон няма приключена продажба (Наредба Н-18).

import type { StornoReasonKey, VatGroupKey } from "../constants";

export interface FiscalItem {
  name: string;
  qtyMilli: number;
  unitLabel: string; // „бр.“ / „кг“
  unitPriceCents: number;
  vatGroup: VatGroupKey;
  discountPermille: number;
  /** Абсолютна отстъпка на реда (с ДДС) — за MxN/количествени промоции. */
  discountCents?: number;
  totalCents: number;
}

export interface FiscalPayment {
  type: "CASH" | "CARD" | "CREDIT";
  amountCents: number;
}

export interface FiscalReceiptData {
  unp: string | null; // печата се при СУПТО режим
  operatorCode: number;
  operatorName: string;
  items: FiscalItem[];
  payments: FiscalPayment[];
  totalCents: number;
  changeCents: number;
  /** Двойно обозначаване: крайна сума и в лева + курс (чл. 20 ЗВЕРБ). */
  dualDisplay: boolean;
}

export interface StornoData extends FiscalReceiptData {
  reason: StornoReasonKey;
  originalReceiptNo: string;
  originalReceiptDate: string; // ISO
}

export interface FiscalResult {
  ok: boolean;
  receiptNumber?: string;
  deviceSerial?: string;
  /** Пълен текст на бона (демо/преглед). */
  receiptText?: string;
  error?: string;
}

export interface FiscalStatus {
  ok: boolean;
  driver: string;
  deviceSerial?: string;
  detail: string;
}

export interface FiscalDriver {
  readonly id: string;
  readonly label: string;
  status(): Promise<FiscalStatus>;
  printReceipt(data: FiscalReceiptData): Promise<FiscalResult>;
  printStorno(data: StornoData): Promise<FiscalResult>;
  /** Служебно въведени (+) / изведени (−) суми — със служебен бон. */
  cashInOut(amountCents: number): Promise<FiscalResult>;
  xReport(): Promise<FiscalResult>;
  zReport(): Promise<FiscalResult>;
}
