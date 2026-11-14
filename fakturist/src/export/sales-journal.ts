import { calculate, type VatBreakdown } from '../einvoice/calculate.js';
import { InvoiceInputSchema } from '../einvoice/model.js';
import { toCents, type Dec } from '../einvoice/decimal.js';
import { sofiaToday } from '../time.js';
import { encodeCp1251 } from './cp1251.js';

/**
 * Дневникът за продажбите като файл PRODAGBI.TXT (SPEC 61) — по Приложение № 12 към чл. 113, ал. 4
 * ППЗДДС (последно изм. ДВ бр. 55/2023; текстът — сверен на 14.11.2026 по консолидирано копие):
 * windows-1251, един запис на ред с CR LF, полета с фиксирана дължина без разделители; символните — вляво,
 * допълнени с интервали; цифровите — вдясно, с „.“ и два знака след нея, минус при отрицателна стойност;
 * датата — дд/мм/гггг. Сумите — в евро (ЗВЕРБ, чл. 11, ал. 4 и чл. 50, ал. 1 — за периоди от 2026 г.).
 *
 * Файлът е за внос в програмата на НАП или в счетоводната програма — подава го фирмата, не ние. Каквото
 * не се разпределя еднозначно по полетата (обратно начисляване, извън обхвата, непозната ставка), не се
 * гадае: документът излиза в списъка „за ръчно вписване“.
 */
export const RECORD_LENGTH = 424;

/**
 * Нулевата ставка по чл. 140, 146, ал. 1 и 173 ЗДДС — своето поле (02-16) и свой код в SAF-T (100216).
 * Краят на номера е изричен: `\b` в JS не познава кирилицата и би приел „чл. 140а“ за чл. 140.
 */
export const ZERO_RATE_SPECIAL = /чл\.\s*(140|146|173)(?![0-9а-яА-Я])/;
const NO_ID = '999999999999999';

/** Полетата по реда на таблицата в Приложение № 12 (код, дължина). */
const AMOUNT_FIELDS = [
  '02-10',
  '02-20',
  '02-11',
  '02-21',
  '02-12',
  '02-26',
  '02-22',
  '02-23',
  '02-13',
  '02-24',
  '02-14',
  '02-15',
  '02-16',
  '02-17',
  '02-18',
  '02-19',
  '02-25',
] as const;
export type AmountField = (typeof AMOUNT_FIELDS)[number];

/** Вид на документа (02-04): фактура и авансова фактура — 01, дебитно — 02, кредитно — 03. */
const DOCUMENT_KIND: Record<string, string> = {
  '380': '01',
  '386': '01',
  '383': '02',
  '381': '03',
};

export interface JournalDocument {
  number: string | null;
  typeCode: string;
  status: string;
  issueDate: Date;
  cancelledAt: Date | null;
  input: unknown;
}

export type ManualReason = 'category' | 'rate' | 'type' | 'currency';
export interface JournalResult {
  file: Buffer;
  records: number;
  totals: Record<AmountField, bigint>;
  manual: Array<{ number: string; reason: ManualReason }>;
}

/** По знаци (code points), не по UTF-16 единици: знак извън BMP е един байт в cp1251 („?“), не два. */
const text = (value: string, length: number) => {
  const chars = [...value.replace(/[\r\n\t]+/g, ' ')].slice(0, length);
  return chars.join('') + ' '.repeat(length - chars.length);
};
const digits = (value: number | bigint | string, length: number) =>
  String(value).padStart(length, ' ');

