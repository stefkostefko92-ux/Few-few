// CSV for Excel (point D2): semicolon (the Italian Excel), every cell quoted, CRLF, a BOM so that Excel reads
// UTF-8. A cell that starts like a formula (= + - @, tab, CR) gets an apostrophe in front — a value written by
// someone can never run in the spreadsheet of who opens the file (CSV injection, OWASP).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cellaCsv, righeCsv } from '../src/http/csv.js';

describe('CSV', () => {
  it('quotes every cell and doubles the quotes', () => {
    assert.equal(cellaCsv('Via Roma 1'), '"Via Roma 1"');
    assert.equal(cellaCsv('Condominio "Il Faro"'), '"Condominio ""Il Faro"""');
    assert.equal(cellaCsv(null), '""');
    assert.equal(cellaCsv(12), '"12"');
    assert.equal(cellaCsv('riga\nnuova'), '"riga\nnuova"');
  });

  it('never lets a value become a formula', () => {
    for (const bad of [
      '=1+1',
      '+39 02 123',
      '-2',
      '@SUM(A1)',
      '\t=1',
      '\r=1',
      '=HYPERLINK("http://x")',
    ])
      assert.ok(cellaCsv(bad).startsWith(`"'`), bad);
    assert.equal(cellaCsv('=cmd|"/c calc"!A1'), `"'=cmd|""/c calc""!A1"`);
  });

  it('writes the file: BOM, header, semicolons, CRLF', () => {
    const csv = righeCsv(
      ['N°', 'Indirizzo'],
      [
        ['1', 'Via Roma; 2'],
        ['2', null],
      ],
    );
    assert.equal(csv, '﻿"N°";"Indirizzo"\r\n"1";"Via Roma; 2"\r\n"2";""\r\n');
  });
});
