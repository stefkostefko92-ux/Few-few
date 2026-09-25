import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, parseItalianNumber, parseRows, fixMojibake } from '../src/lib/csv.js';

test('fixMojibake — поправя двойно кодиран UTF-8, пази чистия текст', () => {
  // „perÃ²“ (Ã=U+00C3, ²=U+00B2) → „però“
  assert.equal(fixMojibake('perÃ²'), 'però');
  // чист италиански текст с акценти НЕ се променя
  assert.equal(fixMojibake('QUALITÀ e società'), 'QUALITÀ e società');
  assert.equal(fixMojibake('normale'), 'normale');
  assert.equal(fixMojibake(''), '');
});

test('parseCsv — заглавия, кавички и висящ разделител', () => {
  const text = '"A";"B";\n"1";"x;y";\n"2";"със ""кавички""";\n';
  const rows = parseCsv(text, { separator: ';' });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { A: '1', B: 'x;y' });
  assert.deepEqual(rows[1], { A: '2', B: 'със "кавички"' });
});

test('parseCsv — BOM и празни редове', () => {
  const text = '﻿a;b\n1;2\n\n';
  const rows = parseCsv(text);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], { a: '1', b: '2' });
});

test('parseRows — нов ред вътре в кавички', () => {
  const rows = parseRows('a;"x\ny"\n1;2', ';');
  assert.deepEqual(rows[0], ['a', 'x\ny']);
  assert.deepEqual(rows[1], ['1', '2']);
});

test('parseItalianNumber — италиански и машинен формат', () => {
  assert.equal(parseItalianNumber('7.035'), 7035); // хиляди с точка
  assert.equal(parseItalianNumber('1.234,56'), 1234.56); // ит. десетични
  assert.equal(parseItalianNumber('7858272000.00'), 7858272000); // машинен
  assert.equal(parseItalianNumber('123'), 123);
  assert.equal(parseItalianNumber(''), null);
  assert.equal(parseItalianNumber('-'), null);
  assert.equal(parseItalianNumber('-12,5'), -12.5);
});
