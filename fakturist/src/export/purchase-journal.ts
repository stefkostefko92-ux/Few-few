import { calculate } from '../einvoice/calculate.js';
import type { InvoiceInput } from '../einvoice/model.js';
import { toCents } from '../einvoice/decimal.js';
import { encodeCp1251 } from './cp1251.js';
import {
  amountCells,
  cents,
  counterpartyId,
  dayText,
  digits,
  DOCUMENT_KIND,
  text,
} from './journal-format.js';

/**
 * Дневникът за покупките като файл POKUPKI.TXT — по Приложение № 12 към чл. 113, ал. 4 ППЗДДС (записът —
 * по консолидираното копие, сверено от Данъчника на 14.11.2026; nra.bg не се отваря): windows-1251, един
 * запис на ред с CR LF, 18 полета без разделители — 274 знака; суми в евро (ЗВЕРБ, както PRODAGBI.TXT).
 *
 * Полетата за суми: 03-30 — основа и данък без право на кредит или без данък; 03-31/03-41 — основа и ДДС с
 * пълен кредит; 03-32/03-42 — с частичен (чл. 73); 03-43 (годишна корекция) и 03-44 (посредник в тристранна
 * операция) не се попълват от фактури. Правото на кредит е на фактурата (SPEC 68) — избира счетоводителят.
 *
 * Не се гадае — „за ръчно“: доставчик извън България (ВОП, внос, получени доставки по чл. 82 искат
 * протокол по чл. 117 и самоначисляване), обратно начисляване и ВОД от български доставчик, ставка
 * различна от 20 % и 9 %, вид документ извън 380/381/383/386, файл, който не се разчита по модела, сума,
 * която не се побира в полето. Решенията, които искат базата (копие, анулиране, проверка на файла), идват
 * готови от `purchase-load.ts` в `manual`.
 */
export const PURCHASE_RECORD_LENGTH = 274;

const AMOUNT_FIELDS = ['03-30', '03-31', '03-41', '03-32', '03-42', '03-43', '03-44'] as const;
export type PurchaseField = (typeof AMOUNT_FIELDS)[number];

export type PurchaseManualReason =
  | 'foreign'
  | 'category'
  | 'rate'
  | 'type'
  | 'currency'
  | 'unreadable'
  | 'amount'
  | 'date'
  | 'duplicate'
  | 'invalid'
  | 'buyer'
  | 'cancelled'
  | 'cancelledLater';

export interface PurchaseEntry {
  number: string;
  typeCode: string;
  /** null — файлът няма дата на издаване (полето 03-07 е задължително). */
  issueDate: Date | null;
  credit: 'FULL' | 'PARTIAL' | 'NONE';
  /** Входът по EN 16931; null — файлът не се разчита по модела. */
  input: InvoiceInput | null;
  /** Решено от зареждането — документът не влиза във файла, а в списъка „за ръчно“. */
  manual?: PurchaseManualReason;
}

/**
 * Един и същ документ на доставчика: идентификатор + номер + вид. ДДС номерът е без префикса на държавата
 * (BG131063188 и ЕИК 131063188 са един доставчик); без номера — наименованието. Номерът — без водещи нули
 * и интервали: „0000000123“ и „123“ са едно и също за доставчика, различни за нас биха дали двойно броене.
 */
export function supplierDocumentKey(input: {
  vatId?: string | null | undefined;
  legalId?: string | null | undefined;
  name?: string | null | undefined;
  number: string;
  typeCode: string;
}): string {
  const clean = (value: string) => value.replace(/[^0-9A-Za-zА-Яа-я]/g, '').toUpperCase();
  const vat = input.vatId ? clean(input.vatId).replace(/^[A-Z]{2}/, '') : '';
  const supplier = vat || clean(input.legalId ?? '') || `name:${clean(input.name ?? '')}`;
  const number = clean(input.number).replace(/^0+(?=.)/, '');
  return `${supplier}|${number}|${input.typeCode}`;
}

export interface PurchaseJournalResult {
  file: Buffer;
  records: number;
  totals: Record<PurchaseField, bigint>;
  manual: Array<{ number: string; reason: PurchaseManualReason }>;
}

