// Печатен вид на фактура по чл. 114 ЗДДС. Реквизити: пореден 10-разряден
// номер, дата, доставчик (търговецът) и получател (купувачът), редове с
// количество/ед. цена/ставка/стойност, данъчна основа + ДДС + обща сума.
// Двувалутно EUR/BGN през периода на двойно обозначаване (ЗВЕРБ).

import { BGN_PER_EUR, VAT_GROUPS } from "./constants";
import { formatCents, formatQty, eurCentsToBgnCents } from "./money";
import type { StoreInfo } from "./settings";

const W = 64;

function line(ch = "─"): string {
  return ch.repeat(W);
}
function row(left: string, right: string): string {
  const space = W - left.length - right.length;
  return space < 1 ? `${left} ${right}` : left + " ".repeat(space) + right;
}
function center(s: string): string {
  if (s.length >= W) return s;
  return " ".repeat(Math.floor((W - s.length) / 2)) + s;
}

export interface InvoiceLine {
  name: string;
  qtyMilli: number;
  unitLabel: string;
  unitPriceCents: number; // с ДДС
  vatGroup: keyof typeof VAT_GROUPS;
  vatRatePermille: number;
  totalCents: number; // с ДДС
  vatCents: number; // включен ДДС
}

export interface InvoiceBuyer {
  name: string;
  eik?: string | null;
  vat?: string | null;
  address?: string | null;
  mol?: string | null;
}

export function buildInvoiceText(
  store: StoreInfo,
  buyer: InvoiceBuyer,
  lines: InvoiceLine[],
  meta: {
    number: number;
    date: Date;
    fiscalReceiptNo: string | null;
    dualDisplay: boolean;
  }
): string {
  const out: string[] = [];
  const num = String(meta.number).padStart(10, "0");

  out.push(center("Ф А К Т У Р А — ОРИГИНАЛ"));
  out.push(center(`№ ${num} / ${meta.date.toLocaleDateString("bg-BG")}`));
  out.push(line("═"));

  out.push("ДОСТАВЧИК:");
  out.push(`  ${store.name}`);
  out.push(`  ЕИК: ${store.eik}${store.vatNumber ? `   ЗДДС №: ${store.vatNumber}` : ""}`);
  out.push(`  ${store.city}, ${store.address}`);
  if (store.mol) out.push(`  МОЛ: ${store.mol}`);
  if (store.phone) out.push(`  тел.: ${store.phone}`);
  out.push("");
  out.push("ПОЛУЧАТЕЛ:");
  out.push(`  ${buyer.name}`);
  if (buyer.eik || buyer.vat) {
    out.push(`  ЕИК: ${buyer.eik ?? "—"}${buyer.vat ? `   ЗДДС №: ${buyer.vat}` : ""}`);
  }
  if (buyer.address) out.push(`  ${buyer.address}`);
  if (buyer.mol) out.push(`  МОЛ: ${buyer.mol}`);
  out.push(line());

  // редове: показваме стойност с ДДС (цените са с включен данък)
  out.push(row("Стока                     К-во   Ед.цена", "Стойност гр."));
  out.push(line("·"));
  let net = 0;
  let vat = 0;
  for (const it of lines) {
    net += it.totalCents - it.vatCents;
    vat += it.vatCents;
    const qty = formatQty(it.qtyMilli, it.unitLabel === "кг" ? 3 : 0);
    out.push(
      row(
        `${it.name.slice(0, 26).padEnd(26)} ${qty} ${it.unitLabel} × ${formatCents(it.unitPriceCents)}`,
        `${formatCents(it.totalCents)} ${VAT_GROUPS[it.vatGroup].letter}`
      )
    );
  }
  const total = net + vat;

  out.push(line());
  out.push(row("Данъчна основа:", `${formatCents(net)} EUR`));
  out.push(row("ДДС:", `${formatCents(vat)} EUR`));
  out.push(row("ОБЩО ЗА ПЛАЩАНЕ:", `${formatCents(total)} EUR`));
  if (meta.dualDisplay) {
    out.push(row("Общо в лева:", `${formatCents(eurCentsToBgnCents(total))} лв.`));
    out.push(row("Курс:", `1 EUR = ${BGN_PER_EUR} лв.`));
  }
  out.push(line());
  if (meta.fiscalReceiptNo) {
    out.push(`Основание: фискален бон № ${meta.fiscalReceiptNo}`);
  }
  out.push(row(`Съставил: ${store.mol || "______________"}`, "Получил: ______________"));

  return out.join("\n");
}
