import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { InvoiceInput } from '../src/einvoice/model.js';
import {
  PURCHASE_RECORD_LENGTH,
  purchaseJournal,
  supplierDocumentKey,
  type PurchaseEntry,
} from '../src/export/purchase-journal.js';
import {
  creditNote,
  domestic,
  foreignCurrency,
  notRegistered,
  reverseCharge,
  zeroRated,
} from './fixtures/einvoice-samples.js';

/**
 * POKUPKI.TXT по Приложение № 12 към чл. 113, ал. 4 ППЗДДС: 18 полета, 274 знака; позициите се броят по
 * дължините (сверено от Данъчника, 14.11.2026). Сумите — на ръка от примерите (fixtures/einvoice-samples.ts):
 * фирмата е получателят, доставчикът е от примера.
 */
const decode = (buffer: Buffer) => new TextDecoder('windows-1251').decode(buffer);
const at = (record: string, from: number, to: number) => record.slice(from - 1, to);
const amount = (record: string, index: number) => at(record, 168 + index * 15, 182 + index * 15);
const FIELD = {
  '03-30': 0,
  '03-31': 1,
  '03-41': 2,
  '03-32': 3,
  '03-42': 4,
  '03-43': 5,
  '03-44': 6,
};

const entry = (input: InvoiceInput, credit: PurchaseEntry['credit'] = 'FULL'): PurchaseEntry => ({
  number: input.number,
  typeCode: input.typeCode,
  issueDate: new Date(`${input.issueDate}T00:00:00Z`),
  credit,
  input,
});
const records = (file: Buffer) =>
  decode(file)
    .split('\r\n')
    .filter(Boolean)
    .map((r) => {
      assert.equal([...r].length, PURCHASE_RECORD_LENGTH);
      return r;
    });

test('пълен кредит: 274 знака + CR LF; основата и ДДС в 03-31/03-41; доставчикът в 03-08/03-09', () => {
  const result = purchaseJournal({
    vatNumber: 'BG131063188',
    period: '202611',
    entries: [entry(domestic)],
  });
  assert.equal(result.file.length, PURCHASE_RECORD_LENGTH + 2);
  assert.deepEqual([...result.file.subarray(-2)], [0x0d, 0x0a]);
  const [r] = records(result.file) as [string];
  assert.equal(at(r, 1, 15), 'BG131063188    ', '03-02');
  assert.equal(at(r, 16, 21), '202611', '03-01');
  assert.equal(at(r, 22, 25), '   0', '03-03');
  assert.equal(at(r, 26, 40), '1'.padStart(15), '03-04');
  assert.equal(at(r, 41, 42), '01', '03-05 — фактура');
  assert.equal(at(r, 43, 62), '0000000124'.padEnd(20), '03-06');
  assert.equal(at(r, 63, 72), '12/11/2026', '03-07');
  assert.equal(at(r, 73, 87), 'BG208725180    ', '03-08 — ДДС номер на доставчика');
  assert.equal(at(r, 88, 137), 'Карбон Стелт ЕДПК'.padEnd(50), '03-09');
  // S 20: 86.50 + S 9: 9.99 = 96.49; ДДС 17.30 + 0.90 = 18.20.
  assert.equal(amount(r, FIELD['03-31']), '96.49'.padStart(15));
  assert.equal(amount(r, FIELD['03-41']), '18.20'.padStart(15));
  assert.equal(amount(r, FIELD['03-30']), '0.00'.padStart(15));
  assert.equal(amount(r, FIELD['03-32']), '0.00'.padStart(15));
  assert.equal(at(r, 273, 274), '  ', '03-45 — не е по чл. 163а');
});

test('частичен кредит — 03-32/03-42; без право — основата и данъкът заедно в 03-30', () => {
  const partial = records(
    purchaseJournal({
      vatNumber: 'BG131063188',
      period: '202611',
      entries: [entry(domestic, 'PARTIAL')],
    }).file,
  )[0]!;
  assert.equal(amount(partial, FIELD['03-32']), '96.49'.padStart(15));
  assert.equal(amount(partial, FIELD['03-42']), '18.20'.padStart(15));
  assert.equal(amount(partial, FIELD['03-31']), '0.00'.padStart(15));
  const none = records(
    purchaseJournal({
      vatNumber: 'BG131063188',
      period: '202611',
      entries: [entry(domestic, 'NONE')],
    }).file,
  )[0]!;
  assert.equal(amount(none, FIELD['03-30']), '114.69'.padStart(15));
  assert.equal(amount(none, FIELD['03-41']), '0.00'.padStart(15));
});

