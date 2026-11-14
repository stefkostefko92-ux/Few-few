// Tremol ZFPLab — официалният SDK на Tremol: локален HTTP сървър (ZFPLabServer,
// по подразбиране :4444), който говори ZFP протокола с устройството.
// https://tremol.bg/en/support/zfplab
// Командите тук следват ZFPLab REST конвенцията: /command?name=...&params...

import { VAT_GROUPS } from "../constants";
import { findDeviceSerial, parseDeviceDateTime } from "./device-time";
import type {
  FiscalDriver,
  FiscalReceiptData,
  FiscalResult,
  FiscalStatus,
  StornoData,
} from "./types";

interface TremolConfig {
  host: string;
  port: number;
  operatorPassword?: string;
}

// ZFP: ДДС клас А/Б/В/Г → буква на кирилица в протокола
const VAT_CLASS: Record<keyof typeof VAT_GROUPS, string> = {
  A: "А",
  B: "Б",
  C: "В",
  D: "Г",
};

// ZFP OptionStornoReason: 0=операторска грешка, 1=връщане/рекламация, 2=намаление на основа
const STORNO_CODE = { OPERATOR_ERROR: "0", RETURN: "1", TAX_BASE_CUT: "2" } as const;

export class TremolFiscalDriver implements FiscalDriver {
  readonly id = "tremol";
  readonly label = "Tremol ZFPLab сървър";

  constructor(private cfg: TremolConfig) {}

  private async cmd(name: string, params: Record<string, string> = {}): Promise<FiscalResult & { text?: string }> {
    const qs = new URLSearchParams(params).toString();
    const url = `http://${this.cfg.host}:${this.cfg.port}/${name}${qs ? `?${qs}` : ""}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(45_000) });
      const text = await res.text();
      if (!res.ok) return { ok: false, error: `ZFPLab HTTP ${res.status}: ${text.slice(0, 200)}` };
      // ZFPLab връща JSON { "ok": ..., "res": ... } или XML според версията;
      // третираме HTTP 200 без маркер за грешка като успех.
      if (/error/i.test(text) && !/"error"\s*:\s*(null|"")/i.test(text)) {
        return { ok: false, error: `ZFPLab: ${text.slice(0, 200)}` };
      }
      return { ok: true, text };
    } catch (e) {
      return {
        ok: false,
        error: `Няма връзка със ZFPLabServer на ${this.cfg.host}:${this.cfg.port} — ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  /**
   * т. 8 и т. 5: ИН на ФУ (ReadSerialAndFiscalNums) и часът му (ReadDateTime). Ако някое от
   * двете липсва, проверката на връзката не минава — без ИН няма УНП, без час няма сверка.
   */
  async status(): Promise<FiscalStatus> {
    const r = await this.cmd("ReadStatus");
    if (!r.ok) return { ok: false, driver: this.id, detail: r.error ?? "Няма връзка." };
    const [nums, time] = [await this.cmd("ReadSerialAndFiscalNums"), await this.cmd("ReadDateTime")];
    const deviceSerial = nums.ok ? findDeviceSerial(nums.text ?? "") ?? undefined : undefined;
    const deviceDateTime = time.ok ? parseDeviceDateTime(time.text ?? "") ?? undefined : undefined;
    return {
      ok: true,
      driver: this.id,
      deviceSerial,
      deviceDateTime,
      detail: !deviceSerial
        ? "ZFPLabServer отговаря, но не върна ИН на ФУ."
        : !deviceDateTime
          ? "ZFPLabServer отговаря, но не върна часа на ФУ."
          : "ZFPLabServer отговаря.",
    };
  }

  async printReceipt(data: FiscalReceiptData): Promise<FiscalResult> {
    const open = await this.cmd("OpenReceipt", {
      OperNum: String(data.operatorCode),
      OperPass: this.cfg.operatorPassword ?? "0",
      ...(data.unp ? { UniqueSaleNumber: data.unp } : {}),
    });
    if (!open.ok) return open;

    for (const it of data.items) {
      const sell = await this.cmd("SellPLUwithSpecifiedVAT", {
        NamePLU: it.name.slice(0, 36),
        OptionVATClass: VAT_CLASS[it.vatGroup],
        Price: (it.unitPriceCents / 100).toFixed(2),
        Quantity: (it.qtyMilli / 1000).toFixed(3),
        // MxN: стойностна отстъпка (DiscAddV); иначе процентна (DiscAddP)
        ...(it.discountCents && it.discountCents > 0
          ? { DiscAddV: `-${(it.discountCents / 100).toFixed(2)}` }
          : it.discountPermille > 0
            ? { DiscAddP: `-${(it.discountPermille / 10).toFixed(2)}` }
            : {}),
      });
      if (!sell.ok) {
        await this.cmd("CancelReceipt");
        return sell;
      }
    }

    for (const p of data.payments) {
      const pay = await this.cmd("Payment", {
        // ZFP: 0=в брой, 1=карта; отложеното плащане е програмируем тип (тук: 2 — сверете с конфигурацията на ФУ)
        OptionPaymentType: p.type === "CASH" ? "0" : p.type === "CARD" ? "1" : "2",
        Amount: (p.amountCents / 100).toFixed(2),
      });
      if (!pay.ok) {
        await this.cmd("CancelReceipt");
        return pay;
      }
    }

    const close = await this.cmd("CloseReceipt");
    if (!close.ok) return close;
    return { ok: true };
  }

  async printStorno(data: StornoData): Promise<FiscalResult> {
    const open = await this.cmd("OpenStornoReceipt", {
      OperNum: String(data.operatorCode),
      OperPass: this.cfg.operatorPassword ?? "0",
      OptionStornoReason: STORNO_CODE[data.reason],
      RelatedToRcpNum: data.originalReceiptNo,
      RelatedToRcpDateTime: data.originalReceiptDate,
      ...(data.unp ? { RelatedToURN: data.unp } : {}),
    });
    if (!open.ok) return open;

    for (const it of data.items) {
      const sell = await this.cmd("SellPLUwithSpecifiedVAT", {
        NamePLU: it.name.slice(0, 36),
        OptionVATClass: VAT_CLASS[it.vatGroup],
        Price: (it.unitPriceCents / 100).toFixed(2),
        Quantity: (it.qtyMilli / 1000).toFixed(3),
      });
      if (!sell.ok) {
        await this.cmd("CancelReceipt");
        return sell;
      }
    }
    return this.cmd("CloseReceipt");
  }

  async cashInOut(amountCents: number, operatorCode?: number): Promise<FiscalResult> {
    return this.cmd("ReceivedOnAccount_PaidOut", {
      OperNum: String(operatorCode ?? 1),
      OperPass: this.cfg.operatorPassword ?? "0",
      Amount: (amountCents / 100).toFixed(2),
    });
  }

  xReport(): Promise<FiscalResult> {
    return this.cmd("PrintDailyReport", { OptionZeroing: "X" });
  }

  zReport(): Promise<FiscalResult> {
    return this.cmd("PrintDailyReport", { OptionZeroing: "Z" });
  }
}
