// ErpNet.FP мост — https://github.com/erpnet/ErpNet.FP (лиценз 0BSD).
// Локален HTTP сървър (по подразбиране :8001), който превежда JSON към
// протоколите на Datecs/Tremol/Daisy/Eltrade/Incotex по COM/Bluetooth/TCP.
// Това е препоръчаният производствен път: един JSON API покрива всички марки.

import { VAT_GROUPS } from "../constants";
import type {
  FiscalDriver,
  FiscalReceiptData,
  FiscalResult,
  FiscalStatus,
  StornoData,
} from "./types";

interface ErpNetConfig {
  host: string;
  port: number;
  printerId: string;
}

// ErpNet.FP: taxGroup 1..8 (1=А, 2=Б, 3=В, 4=Г)
const TAX_GROUP_NUM: Record<keyof typeof VAT_GROUPS, number> = {
  A: 1,
  B: 2,
  C: 3,
  D: 4,
};

const STORNO_REASON_MAP = {
  OPERATOR_ERROR: "operator-error",
  RETURN: "refund",
  TAX_BASE_CUT: "tax-base-reduction",
} as const;

export class ErpNetFiscalDriver implements FiscalDriver {
  readonly id = "erpnet";
  readonly label = "ErpNet.FP мост (всички марки ФУ)";

  constructor(private cfg: ErpNetConfig) {}

  private url(path: string): string {
    return `http://${this.cfg.host}:${this.cfg.port}${path}`;
  }

  private async call(path: string, body?: unknown): Promise<FiscalResult> {
    try {
      const res = await fetch(this.url(path), {
        method: body === undefined ? "GET" : "POST",
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(45_000),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        receiptNumber?: string;
        deviceSerialNumber?: string;
        messages?: Array<{ type: string; text: string }>;
      };
      if (!res.ok || json.ok === false) {
        const err =
          json.messages?.filter((m) => m.type === "error").map((m) => m.text).join("; ") ??
          `HTTP ${res.status}`;
        return { ok: false, error: `ErpNet.FP: ${err}` };
      }
      return {
        ok: true,
        receiptNumber: json.receiptNumber,
        deviceSerial: json.deviceSerialNumber,
      };
    } catch (e) {
      return {
        ok: false,
        error: `Няма връзка с ErpNet.FP на ${this.cfg.host}:${this.cfg.port} — ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  async status(): Promise<FiscalStatus> {
    const r = await this.call(`/printers/${this.cfg.printerId}/status`, {});
    return {
      ok: r.ok,
      driver: this.id,
      deviceSerial: r.deviceSerial,
      detail: r.ok ? "Връзката с моста е активна." : r.error ?? "Няма връзка.",
    };
  }

  private receiptBody(data: FiscalReceiptData) {
    return {
      uniqueSaleNumber: data.unp ?? undefined,
      operator: String(data.operatorCode),
      items: data.items.map((it) => ({
        text: it.name,
        quantity: it.qtyMilli / 1000,
        unitPrice: it.unitPriceCents / 100,
        taxGroup: TAX_GROUP_NUM[it.vatGroup],
        ...(it.discountCents && it.discountCents > 0
          ? { priceModifierValue: it.discountCents / 100, priceModifierType: "discount-amount" }
          : it.discountPermille > 0
            ? { priceModifierValue: it.discountPermille / 10, priceModifierType: "discount-percent" }
            : {}),
      })),
      payments: data.payments.map((p) => ({
        amount: p.amountCents / 100,
        // ErpNet.FP: cash/card/credit (провери поддръжката на "credit" за конкретното ФУ)
        paymentType: p.type === "CASH" ? "cash" : p.type === "CARD" ? "card" : "credit",
      })),
    };
  }

  printReceipt(data: FiscalReceiptData): Promise<FiscalResult> {
    return this.call(`/printers/${this.cfg.printerId}/receipt`, this.receiptBody(data));
  }

  printStorno(data: StornoData): Promise<FiscalResult> {
    return this.call(`/printers/${this.cfg.printerId}/reversalreceipt`, {
      ...this.receiptBody(data),
      reason: STORNO_REASON_MAP[data.reason],
      receiptNumber: data.originalReceiptNo,
      receiptDateTime: data.originalReceiptDate,
    });
  }

  cashInOut(amountCents: number): Promise<FiscalResult> {
    return this.call(`/printers/${this.cfg.printerId}/deposit`, {
      amount: amountCents / 100,
    });
  }

  xReport(): Promise<FiscalResult> {
    return this.call(`/printers/${this.cfg.printerId}/xreport`, {});
  }

  zReport(): Promise<FiscalResult> {
    return this.call(`/printers/${this.cfg.printerId}/zreport`, {});
  }
}