export function amountText(cents: bigint): string {
  const sign = cents < 0n ? '-' : '';
  const abs = cents < 0n ? -cents : cents;
  return `${sign}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
}

function dayText(date: Date): string {
  const [y, m, d] = date.toISOString().slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

const cents = (value: Dec | null) => (value ? toCents(value) : 0n);

/** Разбивката по ставки → полетата; null — не се разпределя еднозначно. */
function amounts(
  breakdown: readonly VatBreakdown[],
  inEur: boolean,
): { values: Partial<Record<AmountField, bigint>> } | { manual: ManualReason } {
  const values: Partial<Record<AmountField, bigint>> = {};
  const put = (field: AmountField, value: bigint) => {
    values[field] = (values[field] ?? 0n) + value;
  };
  for (const group of breakdown) {
    const base = inEur ? cents(group.taxable) : cents(group.taxableEur);
    const vat = inEur ? cents(group.vat) : cents(group.vatEur);
    if (!inEur && group.taxableEur === null) return { manual: 'currency' };
    const rate = group.rate ? Number(toCents(group.rate)) / 100 : null;
    if (group.category === 'S' && rate === 20) {
      put('02-11', base);
      put('02-21', vat);
    } else if (group.category === 'S' && rate === 9) {
      put('02-13', base);
      put('02-24', vat);
    } else if (group.category === 'S') {
      return { manual: 'rate' };
    } else if (group.category === 'K') {
      put('02-15', base);
    } else if (group.category === 'G') {
      // Износът е по чл. 28 — в глава трета от ЗДДС.
      put('02-14', base);
    } else if (group.category === 'Z') {
      // Нулевата ставка по чл. 140, 146, ал. 1 и 173 има свое поле; другата по глава трета — 02-14.
      put(ZERO_RATE_SPECIAL.test(group.exemptionReason ?? '') ? '02-16' : '02-14', base);
    } else if (group.category === 'E') {
      put('02-19', base);
    } else {
      // AE (обратно начисляване) и O (извън обхвата): полето зависи от основанието (чл. 21, ал. 2,
      // чл. 69, ал. 2, чл. 163а…) — решава счетоводителят.
      return { manual: 'category' };
    }
  }
  values['02-10'] =
    (values['02-11'] ?? 0n) +
    (values['02-12'] ?? 0n) +
    (values['02-13'] ?? 0n) +
    (values['02-14'] ?? 0n) +
    (values['02-15'] ?? 0n) +
    (values['02-16'] ?? 0n) +
    (values['02-26'] ?? 0n);
  values['02-20'] =
    (values['02-21'] ?? 0n) +
    (values['02-22'] ?? 0n) +
    (values['02-23'] ?? 0n) +
    (values['02-24'] ?? 0n);
  return { values };
}

function counterpartyId(buyer: {
  vatId?: string | undefined;
  legalId?: string | undefined;
  address: { countryCode: string };
}): string {
  if (buyer.vatId) return buyer.vatId.replace(/\s+/g, '').slice(0, 15);
  // Неregистриран по ДДС в България — ЕИК (§ 1 от ДР на ППЗДДС); чуждестранно лице без номер — 9-ки.
  if (buyer.address.countryCode === 'BG' && buyer.legalId) return buyer.legalId.slice(0, 15);
  return NO_ID;
}

/**
 * Записите за периода `ггггмм`: издадените в него (анулиран в същия период — без стойности) и
 * анулираните в него документи от по-ранен период (същите стойности с обратен знак). Кредитното
 * известие намалява основата — стойностите му са с минус (сборовете на дневника са сборовете на
 * справка-декларацията; приложението иска еднакъв знак в един запис).
 */
export function salesJournal(input: {
  vatNumber: string;
  period: string;
  documents: readonly JournalDocument[];
}): JournalResult {
  const { vatNumber, period } = input;
  const inPeriod = (date: Date) => sofiaToday(date).slice(0, 7).replace('-', '') === period;
  const issueDay = (date: Date) => date.toISOString().slice(0, 7).replace('-', '');
  const lines: string[] = [];
  const manual: JournalResult['manual'] = [];
  const totals = Object.fromEntries(AMOUNT_FIELDS.map((f) => [f, 0n])) as Record<
    AmountField,
    bigint
  >;

  type Row = { doc: JournalDocument; mode: 'normal' | 'blank' | 'reverse' };
  const rows = input.documents
    .flatMap((doc): Row[] => {
      const issued = issueDay(doc.issueDate) === period;
      const cancelledHere = doc.cancelledAt !== null && inPeriod(doc.cancelledAt);
      if (issued) return [{ doc, mode: cancelledHere ? 'blank' : 'normal' }];
      if (cancelledHere && doc.status === 'CANCELLED') return [{ doc, mode: 'reverse' }];
      return [];
    })
    .sort(
      (a, b) =>
        Number(a.mode === 'reverse') - Number(b.mode === 'reverse') ||
        a.doc.issueDate.getTime() - b.doc.issueDate.getTime() ||
        (a.doc.number ?? '').localeCompare(b.doc.number ?? ''),
    );

  for (const { doc, mode } of rows) {
    const number = doc.number ?? '';
    const kind = DOCUMENT_KIND[doc.typeCode];
    if (!kind) {
      manual.push({ number, reason: 'type' });
      continue;
    }
    const parsed = InvoiceInputSchema.parse(doc.input);
    const calc = calculate(parsed);
    const split = amounts(calc.breakdown, parsed.currency === 'EUR');
    if ('manual' in split) {
      manual.push({ number, reason: split.manual });
      continue;
    }
    const sign = (doc.typeCode === '381' ? -1n : 1n) * (mode === 'reverse' ? -1n : 1n);
    const fields = AMOUNT_FIELDS.map((field) => {
      if (mode === 'blank') return ' '.repeat(15);
      const value = (split.values[field] ?? 0n) * sign;
      totals[field] += value;
      return digits(amountText(value), 15);
    }).join('');
    const record = [
      text(vatNumber, 15),
      text(period, 6),
      digits(0, 4),
      digits(lines.length + 1, 15),
      text(kind, 2),
      text(number, 20),
      text(dayText(doc.issueDate), 10),
      text(counterpartyId(parsed.buyer), 15),
      text(parsed.buyer.name, 50),
      text(parsed.lines[0]?.name ?? '', 30),
      fields,
      text('', 2),
    ].join('');
    // Дължината — по знаци (= байтовете в cp1251), не по UTF-16 единици.
    const size = [...record].length;
    if (size !== RECORD_LENGTH) throw new Error(`Запис с дължина ${size}`);
    lines.push(record);
  }
  return {
    file: encodeCp1251(lines.map((line) => `${line}\r\n`).join('')),
    records: lines.length,
    totals,
    manual,
  };
}