test('кредитно известие — 03 с минус; нулева ставка и нерегистриран доставчик — 03-30; чужда валута — в евро', () => {
  const result = purchaseJournal({
    vatNumber: 'BG131063188',
    period: '202611',
    entries: [entry(creditNote), entry(zeroRated), entry(notRegistered), entry(foreignCurrency)],
  });
  assert.deepEqual(result.manual, []);
  const byNumber = new Map(records(result.file).map((r) => [at(r, 43, 62).trim(), r]));
  const cn = byNumber.get(creditNote.number)!;
  assert.equal(at(cn, 41, 42), '03');
  assert.equal(amount(cn, FIELD['03-31']), '-12.50'.padStart(15));
  assert.equal(amount(cn, FIELD['03-41']), '-2.50'.padStart(15));
  assert.equal(amount(byNumber.get(zeroRated.number)!, FIELD['03-30']), '1200.00'.padStart(15));
  // Нерегистриран доставчик — без ДДС номер; 03-08 е ЕИК-ът му (§ 1 от ДР на ППЗДДС, както в PRODAGBI).
  const nr = byNumber.get(notRegistered.number)!;
  assert.equal(amount(nr, FIELD['03-30']), '250.00'.padStart(15));
  // 100.00 USD по 1.0842 = 92.23 EUR; ДДС 18.45 EUR (BT-111).
  const usd = byNumber.get(foreignCurrency.number)!;
  assert.equal(amount(usd, FIELD['03-31']), '92.23'.padStart(15));
  assert.equal(amount(usd, FIELD['03-41']), '18.45'.padStart(15));
  // Сборовете — за справката.
  assert.equal(result.totals['03-31'], 9223n - 1250n);
  assert.equal(result.totals['03-30'], 120000n + 25000n);
});

test('за ръчно: доставчик извън България, обратно начисляване, непознат вид, неразчетен файл', () => {
  const foreignSeller: InvoiceInput = {
    ...domestic,
    number: 'DE-1',
    seller: { ...domestic.seller, address: { ...domestic.seller.address, countryCode: 'DE' } },
  };
  const result = purchaseJournal({
    vatNumber: 'BG131063188',
    period: '202611',
    entries: [
      entry(foreignSeller),
      entry(reverseCharge),
      { ...entry(domestic), number: 'X', typeCode: '389' },
      { ...entry(domestic), number: 'Y', input: null },
    ],
  });
  assert.equal(result.records, 0);
  // Подредени по дата и номер (както записите): 0000000126, DE-1, X, Y.
  assert.deepEqual(result.manual, [
    { number: reverseCharge.number, reason: 'category' },
    { number: 'DE-1', reason: 'foreign' },
    { number: 'X', reason: 'type' },
    { number: 'Y', reason: 'unreadable' },
  ]);
});

test('сума, която не се побира в 15 знака — за ръчно, не срив; сборовете — без нея', () => {
  const huge: InvoiceInput = {
    ...domestic,
    number: '0000000999',
    lines: domestic.lines.map((l) => ({ ...l, quantity: '1', netPrice: '9999999999999' })),
  };
  const result = purchaseJournal({
    vatNumber: 'BG131063188',
    period: '202611',
    entries: [entry(huge), entry(domestic)],
  });
  assert.deepEqual(result.manual, [{ number: '0000000999', reason: 'amount' }]);
  assert.equal(result.records, 1);
  assert.equal(result.totals['03-31'], 9649n);
});

test('решеното при зареждането (копие, анулиран…) и липсващата дата — за ръчно, не във файла', () => {
  const result = purchaseJournal({
    vatNumber: 'BG131063188',
    period: '202611',
    entries: [
      { ...entry(domestic), number: 'A', manual: 'duplicate' },
      { ...entry(domestic), number: 'B', issueDate: null },
      { ...entry(domestic), number: 'C', manual: 'cancelledLater', input: null },
    ],
  });
  assert.equal(result.records, 0);
  assert.equal(result.file.length, 0);
  assert.deepEqual(
    [...result.manual].sort((a, b) => a.number.localeCompare(b.number)),
    [
      { number: 'A', reason: 'duplicate' },
      { number: 'B', reason: 'date' },
      { number: 'C', reason: 'cancelledLater' },
    ],
  );
  assert.equal(result.totals['03-31'], 0n);
});

test('ключ на документа на доставчика: ДДС номер = ЕИК; друг вид или друг доставчик — друг документ', () => {
  const base = { number: '0000000124', typeCode: '380' };
  const byVat = supplierDocumentKey({ ...base, vatId: 'BG 208725180', name: 'Карбон' });
  assert.equal(byVat, supplierDocumentKey({ ...base, legalId: '208725180', name: 'Друго име' }));
  assert.notEqual(byVat, supplierDocumentKey({ ...base, typeCode: '381', vatId: 'BG208725180' }));
  assert.notEqual(byVat, supplierDocumentKey({ ...base, vatId: 'BG131063188' }));
  assert.equal(
    supplierDocumentKey({ ...base, name: 'Мелница „Злато“' }),
    supplierDocumentKey({ ...base, name: 'МЕЛНИЦА ЗЛАТО' }),
    'без номера — по наименованието',
  );
});
