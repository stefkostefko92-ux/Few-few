import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseXml } from '../src/xml/parse.js';
import { readCamt053 } from '../src/bank/camt.js';
import { decodeCsv, parseAmount, parseDate, readCsv } from '../src/bank/csv.js';
import { BankFormatError } from '../src/bank/entries.js';
import { CAMT053 } from './fixtures/camt053.js';

/** SPEC 54: разчитане на извлеченията — само осчетоводените постъпления, суми в центове. */
test('camt.053: постъпленията, сборното — по транзакция; разход, сторно и чакащо — не', () => {
  const lines = readCamt053(parseXml(CAMT053));
  assert.equal(lines.length, 3);
  assert.deepEqual(lines[0], {
    bookingDate: '2026-11-12',
    amountCents: 12000n,
    currency: 'EUR',
    counterparty: 'Сладкарница Роза ЕООД',
    counterpartyIban: 'BG18RZBB91550123456789',
    remittance: 'Плащане по фактура 0000000001',
    bankRef: 'REF-001',
  });
  assert.equal(lines[1]!.amountCents, 10000n);
  assert.equal(lines[1]!.bankRef, 'REF-003#1');
  assert.equal(lines[2]!.remittance, 'INV 0000000003');
  assert.throws(() => readCamt053(parseXml('<Document><X/></Document>')), BankFormatError);
});

test('CSV: шапка над заглавието, „;“, десетична запетая, кредит/дебит', () => {
  const csv = [
    'Извлечение по сметка BG80BNBG96611020345678',
    '',
    'Дата;Наредител;Основание;Дебит;Кредит;Валута',
    '12.11.2026;Сладкарница Роза ЕООД;"Плащане по ф-ра 0000000001; благодарим";;"1 080,50";EUR',
    '12.11.2026;Наем;Наем ноември;500,00;;EUR',
    '13.11.2026;"Иван ""Ванко"" Петров";ф 2;;20,00;BGN',
  ].join('\r\n');
  const { entries: lines, skipped } = readCsv(csv);
  assert.equal(skipped, 0);
  assert.equal(lines.length, 2);
  assert.equal(lines[0]!.amountCents, 108050n);
  assert.equal(lines[0]!.remittance, 'Плащане по ф-ра 0000000001; благодарим');
  assert.equal(lines[1]!.counterparty, 'Иван "Ванко" Петров');
  assert.equal(lines[1]!.currency, 'BGN');
});

test('CSV: една колона „сума“ (положителна = постъпление), запетая като разделител', () => {
  const lines = readCsv(
    'Date,Amount,Description\n2026-11-13,120.00,INV 0000000001\n2026-11-13,-40.00,Fee\n',
  ).entries;
  assert.equal(lines.length, 1);
  assert.equal(lines[0]!.amountCents, 12000n);
  assert.throws(() => readCsv('a;b\n1;2\n'), BankFormatError);
});

test('windows-1251, суми и дати в различни записи', () => {
  const cp1251 = Buffer.from([0xc4, 0xe0, 0xf2, 0xe0]); // „Дата“
  assert.equal(decodeCsv(cp1251), 'Дата');
  assert.equal(parseAmount('1.080,00'), 108000n);
  assert.equal(parseAmount('1,080.00'), 108000n);
  assert.equal(parseAmount('1080'), 108000n);
  assert.equal(parseAmount('12,345'), 1234500n);
  assert.equal(parseAmount('x'), null);
  assert.equal(parseDate('3.1.2026'), '2026-01-03');
  assert.equal(parseDate('2026-11-13T10:00'), '2026-11-13');
  assert.equal(parseDate('31.02.2026'), null);
});

test('ревю: „1.080“ е хиляда, „+100“ се чете, неразчетената сума се брои; шапка с друг разделител', () => {
  assert.equal(parseAmount('1.080'), 108000n);
  assert.equal(parseAmount('1.080.500'), 108050000n);
  assert.equal(parseAmount('+100,00'), 10000n);
  const csv =
    'Банка ДСК, сметка BG80BNBG96611020345678, период 01.11–13.11\nДата;Основание;Кредит\n13.11.2026;ф 1;12,00\n13.11.2026;ф 2;сто\n';
  const result = readCsv(csv);
  assert.equal(result.entries.length, 1);
  assert.equal(result.skipped, 1);
  assert.throws(() => decodeCsv(Buffer.from('Дата;Сума\n13.11.2026;1\u0000\n')), BankFormatError);
});

test('ревю: сборно постъпление без суми по транзакции — един ред с цялата сума', () => {
  const xml = CAMT053.replace(
    '<TxDtls><AmtDtls><TxAmt><Amt Ccy="EUR">100.00</Amt></TxAmt></AmtDtls><RmtInf><Ustrd>ф-ра 2 частично</Ustrd></RmtInf></TxDtls>',
    '<TxDtls><RmtInf><Ustrd>ф-ра 2 частично</Ustrd></RmtInf></TxDtls>',
  );
  const lines = readCamt053(parseXml(xml));
  assert.equal(lines.length, 2);
  assert.equal(lines[1]!.amountCents, 30000n);
});
