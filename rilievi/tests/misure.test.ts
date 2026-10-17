import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { MisuraBottoniera } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { viewHelpers } from '../src/http/view.js';
import { translatorFor } from '../src/i18n.js';
import { misuraOf, misureFormRows, misureTable, MAX_MISURE } from '../src/schede/misure.js';
import { formValuesFromBody, parseScheda } from '../src/schede/validation.js';

const base = { data: '2026-10-12', matricola: '33871', fermate: '3', bottoniereMisure: 'si' };

describe('old push-button panel measurements', () => {
  it('read one row per stop: floor name, length and width in mm, both hole spacings, display', () => {
    const result = parseScheda({
      ...base,
      'mb-1-piano': 'S1',
      'mb-1-lunghezzaMm': '320,5',
      'mb-1-larghezzaMm': '105',
      'mb-1-interasseSuperiore': '60 mm',
      'mb-1-interasseInferiore': '2 fori, 60 mm',
      'mb-1-display': 'si',
      'mb-2-piano': '2',
      'mb-3-piano': '3',
      'mb-3-display': 'no',
    });
    if (!result.ok) assert.fail(JSON.stringify(result.errors));
    assert.deepEqual(result.data.misureBottoniere, [
      {
        fermata: 1,
        piano: 'S1',
        lunghezzaMm: '320.50',
        larghezzaMm: '105.00',
        interasseSuperiore: '60 mm',
        interasseInferiore: '2 fori, 60 mm',
        display: true,
      },
      // Row 2 is empty (the floor name is its number): not stored. Row 3 keeps its "no".
      {
        fermata: 3,
        piano: null,
        lunghezzaMm: null,
        larghezzaMm: null,
        interasseSuperiore: null,
        interasseInferiore: null,
        display: false,
      },
    ]);
    assert.equal(result.data.bottoniereMisure, true);
  });

  it('ignore rows above the number of stops and every row when the answer is not "si"', () => {
    const above = parseScheda({ ...base, fermate: '1', 'mb-2-lunghezzaMm': 'abc' });
    assert.ok(above.ok, 'a hidden row beyond the stops is not read');
    assert.deepEqual(above.ok && above.data.misureBottoniere, []);
    const no = parseScheda({ ...base, bottoniereMisure: 'no', 'mb-1-lunghezzaMm': '300' });
    assert.deepEqual(no.ok && no.data.misureBottoniere, []);
  });

  it('report a wrong cell under its own name, with the other errors of the form', () => {
    const result = parseScheda({
      ...base,
      portataKg: 'x',
      'mb-2-lunghezzaMm': '6000',
      'mb-3-interasseSuperiore': 'x'.repeat(61),
      'mb-3-display': 'forse',
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.errors.portataKg, 'integer');
    assert.equal(result.errors['mb-2-lunghezzaMm'], 'range');
    assert.equal(result.errors['mb-3-interasseSuperiore'], 'tooLong');
    assert.equal(result.errors['mb-3-display'], 'option');
    assert.deepEqual(misuraOf('mb-2-lunghezzaMm')?.n, '2');
    assert.equal(misuraOf('mb-2-nonsense'), null);
  });

  it('keep what was typed in the rows when the form comes back with errors', () => {
    const values = formValuesFromBody({
      fermate: '2',
      'mb-1-lunghezzaMm': '320',
      'mb-2-piano': 'T',
      'mb-301-piano': 'x',
      'mb-1-altro': 'x',
      'mb-1-display': ['si', 'no'],
    });
    assert.equal(values['mb-1-lunghezzaMm'], '320');
    assert.equal(values['mb-2-piano'], 'T');
    assert.equal(values['mb-301-piano'], undefined, `at most ${MAX_MISURE} stops`);
    assert.equal(values['mb-1-altro'], undefined);
    assert.equal(values['mb-1-display'], undefined, 'never an array');
    const rows = misureFormRows(values, { 'mb-2-piano': 'tooLong' });
    assert.equal(rows.length, 2);
    assert.equal(
      rows[0]?.cells.find((c) => c.column.key === 'piano')?.value,
      '1',
      'defaults to the stop',
    );
    assert.equal(rows[1]?.cells.find((c) => c.column.key === 'piano')?.error, 'tooLong');
    assert.equal(misureFormRows({ fermate: 'tre' }, {}).length, 0);
  });

  it('show a table with a row for every stop, the floor name defaulting to the stop number', () => {
    const rows = [
      {
        id: 'm1',
        schedaId: 's1',
        fermata: 2,
        piano: 'T',
        lunghezzaMm: new Prisma.Decimal('320.5'),
        larghezzaMm: null,
        interasseSuperiore: '60 mm',
        interasseInferiore: null,
        display: true,
      },
    ] satisfies MisuraBottoniera[];
    const table = misureTable(3, rows, translatorFor('it'), viewHelpers('it'));
    assert.deepEqual(table?.head, [
      'Fermata',
      'Piano',
      'Lunghezza (mm)',
      'Larghezza (mm)',
      'Interasse foro superiore',
      'Interasse foro inferiore',
      'Display',
    ]);
    assert.deepEqual(table?.rows, [
      ['1', '1', '', '', '', '', ''],
      ['2', 'T', '320,5', '', '60 mm', '', 'Sì'],
      ['3', '3', '', '', '', '', ''],
    ]);
    assert.equal(misureTable(null, rows, translatorFor('it'), viewHelpers('it')), null);
  });
});
