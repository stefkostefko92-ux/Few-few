import { dec, isDecimalText, round, toCents } from '../einvoice/decimal.js';
import { isIsoDate } from '../recurring/schedule.js';
import { BankFormatError, MAX_ENTRIES, type BankEntry } from './entries.js';

/**
 * Банково извлечение като CSV (SPEC 54): кодировка UTF-8 или windows-1251 (честа при българските
 * банки), разделител „;“, „,“ или табулация, десетичен знак запетая или точка, дати „дд.мм.гггг“ или
 * „гггг-мм-дд“. Колоните се разпознават по заглавието (БГ/EN). Само постъпленията: колона „кредит“
 * или положителна „сума“.
 */
const COLUMNS = {
  date: [
    'дата',
    'дата на операция',
    'дата на осчетоводяване',
    'вальор',
    'дата вальор',
    'date',
    'booking date',
    'value date',
    'posting date',
  ],
  amount: ['сума', 'amount', 'стойност'],
  credit: ['кредит', 'credit', 'постъпления', 'приход', 'в кредит', 'credit amount'],
  debit: ['дебит', 'debit', 'плащания', 'разход', 'в дебит', 'debit amount'],
  currency: ['валута', 'currency', 'ccy'],
  remittance: [
    'основание',
    'описание',
    'детайли',
    'информация',
    'основание за плащане',
    'reference',
    'description',
    'details',
    'payment details',
    'narrative',
    'remittance',
  ],
  counterparty: [
    'наредител',
    'контрагент',
    'платец',
    'име на контрагент',
    'наредител/получател',
    'counterparty',
    'payer',
    'name',
    'counterparty name',
  ],
  iban: [
    'iban',
    'сметка на контрагент',
    'сметка на наредителя',
    'iban на контрагент',
    'counterparty iban',
    'account',
  ],
  ref: ['референция', 'номер на операция', 'reference number', 'transaction id', 'id'],
} as const;
type Column = keyof typeof COLUMNS;

export function decodeCsv(buffer: Buffer): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\uFEFF/, '');
  } catch {
    try {
      text = new TextDecoder('windows-1251', { fatal: true }).decode(buffer);
    } catch {
      throw new BankFormatError('encoding');
    }
  }
  // 0x00 минава декодера, но PostgreSQL го отказва в TEXT — грешка на файла, не 500.
  if (text.includes('\u0000')) throw new BankFormatError('encoding');
  return text;
}

/** RFC 4180: кавички, удвоени кавички, нови редове вътре в полето. */
export function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"' && field === '') {
      quoted = true;
    } else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
      row = [];
      if (rows.length > MAX_ENTRIES + 1) throw new BankFormatError('tooMany');
    } else {
      field += c;
    }
  }
  row.push(field);
  if (row.some((cell) => cell.trim() !== '')) rows.push(row);
  return rows;
}

const norm = (value: string) =>
  value.trim().toLowerCase().replace(/[„“"]/g, '').replace(/\s+/g, ' ');

/** „1 080,00“, „1.080,00“, „1,080.00“, „1080.00“, „-50,5“ → центове. */
export function parseAmount(raw: string | undefined): bigint | null {
  let v = (raw ?? '')
    .replace(/[\s\u00a0']/g, '')
    .replace(/[A-Za-z€]/g, '')
    .replace(/^\+/, '');
  if (!v) return null;
  // Само точки, всяка следвана от точно 3 цифри („1.080“, „1.080.500“) — разделители за хилядни.
  if (!v.includes(',') && /^-?\d{1,3}(\.\d{3})+$/.test(v)) v = v.split('.').join('');
  const lastComma = v.lastIndexOf(',');
  const lastDot = v.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    const decimal = lastComma > lastDot ? ',' : '.';
    const thousands = decimal === ',' ? '.' : ',';
    v = v.split(thousands).join('').replace(decimal, '.');
  } else if (lastComma > -1) {
    v = v.length - lastComma - 1 <= 2 ? v.replace(',', '.') : v.split(',').join('');
  }
  if (!isDecimalText(v)) return null;
  return toCents(round(dec(v), 2));
}

/** „13.11.2026“, „13/11/2026“, „2026-11-13“, „13.11.2026 10:15“ → „2026-11-13“. */
export function parseDate(raw: string | undefined): string | null {
  const v = (raw ?? '').trim();
  const bg = /^(\d{1,2})[./](\d{1,2})[./](\d{4})/.exec(v);
  const iso = bg
    ? `${bg[3]}-${bg[2]!.padStart(2, '0')}-${bg[1]!.padStart(2, '0')}`
    : v.slice(0, 10);
  return isIsoDate(iso) ? iso : null;
}

function findHeader(rows: string[][]): number {
  return rows.findIndex((row) => {
    const cells = row.map(norm);
    const has = (col: Column) => cells.some((c) => (COLUMNS[col] as readonly string[]).includes(c));
    return has('date') && (has('amount') || has('credit'));
  });
}

export interface CsvResult {
  entries: BankEntry[];
  /** Редове с дата, но с неразчетена сума — показват се, не изчезват тихо. */
  skipped: number;
}

export function readCsv(text: string, defaultCurrency = 'EUR'): CsvResult {
  // Заглавието може да не е на първия ред (банките слагат шапка със сметката, понякога с друг
  // разделител) — разделителят е този, с който се намира ред с дата и сума.
  let rows: string[][] = [];
  let headerIndex = -1;
  for (const delimiter of [';', ',', '\t']) {
    rows = parseCsv(text, delimiter);
    headerIndex = findHeader(rows);
    if (headerIndex !== -1) break;
  }
  if (headerIndex === -1) throw new BankFormatError('csvHeader');
  const header = rows[headerIndex]!.map(norm);
  const index = (col: Column) =>
    header.findIndex((c) => (COLUMNS[col] as readonly string[]).includes(c));
  const columns = Object.fromEntries(
    (Object.keys(COLUMNS) as Column[]).map((col) => [col, index(col)]),
  ) as Record<Column, number>;
  const cell = (row: string[], col: Column) =>
    columns[col] >= 0 ? (row[columns[col]] ?? '').trim() : '';
  const out: BankEntry[] = [];
  let skipped = 0;
  for (const row of rows.slice(headerIndex + 1)) {
    const date = parseDate(cell(row, 'date'));
    if (!date) continue;
    const raw = columns.credit >= 0 ? cell(row, 'credit') : cell(row, 'amount');
    let amount = parseAmount(raw);
    if (raw && amount === null) {
      skipped += 1;
      continue;
    }
    // Само „сума“: положителна = постъпление; ако има и „дебит“ с число — разход.
    if (columns.credit < 0 && columns.debit >= 0 && parseAmount(cell(row, 'debit'))) amount = null;
    if (amount === null || amount <= 0n) continue;
    out.push({
      bookingDate: date,
      amountCents: amount,
      currency: (cell(row, 'currency') || defaultCurrency).toUpperCase().slice(0, 3),
      counterparty: cell(row, 'counterparty').slice(0, 200) || undefined,
      counterpartyIban:
        cell(row, 'iban').replace(/\s/g, '').toUpperCase().slice(0, 34) || undefined,
      remittance: cell(row, 'remittance').replace(/\s+/g, ' ').slice(0, 1000),
      bankRef: cell(row, 'ref').slice(0, 100) || undefined,
    });
  }
  if (out.length === 0 && rows.length <= headerIndex + 1) throw new BankFormatError('csvEmpty');
  return { entries: out, skipped };
}
