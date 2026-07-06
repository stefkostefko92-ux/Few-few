// Datecs X-генерация по LAN (FP-700X и сродни) — директен wire протокол без мост.
// Рамка Host→FP: <01><LEN><SEQ><CMD><DATA><05><BCC><03>
// LEN/SEQ/CMD са 4-байтови полета „нибъл + 0x30“; BCC = сума на байтовете
// между <01> и <05> вкл., кодирана в 4 нибъла +0x30. По Datecs
// „Communication protocol Programmer's Manual“ (datecs.bg).
// СТАТУС: експериментален — тестван срещу протоколната документация, не срещу
// живо устройство. За продукция препоръчваме ErpNet.FP моста.

import { Socket } from "net";
import { VAT_GROUPS } from "../constants";
import type {
  FiscalDriver,
  FiscalReceiptData,
  FiscalResult,
  FiscalStatus,
  StornoData,
} from "./types";

interface DatecsConfig {
  host: string;
  port: number; // обикновено 4999 (LAN модул на Datecs)
  operatorPassword?: string;
}

// Команди от X-протокола (PM_...FPprotocol_v2.00)
const CMD = {
  OPEN_RECEIPT: 48,
  SALE: 49,
  TOTAL: 53,
  CLOSE_RECEIPT: 56,
  CASH_IN_OUT: 70,
  REPORT: 69, // X/Z отчети
  STATUS: 74,
} as const;

const VAT_LETTER: Record<keyof typeof VAT_GROUPS, string> = {
  A: "1",
  B: "2",
  C: "3",
  D: "4",
};

/** 16-битова стойност → 4 байта „нибъл + 0x30“. */
function quad(value: number): number[] {
  return [
    ((value >> 12) & 0x0f) + 0x30,
    ((value >> 8) & 0x0f) + 0x30,
    ((value >> 4) & 0x0f) + 0x30,
    (value & 0x0f) + 0x30,
  ];
}

let seqCounter = 0x20;

function buildFrame(cmd: number, data: string): Buffer {
  const dataBytes = Buffer.from(data, "latin1"); // кирилицата се подава в кодировка на ФУ
  const seq = 0x20 + (seqCounter++ % 0x60);
  // LEN = дължина на <LEN><SEQ><CMD><DATA> + 0x20 (по спецификация: 4+4+4+len(data)+32)
  const len = 4 + 4 + 4 + dataBytes.length + 0x20;
  const body = [...quad(len), ...quad(seq), ...quad(cmd), ...dataBytes, 0x05];
  let bccSum = 0;
  for (const b of body) bccSum += b;
  return Buffer.from([0x01, ...body, ...quad(bccSum), 0x03]);
}

async function sendFrame(cfg: DatecsConfig, cmd: number, data: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const sock = new Socket();
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => {
      sock.destroy();
      reject(new Error("Таймаут при връзка с фискалното устройство."));
    }, 15_000);

    sock.connect(cfg.port, cfg.host, () => {
      sock.write(buildFrame(cmd, data));
    });
    sock.on("data", (chunk) => {
      chunks.push(chunk);
      const buf = Buffer.concat(chunks);
      // край на рамката: 0x03; игнорирай SYN (0x16) keep-alive байтове
      if (buf.includes(0x03)) {
        clearTimeout(timer);
        sock.end();
        resolve(buf);
      }
    });
    sock.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

/** Грубо декодиране: рамка с 0x04 разделител статус → и без NAK (0x15). */
function frameOk(buf: Buffer): boolean {
  return !buf.includes(0x15) && buf.includes(0x04);
}

export class DatecsLanFiscalDriver implements FiscalDriver {
  readonly id = "datecs-lan";
  readonly label = "Datecs X по LAN (експериментален)";

  constructor(private cfg: DatecsConfig) {}

  private async run(cmd: number, data: string): Promise<FiscalResult> {
    try {
      const buf = await sendFrame(this.cfg, cmd, data);
      if (!frameOk(buf)) {
        return { ok: false, error: "Фискалното устройство отказа командата (NAK)." };
      }
      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        error: `Datecs LAN ${this.cfg.host}:${this.cfg.port} — ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  async status(): Promise<FiscalStatus> {
    const r = await this.run(CMD.STATUS, "");
    return {
      ok: r.ok,
      driver: this.id,
      detail: r.ok ? "Устройството отговаря." : r.error ?? "Няма връзка.",
    };
  }

  async printReceipt(data: FiscalReceiptData): Promise<FiscalResult> {
    const pass = this.cfg.operatorPassword ?? "0000";
    // 48: {OpCode},{OpPwd},{NSale}[,{Type}]
    const open = await this.run(
      CMD.OPEN_RECEIPT,
      `${data.operatorCode},${pass},${data.unp ?? "1"}\t`
    );
    if (!open.ok) return open;

    for (const it of data.items) {
      // 49: {PluName}\t{TaxCd}{Price}[*{Qwan}][,Perc]
      const qty = (it.qtyMilli / 1000).toFixed(3);
      // MxN абсолютна отстъпка → приблизителен процент (този драйвер е експериментален)
      const gross = Math.round((it.unitPriceCents * it.qtyMilli) / 1000);
      const permille =
        it.discountCents && it.discountCents > 0 && gross > 0
          ? Math.round((it.discountCents / gross) * 1000)
          : it.discountPermille;
      const disc = permille > 0 ? `,-${(permille / 10).toFixed(2)}` : "";
      const sale = await this.run(
        CMD.SALE,
        `${it.name.slice(0, 36)}\t${VAT_LETTER[it.vatGroup]}${(it.unitPriceCents / 100).toFixed(2)}*${qty}${disc}`
      );
      if (!sale.ok) return sale;
    }

    for (const p of data.payments) {
      // 53: {PaidMode}{Amount} — '0' в брой, '1' карта (кредит)
      const total = await this.run(
        CMD.TOTAL,
        `${p.type === "CASH" ? "0" : "1"}${(p.amountCents / 100).toFixed(2)}`
      );
      if (!total.ok) return total;
    }

    return this.run(CMD.CLOSE_RECEIPT, "");
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async printStorno(data: StornoData): Promise<FiscalResult> {
    return {
      ok: false,
      error:
        "Сторно през директния Datecs LAN драйвер още не е реализирано — използвайте ErpNet.FP моста.",
    };
  }

  cashInOut(amountCents: number): Promise<FiscalResult> {
    return this.run(CMD.CASH_IN_OUT, (amountCents / 100).toFixed(2));
  }

  xReport(): Promise<FiscalResult> {
    return this.run(CMD.REPORT, "X");
  }

  zReport(): Promise<FiscalResult> {
    return this.run(CMD.REPORT, "Z");
  }
}
