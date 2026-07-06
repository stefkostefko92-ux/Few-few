// Преглед на примерен фискален бон / фактура с подадените (все още незаписани)
// фирмени данни — за админския панел „Данни на фирмата“. Само визуализация:
// не пипа фискалното устройство и не създава продажба. Роля ADMIN.

import { z } from "zod";
import { guard, jsonError, requireRole } from "@/lib/auth";
import { buildReceiptText } from "@/lib/fiscal/receipt-text";
import { buildInvoiceText, type InvoiceLine } from "@/lib/invoice-text";
import { includedVatCents } from "@/lib/vat";
import type { StoreInfo } from "@/lib/settings";
import type { FiscalReceiptData } from "@/lib/fiscal/types";

const schema = z.object({
  kind: z.enum(["receipt", "invoice"]),
  store: z.object({
    name: z.string(),
    eik: z.string(),
    vatNumber: z.string(),
    mol: z.string(),
    storeName: z.string(),
    address: z.string(),
    city: z.string(),
    phone: z.string(),
    footerText: z.string(),
  }),
  vatRates: z.object({
    A: z.number().int(),
    B: z.number().int(),
    C: z.number().int(),
    D: z.number().int(),
  }),
});

// Примерна кошница (реалистична за хранителен магазин): хляб (Г 9%),
// прясно мляко (Г 9%), кафе (Б 20%) — с двойно обозначаване EUR/BGN.
const SAMPLE_ITEMS = [
  { name: "Хляб „Добруджа“ 650 г", qtyMilli: 2000, unitLabel: "бр.", unitPriceCents: 89, vatGroup: "D" as const },
  { name: "Прясно мляко 3,6% 1 л", qtyMilli: 1000, unitLabel: "бр.", unitPriceCents: 149, vatGroup: "D" as const },
  { name: "Кафе мляно 200 г", qtyMilli: 1000, unitLabel: "бр.", unitPriceCents: 429, vatGroup: "B" as const },
  { name: "Сирене краве", qtyMilli: 450, unitLabel: "кг", unitPriceCents: 1290, vatGroup: "B" as const },
];

function lineTotal(qtyMilli: number, unitPriceCents: number): number {
  return Math.round((qtyMilli * unitPriceCents) / 1000);
}

export async function POST(req: Request) {
  return guard(async () => {
    await requireRole("ADMIN");
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) throw jsonError(400, "Невалидни данни за преглед.");
    const store = parsed.data.store as StoreInfo;
    const vatRates = parsed.data.vatRates;

    const items = SAMPLE_ITEMS.map((it) => ({
      ...it,
      discountPermille: 0,
      totalCents: lineTotal(it.qtyMilli, it.unitPriceCents),
    }));
    const totalCents = items.reduce((s, it) => s + it.totalCents, 0);

    if (parsed.data.kind === "receipt") {
      const data: FiscalReceiptData = {
        unp: "DM00000100010000001",
        operatorCode: 3,
        operatorName: "Мария Петрова",
        items,
        payments: [{ type: "CASH", amountCents: 2000 }],
        totalCents,
        changeCents: 2000 - totalCents,
        dualDisplay: true,
      };
      const text = buildReceiptText(store, data, vatRates, {
        receiptNumber: "0001234",
        deviceSerial: store.eik ? "DT518000" : "DM000001",
        fiscalMemoryNumber: "50170023",
        date: new Date("2026-07-04T10:24:00"),
      });
      return Response.json({ title: "Примерен фискален бон", text });
    }

    // Фактура по чл. 114 ЗДДС
    const lines: InvoiceLine[] = items.map((it) => ({
      name: it.name,
      qtyMilli: it.qtyMilli,
      unitLabel: it.unitLabel,
      unitPriceCents: it.unitPriceCents,
      vatGroup: it.vatGroup,
      vatRatePermille: vatRates[it.vatGroup],
      totalCents: it.totalCents,
      vatCents: includedVatCents(it.totalCents, vatRates[it.vatGroup]),
    }));
    const text = buildInvoiceText(
      store,
      { name: "Купувач ООД", eik: "203456789", vat: "BG203456789", address: "гр. Пловдив, бул. „Освобождение“ № 12", mol: "Петър Петров" },
      lines,
      { number: 1234, date: new Date("2026-07-04T10:24:00"), fiscalReceiptNo: "0001234", dualDisplay: true }
    );
    return Response.json({ title: "Примерна фактура (чл. 114 ЗДДС)", text });
  });
}