type Split = { values: Partial<Record<PurchaseField, bigint>> } | { manual: PurchaseManualReason };

function amounts(input: InvoiceInput, credit: PurchaseEntry['credit']): Split {
  if (input.seller.address.countryCode !== 'BG') return { manual: 'foreign' };
  const inEur = input.currency === 'EUR';
  const values: Partial<Record<PurchaseField, bigint>> = {};
  const put = (field: PurchaseField, value: bigint) => {
    values[field] = (values[field] ?? 0n) + value;
  };
  for (const group of calculate(input).breakdown) {
    if (!inEur && group.taxableEur === null) return { manual: 'currency' };
    const base = inEur ? cents(group.taxable) : cents(group.taxableEur);
    const vat = inEur ? cents(group.vat) : cents(group.vatEur);
    if (group.category === 'S') {
      const rate = group.rate ? Number(toCents(group.rate)) / 100 : null;
      if (rate !== 20 && rate !== 9) return { manual: 'rate' };
      if (credit === 'FULL') {
        put('03-31', base);
        put('03-41', vat);
      } else if (credit === 'PARTIAL') {
        put('03-32', base);
        put('03-42', vat);
      } else {
        put('03-30', base + vat);
      }
    } else if (['Z', 'E', 'G', 'O'].includes(group.category)) {
      // Доставка без данък (нулева ставка, освободена, от нерегистриран доставчик) — 03-30.
      put('03-30', base);
    } else {
      // AE (обратно начисляване по чл. 163а) и K от български доставчик — протокол по чл. 117.
      return { manual: 'category' };
    }
  }
  return { values };
}

export function purchaseJournal(input: {
  vatNumber: string;
  period: string;
  entries: readonly PurchaseEntry[];
}): PurchaseJournalResult {
  const { vatNumber, period } = input;
  const lines: string[] = [];
  const manual: PurchaseJournalResult['manual'] = [];
  const totals = Object.fromEntries(AMOUNT_FIELDS.map((f) => [f, 0n])) as Record<
    PurchaseField,
    bigint
  >;
  const time = (date: Date | null) => date?.getTime() ?? 0;
  const entries = [...input.entries].sort(
    (a, b) => time(a.issueDate) - time(b.issueDate) || a.number.localeCompare(b.number),
  );
  for (const entry of entries) {
    if (entry.manual) {
      manual.push({ number: entry.number, reason: entry.manual });
      continue;
    }
    if (!entry.issueDate) {
      manual.push({ number: entry.number, reason: 'date' });
      continue;
    }
    const kind = DOCUMENT_KIND[entry.typeCode];
    if (!kind) {
      manual.push({ number: entry.number, reason: 'type' });
      continue;
    }
    if (!entry.input) {
      manual.push({ number: entry.number, reason: 'unreadable' });
      continue;
    }
    const split = amounts(entry.input, entry.credit);
    if ('manual' in split) {
      manual.push({ number: entry.number, reason: split.manual });
      continue;
    }
    // Кредитното известие намалява — с минус (както в PRODAGBI.TXT; сверява се с програмата на НАП).
    const sign = entry.typeCode === '381' ? -1n : 1n;
    const values = AMOUNT_FIELDS.map((field) => (split.values[field] ?? 0n) * sign);
    const fields = amountCells(values);
    if (fields === null) {
      manual.push({ number: entry.number, reason: 'amount' });
      continue;
    }
    AMOUNT_FIELDS.forEach((field, i) => (totals[field] += values[i]!));
    const record = [
      text(vatNumber, 15),
      text(period, 6),
      digits(0, 4),
      digits(lines.length + 1, 15),
      text(kind, 2),
      text(entry.number, 20),
      text(dayText(entry.issueDate), 10),
      text(counterpartyId(entry.input.seller), 15),
      text(entry.input.seller.name, 50),
      text(entry.input.lines[0]?.name ?? '', 30),
      fields,
      text('', 2),
    ].join('');
    const size = [...record].length;
    if (size !== PURCHASE_RECORD_LENGTH) throw new Error(`Запис с дължина ${size}`);
    lines.push(record);
  }
  return {
    file: encodeCp1251(lines.map((line) => `${line}\r\n`).join('')),
    records: lines.length,
    totals,
    manual,
  };
}
