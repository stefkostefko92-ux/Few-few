// Допълнителни тестове за ETL parse-логиката (src/lib/csv.js):
// граници на parseItalianNumber, quote-aware CSV (вградени кавички/раздели/
// нови редове) и четене по ИМЕ на колона (не по позиция). Допълва csv.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, parseRows, parseItalianNumber } from '../src/lib/csv.js';

// ---------- parseItalianNumber: граници ----------
test('parseItalianNumber — null/undefined/боклук → null', () => {
  assert.equal(parseItalianNumber(null), null);
  assert.equal(parseItalianNumber(undefined), null);
  assert.equal(parseItalianNumber('abc'), null);
  assert.equal(parseItalianNumber('12x'), null);
  assert.equal(parseItalianNumber('   '), null); // само празни знаци → ''
});

test('parseItalianNumber — приема число, не само низ', () => {
  assert.equal(parseItalianNumber(1234), 1234);
  assert.equal(parseItalianNumber(0), 0);
});

test('parseItalianNumber — много разделители на хиляди', () => {
  assert.equal(parseItalianNumber('1.234.567'), 1234567);
  assert.equal(parseItalianNumber('1.000.000,99'), 1000000.99);
});

test('parseItalianNumber — интервали като разделители на хиляди се махат', () => {
  assert.equal(parseItalianNumber('1 234,56'), 1234.56);
  assert.equal(parseItalianNumber(' 7.035 '), 7035);
});

test('parseItalianNumber — нула и десетична нула', () => {
  assert.equal(parseItalianNumber('0'), 0);
  assert.equal(parseItalianNumber('0,00'), 0);
  assert.equal(parseItalianNumber('0.00'), 0); // машинен формат
});

test('parseItalianNumber — отрицателен машинен формат', () => {
  assert.equal(parseItalianNumber('-3.50'), -3.5);
  assert.equal(parseItalianNumber('-1.234,5'), -1234.5);
});

test('parseItalianNumber — три десетични цифри НЕ са машинен формат', () => {
  // /^\-?\d+\.\d{1,2}$/ иска 1–2 десетични → „1.234" е хиляди, не 1,234
  assert.equal(parseItalianNumber('1.234'), 1234);
  assert.equal(parseItalianNumber('12.500'), 12500);
});

// ---------- CSV: quote-aware ----------
test('parseCsv — вградени раздели, кавички и нов ред в клетка', () => {
  const text =
    'nome;valore\n' +
    '"A;B";"riga1\nriga2"\n' +
    '"con ""virgolette""";x\n';
  const rows = parseCsv(text, { separator: ';' });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].nome, 'A;B'); // разделителят вътре в кавички е литерал
  assert.equal(rows[0].valore, 'riga1\nriga2'); // нов ред вътре в клетка
  assert.equal(rows[1].nome, 'con "virgolette"'); // "" → "
});

test('parseCsv — разделител запетая (,)', () => {
  const rows = parseCsv('a,b\n1,2\n', { separator: ',' });
  assert.deepEqual(rows, [{ a: '1', b: '2' }]);
});

test('parseCsv — CRLF окончания се чистят', () => {
  const rows = parseCsv('a;b\r\n1;2\r\n', { separator: ';' });
  assert.deepEqual(rows, [{ a: '1', b: '2' }]);
});

test('parseCsv — само заглавен ред → празен масив', () => {
  assert.deepEqual(parseCsv('a;b;c\n'), []);
  assert.deepEqual(parseCsv(''), []);
});

// ---------- Четене по ИМЕ на колона, не по позиция ----------
test('parseCsv — достъпът е по име: разбъркан ред на колоните', () => {
  // Същите три полета в различен ред → еднакъв достъп по ключ.
  const a = parseCsv('Codice;Valore;Tipo Rilevazione\n001;100;CE\n')[0];
  const b = parseCsv('Tipo Rilevazione;Codice;Valore\nCE;001;100\n')[0];
  assert.equal(a.Codice, '001');
  assert.equal(a.Valore, '100');
  assert.equal(a['Tipo Rilevazione'], 'CE');
  // независимо от позицията, ключовете сочат същите стойности
  assert.equal(b.Codice, '001');
  assert.equal(b.Valore, '100');
  assert.equal(b['Tipo Rilevazione'], 'CE');
});

test('parseCsv — липсваща в реда колона → празен низ, не грешка', () => {
  // редът има по-малко клетки от заглавието
  const row = parseCsv('a;b;c\n1;2\n')[0];
  assert.equal(row.a, '1');
  assert.equal(row.b, '2');
  assert.equal(row.c, ''); // (r[i] ?? '').trim()
});

test('parseCsv — висящ разделител в заглавието се игнорира', () => {
  const row = parseCsv('a;b;\n1;2;\n')[0];
  assert.deepEqual(Object.keys(row), ['a', 'b']); // празният ключ се пропуска
});

// ---------- parseRows: ниско ниво ----------
test('parseRows — BOM в началото се маха', () => {
  const rows = parseRows('﻿a;b\n1;2', ';');
  assert.deepEqual(rows[0], ['a', 'b']);
});

test('parseRows — последен ред без завършващ нов ред', () => {
  const rows = parseRows('a;b\n1;2', ';');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[1], ['1', '2']);
});

test('parseRows — празна клетка между разделители', () => {
  assert.deepEqual(parseRows('a;;c', ';')[0], ['a', '', 'c']);
});
