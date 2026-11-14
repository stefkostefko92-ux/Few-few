import assert from 'node:assert/strict';
import { test } from 'node:test';
import { salesJournal, RECORD_LENGTH, type JournalDocument } from '../src/export/sales-journal.js';
import { encodeCp1251 } from '../src/export/cp1251.js';
import {
  creditNote,
  domestic,
  foreignCurrency,
  notRegistered,
  reverseCharge,
  zeroRated,
} from './fixtures/einvoice-samples.js';

/**
 * PRODAGBI.TXT по Приложение № 12 към чл. 113, ал. 4 ППЗДДС: позициите се броят по дължините и реда на
 * таблицата (сверено с текста на 14.11.2026); windows-1251, CR LF, без разделители.
 */
const decode = (buffer: Buffer) => new TextDecoder('windows-1251').decode(buffer);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

function doc(input: unknown, extra: Partial<JournalDocument> = {}): JournalDocument {
  const typed = input as { number: string; typeCode: string; issueDate: string };
  return {
    number: typed.number,
    typeCode: typed.typeCode,
    status: 'ISSUED',
    issueDate: day(typed.issueDate),
    cancelledAt: null,
    input,
    ...extra,
  };
}

/** Поле по позициите от таблицата (от 1, включително). */
const at = (record: string, from: number, to: number) => record.slice(from - 1, to);
const amount = (record: string, index: number) => at(record, 168 + index * 15, 182 + index * 15);

test('фактура в евро: 424 знака + CR LF, полетата на местата си, суми по ставки', () => {
  const result = salesJournal({
    vatNumber: 'BG208725180',
    period: '202611',
    documents: [doc(domestic)],
  });
  assert.equal(result.records, 1);
  assert.equal(result.file.length, RECORD_LENGTH + 2);
  assert.deepEqual([...result.file.subarray(-2)], [0x0d, 0x0a]);
  const record = decode(result.file).slice(0, RECORD_LENGTH);
  assert.equal(at(record, 1, 15), 'BG208725180    ', '02-00');
  assert.equal(at(record, 16, 21), '202611', '02-01');
  assert.equal(at(record, 22, 25), '   0', '02-02 — без клонове');
  assert.equal(at(record, 26, 40), '1'.padStart(15), '02-03');
  assert.equal(at(record, 41, 42), '01', '02-04 — фактура');
  assert.equal(at(record, 43, 62), '0000000124'.padEnd(20), '02-05');
  assert.equal(at(record, 63, 72), '12/11/2026', '02-06');
  assert.equal(at(record, 73, 87), 'BG131063188    ', '02-07 — ДДС номер');
  assert.equal(at(record, 88, 137), 'Национална агенция за приходите'.padEnd(50), '02-08');
  // 02-10 = 11 + 12 + 13 + 14 + 15 + 16 + 26; 02-20 = 21 + 22 + 23 + 24.
  assert.equal(amount(record, 0), '96.49'.padStart(15), '02-10');
  assert.equal(amount(record, 1), '18.20'.padStart(15), '02-20');
  assert.equal(amount(record, 2), '86.50'.padStart(15), '02-11 — ДО 20 %');
  assert.equal(amount(record, 3), '17.30'.padStart(15), '02-21');
  assert.equal(amount(record, 8), '9.99'.padStart(15), '02-13 — ДО 9 %');
  assert.equal(amount(record, 9), '0.90'.padStart(15), '02-24');
  assert.equal(amount(record, 10), '0.00'.padStart(15), '02-14');
  assert.equal(at(record, 423, 424), '  ', '02-27 — не се попълва');
  // Кирилицата е по един байт (windows-1251), не UTF-8.
  assert.deepEqual(encodeCp1251('Ая№„“€'), Buffer.from([0xc0, 0xff, 0xb9, 0x84, 0x93, 0x88]));
});

test('кредитно известие — вид 03 и стойности с минус; номерацията тече без пропуски', () => {
  const result = salesJournal({
    vatNumber: 'BG208725180',
    period: '202611',
    documents: [doc(creditNote), doc(domestic)],
  });
  const [first, second] = decode(result.file).split('\r\n');
  assert.equal(at(first!, 41, 42), '01', 'по дата: фактурата от 12.11 е първа');
  assert.equal(at(second!, 26, 40), '2'.padStart(15));
  assert.equal(at(second!, 41, 42), '03');
  assert.match(amount(second!, 2), /^ +-\d+\.\d{2}$/);
  assert.equal(result.totals['02-11'] < 86_50n, true, 'известието намалява основата');
});

test('анулиране: в същия период — без стойности; в по-късен — същите с обратен знак', () => {
  const sameMonth = salesJournal({
    vatNumber: 'BG208725180',
    period: '202611',
    documents: [
      doc(domestic, { status: 'CANCELLED', cancelledAt: new Date('2026-11-20T10:00:00Z') }),
    ],
  });
  const blank = decode(sameMonth.file).slice(0, RECORD_LENGTH);
  assert.equal(at(blank, 168, 422), ' '.repeat(255), 'полетата за стойност са празни');
  assert.equal(sameMonth.totals['02-11'], 0n);

  const october = { ...domestic, issueDate: '2026-10-30' };
  const cancelled = doc(october, {
    status: 'CANCELLED',
    cancelledAt: new Date('2026-11-03T09:00:00Z'),
  });
  const issuedMonth = salesJournal({
    vatNumber: 'BG208725180',
    period: '202610',
    documents: [cancelled],
  });
  assert.equal(
    amount(decode(issuedMonth.file), 2),
    '86.50'.padStart(15),
    'в своя период — както е подаден',
  );
  const laterMonth = salesJournal({
    vatNumber: 'BG208725180',
    period: '202611',
    documents: [cancelled],
  });
  const reversed = decode(laterMonth.file);
  assert.equal(at(reversed, 63, 72), '30/10/2026', 'датата на анулирания документ');
  assert.equal(amount(reversed, 2), '-86.50'.padStart(15));
  assert.equal(amount(reversed, 3), '-17.30'.padStart(15));
});

test('валута — суми в евро; нулева ставка — 02-14; обратно начисляване и извън обхвата — за ръчно вписване', () => {
  const result = salesJournal({
    vatNumber: 'BG208725180',
    period: '202611',
    documents: [doc(foreignCurrency), doc(zeroRated), doc(reverseCharge), doc(notRegistered)],
  });
  assert.equal(result.records, 2);
  assert.equal(result.totals['02-11'], 92_23n);
  assert.equal(result.totals['02-21'], 18_45n);
  assert.ok(result.totals['02-14'] > 0n, 'чл. 30 — глава трета');
  assert.deepEqual(
    result.manual.map((m) => m.reason).sort(),
    ['category', 'category'],
    'AE и O — полето зависи от основанието',
  );
});

test('знак извън BMP (емоджи) в името: един байт „?“, записът остава 424 байта', () => {
  const emoji = { ...domestic, buyer: { ...domestic.buyer, name: 'Пекарна 😀 Зора ЕООД' } };
  const result = salesJournal({
    vatNumber: 'BG208725180',
    period: '202611',
    documents: [doc(emoji)],
  });
  assert.equal(result.file.length, RECORD_LENGTH + 2);
  const record = decode(result.file).slice(0, RECORD_LENGTH);
  assert.equal(at(record, 88, 137), 'Пекарна ? Зора ЕООД'.padEnd(50), '02-08 на мястото си');
  assert.equal(amount(record, 2), '86.50'.padStart(15), '02-11 не е отместено');
});
