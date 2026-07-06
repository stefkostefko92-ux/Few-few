// Демо драйвер: пълна симулация на фискално устройство. Пази брояч на
// боновете в таблица Setting и връща текста на бона за преглед/печат на екран.
// Използва се за разработка, обучение на персонал и демонстрации.

import { prisma } from "../db";
import { getSetting, getVatRates } from "../settings";
import { buildReceiptText } from "./receipt-text";
import type {
  FiscalDriver,
  FiscalReceiptData,
  FiscalResult,
  FiscalStatus,
  StornoData,
} from "./types";

const COUNTER_KEY = "demoFiscalCounter";

async function nextReceiptNumber(): Promise<string> {
  // атомарно: upsert + increment в транзакция
  const n = await prisma.$transaction(async (tx) => {
    const row = await tx.setting.findUnique({ where: { key: COUNTER_KEY } });
    const current = row ? (JSON.parse(row.value) as number) : 0;
    const next = current + 1;
    await tx.setting.upsert({
      where: { key: COUNTER_KEY },
      create: { key: COUNTER_KEY, value: JSON.stringify(next) },
      update: { value: JSON.stringify(next) },
    });
    return next;
  });
  return String(n).padStart(7, "0");
}

export class DemoFiscalDriver implements FiscalDriver {
  readonly id = "demo";
  readonly label = "Демо (симулация)";

  async status(): Promise<FiscalStatus> {
    const cfg = await getSetting("fiscal");
    return {
      ok: true,
      driver: this.id,
      deviceSerial: cfg.deviceSerial,
      detail: "Симулация — не издава реални фискални бонове.",
    };
  }

  private async print(
    data: FiscalReceiptData,
    storno?: Pick<StornoData, "reason" | "originalReceiptNo" | "originalReceiptDate">
  ): Promise<FiscalResult> {
    const [store, cfg, vatRates] = await Promise.all([
      getSetting("store"),
      getSetting("fiscal"),
      getVatRates(),
    ]);
    const receiptNumber = await nextReceiptNumber();
    const receiptText = buildReceiptText(store, data, vatRates, {
      receiptNumber,
      deviceSerial: cfg.deviceSerial,
      fiscalMemoryNumber: cfg.fiscalMemoryNumber,
      storno,
    });
    return { ok: true, receiptNumber, deviceSerial: cfg.deviceSerial, receiptText };
  }

  printReceipt(data: FiscalReceiptData): Promise<FiscalResult> {
    return this.print(data);
  }

  printStorno(data: StornoData): Promise<FiscalResult> {
    return this.print(data, {
      reason: data.reason,
      originalReceiptNo: data.originalReceiptNo,
      originalReceiptDate: data.originalReceiptDate,
    });
  }

  async cashInOut(amountCents: number): Promise<FiscalResult> {
    const receiptNumber = await nextReceiptNumber();
    const kind = amountCents >= 0 ? "СЛУЖЕБНО ВЪВЕДЕНИ" : "СЛУЖЕБНО ИЗВЕДЕНИ";
    return {
      ok: true,
      receiptNumber,
      receiptText: `${kind}: ${(Math.abs(amountCents) / 100).toFixed(2)} EUR\nСлужебен бон № ${receiptNumber}`,
    };
  }

  async xReport(): Promise<FiscalResult> {
    return { ok: true, receiptText: "X-ОТЧЕТ (без нулиране) — симулация" };
  }

  async zReport(): Promise<FiscalResult> {
    const receiptNumber = await nextReceiptNumber();
    return {
      ok: true,
      receiptNumber,
      receiptText: `Z-ОТЧЕТ (дневен финансов отчет с нулиране) № ${receiptNumber} — симулация`,
    };
  }
}
