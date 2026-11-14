import assert from 'node:assert/strict';
import { test } from 'node:test';
import { csvCell } from '../src/export/csv.js';

/** Регистърът в износа (dokumenti.csv): без формулна инжекция в Excel/LibreOffice (CWE-1236). */
test('водещи = + - @, табулация и CR се неутрализират с апостроф', () => {
  assert.equal(csvCell("=cmd|' /C calc'!A1"), "'=cmd|' /C calc'!A1");
  assert.equal(csvCell('+1+1'), "'+1+1");
  assert.equal(csvCell('-2+3'), "'-2+3");
  assert.equal(csvCell('@SUM(1+1)'), "'@SUM(1+1)");
  assert.equal(csvCell('\t=1+1'), "'\t=1+1");
  assert.equal(csvCell('\r=1+1'), `"'\r=1+1"`);
});

test('сумите остават числа, разделителите и кавичките се ограждат', () => {
  assert.equal(csvCell('-120.50'), '-120.50');
  assert.equal(csvCell('1200.00'), '1200.00');
  assert.equal(csvCell('Пекарна „Зора“ ЕООД'), 'Пекарна „Зора“ ЕООД');
  assert.equal(csvCell('А; Б'), '"А; Б"');
  assert.equal(csvCell('Казах "да"'), '"Казах ""да"""');
  assert.equal(csvCell('=A1;B1'), `"'=A1;B1"`);
});
