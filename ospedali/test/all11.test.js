// Тестове за новите източници, чиито пайплайни са в главния асистент:
// население (riduci), апаратура (aggrega), критерий за възлагане (classificaCriterio).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { riduci } from '../src/fetch-popolazione.js';
import { aggrega as aggregaApp } from '../src/fetch-apparecchiature.js';
import { classificaCriterio } from '../src/fetch-aggiudicazioni.js';

test('popolazione: riduci взема най-скорошната година и мапва ITTER→ключ', () => {
  const rows = [
    { REF_AREA: 'ITC1: Piemonte', TIME_PERIOD: '2025', OBS_VALUE: '4000000' },
    { REF_AREA: 'ITC1: Piemonte', TIME_PERIOD: '2026', OBS_VALUE: '4255006' },
    { REF_AREA: 'ITDA: Trentino', TIME_PERIOD: '2026', OBS_VALUE: '1090818' },
    { REF_AREA: 'IT: Italia', TIME_PERIOD: '2026', OBS_VALUE: '5345824' },
  ];
  const r = riduci(rows);
  assert.equal(r.anno, 2026);
  assert.equal(r.regioni['010'], 4255006); // не 2025-ата
  assert.equal(r.regioni.taa, 1090818); // ITDA → taa
  assert.equal(r.italia, 5345824);
});

test('apparecchiature: aggrega сумира per регион и per тип; 041/042 → taa', () => {
  const rows = [
    { codice_regione: '010', codice_struttura: '000045', tipo_apparecchiatura: 'TAC', num_apparecchiature: '2' },
    { codice_regione: '010', codice_struttura: '000045', tipo_apparecchiatura: 'RMN', num_apparecchiature: '1' },
    { codice_regione: '041', codice_struttura: '040100', tipo_apparecchiatura: 'TAC', num_apparecchiature: '3' },
    { codice_regione: '042', codice_struttura: '040200', tipo_apparecchiatura: 'ROB', num_apparecchiature: '1' },
    { codice_regione: '999', codice_struttura: 'x', tipo_apparecchiatura: 'TAC', num_apparecchiature: '5' }, // невалиден регион → игнор
  ];
  const { naz, perRegione, perStruttura } = aggregaApp(rows);
  assert.equal(naz.TAC, 5); // 2 + 3 (999 се игнорира)
  assert.equal(perRegione['010'].tot, 3);
  assert.equal(perRegione['010'].cat.TAC, 2);
  assert.equal(perRegione.taa.tot, 4); // 041 (3 TAC) + 042 (1 ROB)
  assert.equal(perRegione.taa.cat.TAC, 3);
  assert.equal(perRegione.taa.cat.ROB, 1);
  assert.equal(perStruttura['000045'].tot, 3);
  assert.ok(perRegione['999'] === undefined);
});

test('aggiudicazioni: classificaCriterio разпознава prezzo / qualita / altro', () => {
  assert.equal(classificaCriterio('OFFERTA ECONOMICAMENTE PIÙ VANTAGGIOSA: CRITERIO DEL MINOR PREZZO'), 'prezzo');
  assert.equal(classificaCriterio('PREZZO PIÙ BASSO'), 'prezzo');
  assert.equal(classificaCriterio('OFFERTA ECONOMICAMENTE PIÙ VANTAGGIOSA'), 'qualita');
  assert.equal(classificaCriterio(''), 'altro');
  assert.equal(classificaCriterio(null), 'altro');
});
