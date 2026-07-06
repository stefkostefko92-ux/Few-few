// Текстово изображение на фискалния бон — за демо режим, преглед на екран
// и дублиращ журнал. Реквизити по чл. 26 от Наредба Н-18 + двойно обозначаване
// на крайната сума по чл. 20 ЗВЕРБ (EUR + BGN + курс 1.95583).

import { BGN_PER_EUR, STORNO_REASONS, VAT_GROUPS } from "../constants";
import { formatCents, formatQty, eurCentsToBgnCents } from "../money";
import { includedVatCents } from "../vat";
import type { VatRates } from "../vat";
import type { FiscalReceiptData, StornoData } from "./types";
import type { StoreInfo } from "../settings";

const W = 42; // знака на ред (80 мм термо ролка)

function center(s: string): string {
  if (s.length >= W) return s.slice(0, W);
  const pad = Math.floor((W - s.length) / 2);
  return " ".repeat(pad) + s;
}

/** Пренася дълъг текст на няколко центрирани реда (за бележка на дъното). */
function centerWrap(s: string): string[] {
  const words = s.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur && (cur.length + 1 + w.length) > W) {
      lines.push(center(cur));
      cur = w;
    } else {
      cur = cur ? `${cur} ${w}` : w;
    }
  }
  if (cur) lines.push(center(cur));
  return lines;
}

function row(left: string, right: string): string {
  const space = W - left.length - right.length;
  if (space < 1) return `${left.slice(0, W - right.length - 1)} ${right}`;
  return left + " ".repeat(space) + right;
}

const line = "─".repeat(W);

export function buildReceiptText(
  store: StoreInfo,
  data: FiscalReceiptData,
  vatRates: VatRates,
  meta: {
    receiptNumber: string;
    deviceSerial: string;
    fiscalMemoryNumber: string;
    storno?: Pick<StornoData, "reason" | "originalReceiptNo" | "originalReceiptDate">;
    date?: Date;
  }
): string {
  const out: string[] = [];
  const now = meta.date ?? new Date();

  out.push(center(store.name));
  out.push(center(`ЕИК ${store.eik}`));
  if (store.vatNumber) out.push(center(`ЗДДС № ${store.vatNumber}`));
  out.push(center(store.storeName));
  out.push(center(`${store.city}, ${store.address}`));
  if (store.phone) out.push(center(`тел. ${store.phone}`));
  out.push(line);

  if (meta.storno) {
    out.push(center("*** С Т О Р Н О ***"));
    out.push(center(STORNO_REASONS[meta.storno.reason]));
    out.push(center(`към бон № ${meta.storno.originalReceiptNo}`));
    out.push(center(`от ${new Date(meta.storno.originalReceiptDate).toLocaleString("bg-BG")}`));
    out.push(line);
  }

  for (const it of data.items) {
    const qty = formatQty(it.qtyMilli, it.unitLabel === "кг" ? 3 : 0);
    const groupLetter = VAT_GROUPS[it.vatGroup].letter;
    out.push(it.name.slice(0, W));
    out.push(
      row(
        `  ${qty} ${it.unitLabel} x ${formatCents(it.unitPriceCents)}`,
        `${formatCents(it.totalCents)} ${groupLetter}`
      )
    );
    if (it.discountCents && it.discountCents > 0) {
      out.push(row("  отстъпка (промоция)", `-${formatCents(it.discountCents)}`));
    } else if (it.discountPermille > 0) {
      out.push(row("  отстъпка", `-${(it.discountPermille / 10).toFixed(1)}%`));
    }
  }

  out.push(line);
  out.push(row("ОБЩО:", `${formatCents(data.totalCents)} EUR`));
  if (data.dualDisplay) {
    out.push(row("Общо в лева:", `${formatCents(eurCentsToBgnCents(data.totalCents))} лв.`));
    out.push(row("Курс:", `1 EUR = ${BGN_PER_EUR} лв.`));
  }

  // разбивка на ДДС по групи
  const perGroup = new Map<string, { gross: number }>();
  for (const it of data.items) {
    const acc = perGroup.get(it.vatGroup) ?? { gross: 0 };
    acc.gross += it.totalCents;
    perGroup.set(it.vatGroup, acc);
  }
  for (const [g, { gross }] of [...perGroup.entries()].sort()) {
    const info = VAT_GROUPS[g as keyof typeof VAT_GROUPS];
    const rate = vatRates[g as keyof VatRates];
    const vat = includedVatCents(gross, rate);
    out.push(
      row(
        `ДДС ${info.letter} (${(rate / 10).toFixed(0)}%)`,
        `${formatCents(vat)} / ${formatCents(gross)}`
      )
    );
  }

  out.push(line);
  const PAY_LABEL = { CASH: "В БРОЙ", CARD: "С КАРТА", CREDIT: "ОТЛОЖЕНО ПЛАЩАНЕ" } as const;
  for (const p of data.payments) {
    out.push(row(PAY_LABEL[p.type], `${formatCents(p.amountCents)} EUR`));
  }
  if (data.changeCents > 0) {
    out.push(row("РЕСТО", `${formatCents(data.changeCents)} EUR`));
  }

  out.push(line);
  out.push(row(`Оператор: ${data.operatorName}`, `код ${data.operatorCode}`));
  if (data.unp) out.push(`УНП: ${data.unp}`);
  out.push(row(now.toLocaleDateString("bg-BG"), now.toLocaleTimeString("bg-BG")));
  out.push(row(`БОН № ${meta.receiptNumber}`, meta.storno ? "СТОРНО" : "ФИСКАЛЕН БОН"));
  out.push(row(`ФУ ${meta.deviceSerial}`, `ФП ${meta.fiscalMemoryNumber}`));
  out.push(center("[ QR код — Приложение № 18а ]"));
  if (store.footerText) {
    out.push(line);
    out.push(...centerWrap(store.footerText));
  }

  return out.join("\n");
}
