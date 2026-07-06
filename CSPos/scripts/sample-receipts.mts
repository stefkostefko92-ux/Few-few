// Генерира примерни фискални документи с РЕАЛНИТЕ билдъри на проекта
// (същите функции, които печатат на бона/фактурата). Само за преглед.
// Пускане: npx tsx scripts/sample-receipts.mts

import { buildReceiptText } from "../src/lib/fiscal/receipt-text";
import { buildInvoiceText, type InvoiceLine } from "../src/lib/invoice-text";
import { includedVatCents } from "../src/lib/vat";
import { DEFAULT_VAT_RATES } from "../src/lib/vat";
import type { StoreInfo } from "../src/lib/settings";
import type { FiscalReceiptData, StornoData } from "../src/lib/fiscal/types";

const store: StoreInfo = {
  name: "Хранителни стоки Радост ЕООД",
  eik: "204567890",
  vatNumber: "BG204567890",
  mol: "Радостина Иванова",
  storeName: "Магазин „Радост“",
  address: "ул. „Витоша“ № 24",
  city: "София",
  phone: "0888 123 456",
  footerText: "Благодарим Ви за покупката! Заповядайте пак.",
};

const vatRates = DEFAULT_VAT_RATES;
const date = new Date("2026-07-04T10:24:00");

function lt(qtyMilli: number, unitPriceCents: number): number {
  return Math.round((qtyMilli * unitPriceCents) / 1000);
}

const items = [
  { name: "Хляб „Добруджа“ 650 г", qtyMilli: 2000, unitLabel: "бр.", unitPriceCents: 89, vatGroup: "D" as const, discountPermille: 0 },
  { name: "Прясно мляко 3,6% 1 л", qtyMilli: 1000, unitLabel: "бр.", unitPriceCents: 149, vatGroup: "D" as const, discountPermille: 0 },
  { name: "Сирене краве", qtyMilli: 450, unitLabel: "кг", unitPriceCents: 1290, vatGroup: "B" as const, discountPermille: 0 },
  { name: "Кафе мляно 200 г (3 за 2)", qtyMilli: 3000, unitLabel: "бр.", unitPriceCents: 429, vatGroup: "B" as const, discountPermille: 0, discountCents: 429 },
].map((it) => ({ ...it, totalCents: lt(it.qtyMilli, it.unitPriceCents) - ("discountCents" in it ? (it.discountCents as number) : 0) }));

const totalCents = items.reduce((s, it) => s + it.totalCents, 0);

// 1) Обикновен фискален бон (продажба в брой)
const sale: FiscalReceiptData = {
  unp: "DT51800000030000001",
  operatorCode: 3,
  operatorName: "Мария Петрова",
  items,
  payments: [{ type: "CASH", amountCents: 2500 }],
  totalCents,
  changeCents: 2500 - totalCents,
  dualDisplay: true,
};

// 2) Сторно бон (операторска грешка)
const storno: StornoData = {
  ...sale,
  payments: [{ type: "CASH", amountCents: totalCents }],
  changeCents: 0,
  reason: "OPERATOR_ERROR",
  originalReceiptNo: "0001234",
  originalReceiptDate: "2026-07-04T10:24:00",
};

// Фактура по чл. 114 ЗДДС — чисти редове (без промоция, за да е ясна аритметиката)
const invItems = [
  { name: "Хляб „Добруджа“ 650 г", qtyMilli: 2000, unitLabel: "бр.", unitPriceCents: 89, vatGroup: "D" as const },
  { name: "Прясно мляко 3,6% 1 л", qtyMilli: 1000, unitLabel: "бр.", unitPriceCents: 149, vatGroup: "D" as const },
  { name: "Сирене краве", qtyMilli: 450, unitLabel: "кг", unitPriceCents: 1290, vatGroup: "B" as const },
  { name: "Кафе мляно 200 г", qtyMilli: 2000, unitLabel: "бр.", unitPriceCents: 429, vatGroup: "B" as const },
];
const invLines: InvoiceLine[] = invItems.map((it) => {
  const totalCents = lt(it.qtyMilli, it.unitPriceCents);
  return {
    name: it.name,
    qtyMilli: it.qtyMilli,
    unitLabel: it.unitLabel,
    unitPriceCents: it.unitPriceCents,
    vatGroup: it.vatGroup,
    vatRatePermille: vatRates[it.vatGroup],
    totalCents,
    vatCents: includedVatCents(totalCents, vatRates[it.vatGroup]),
  };
});

const out = {
  sale: buildReceiptText(store, sale, vatRates, {
    receiptNumber: "0001234",
    deviceSerial: "DT518000",
    fiscalMemoryNumber: "50170023",
    date,
  }),
  storno: buildReceiptText(store, storno, vatRates, {
    receiptNumber: "0001235",
    deviceSerial: "DT518000",
    fiscalMemoryNumber: "50170023",
    storno: { reason: storno.reason, originalReceiptNo: storno.originalReceiptNo, originalReceiptDate: storno.originalReceiptDate },
    date: new Date("2026-07-04T10:31:00"),
  }),
  invoice: buildInvoiceText(
    store,
    { name: "Купувач ООД", eik: "203456789", vat: "BG203456789", address: "гр. Пловдив, бул. „Освобождение“ № 12", mol: "Петър Петров" },
    invLines,
    { number: 1234, date, fiscalReceiptNo: "0001234", dualDisplay: true }
  ),
};

// JSON, за да ги вградим в HTML прегледа
console.log(JSON.stringify(out));
