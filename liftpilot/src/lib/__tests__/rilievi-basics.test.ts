// Rilievi — the basics (rilievi's tests/basics.test.ts and i18n.test.ts, commit 174a1e3aa, Italian only): the day of a
// `@db.Date`, today in Rome, the numbers; every label the field list asks for is in messages/it.json; the plurals; the
// form read as rilievi's server read it; the helpers the form shows its errors with; the browser's prefill rules.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import it_ from '../../../messages/it.json';
import { FIELDS, SECTIONS } from '@/lib/rilievi/fields';
import { fmt } from '@/lib/rilievi/fmt';
import { errorAnchorOf, errorLabelOf, errorParamsOf, errorTextOf, flashOf, inputMaxLengthOf, moduloFileName, pdfFileName, specLookup, unitTextOf } from '@/lib/rilievi/form-help';
import { moduloLookup, moduloSpecs } from '@/lib/rilievi/ordini/form';
import { rilieviTranslator } from '@/lib/rilievi/i18n';
import { bodyOf, listParamsSchema, MAX_FORM_FIELDS, schedaIdSchema } from '@/lib/rilievi/inputs';
import { browserSendable } from '@/lib/rilievi/leave';
import { MISURA_COLUMNS } from '@/lib/rilievi/misure';
import { misureRowsFor, prefillInput, surveyText } from '@/lib/rilievi/prefill-client';
import { businessDay, dateFromDay, dayFromDate } from '@/lib/rilievi/time';
import { parseScheda } from '@/lib/rilievi/validation';

const t = rilieviTranslator();
const R = it_.rilievi as unknown as Record<string, unknown>;
const has = (key: string): boolean => key.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), R) !== undefined;

describe('dates and numbers', () => {
  it('keeps @db.Date values on their day', () => {
    const day = dateFromDay('2026-10-12');
    assert.equal(dayFromDate(day), '2026-10-12');
    assert.equal(fmt.day(day), '12/10/2026');
  });

  it('gives today in Rome, not in UTC', () => {
    // 23:30 UTC on 11 October is already 12 October in Rome (UTC+2 in summer time)
    assert.equal(businessDay(new Date('2026-10-11T23:30:00Z')), '2026-10-12');
    assert.equal(fmt.dateTime(new Date('2026-10-12T09:05:00Z')), '12/10/2026, 11:05');
  });

  it('formats decimals with the comma, groups from 5 digits, and form values without grouping (as Node it-IT did)', () => {
    assert.equal(fmt.num(10.5), '10,5');
    assert.equal(fmt.num(1250.5), '1250,5');
    assert.equal(fmt.num(12500), '12.500');
    assert.equal(fmt.num(-1), '-1');
    assert.equal(fmt.num(null), '');
    assert.equal(fmt.inputNum({ toString: () => '1250.50' }), '1250,5');
    assert.equal(fmt.inputNum(123456.7), '123456,7');
  });
});

describe('the messages', () => {
  it('name every field, question, section, option and column', () => {
    for (const field of FIELDS) {
      assert.ok(has(`scheda.field.${field.key}`), `field ${field.key}`);
      if (field.question) assert.ok(has(`scheda.question.${field.key}`), `${field.key}?`);
      if (field.kind === 'checks' || field.kind === 'choice') for (const option of field.options) assert.ok(has(`scheda.option.${field.key}.${option}`), option);
    }
    for (const section of SECTIONS) assert.ok(has(`scheda.section.${section.key}`), section.key);
    for (const column of MISURA_COLUMNS) assert.ok(has(`scheda.misure.col.${column.key}`), column.key);
    for (const a of ['SCHEDA_CREATED', 'SCHEDA_UPDATED', 'SCHEDA_TRASHED', 'SCHEDA_RESTORED', 'SCHEDA_PURGED']) assert.ok(a in it_.audit.actions, a);
    assert.equal(it_.nav.rilievi, 'Rilievi');
  });

  it('pick the plural form by count, with rilievi’s words', () => {
    assert.equal(t('schede.count', { n: 1 }), '1 scheda');
    assert.equal(t('schede.count', { n: 3 }), '3 schede');
    assert.equal(t('scheda.unit.persone', { n: 1 }), 'persona');
    assert.equal(t('scheda.unit.persone', { n: 8 }), 'persone');
    assert.equal(t('scheda.errorSummary', { n: 2 }), 'Correggi 2 campi');
    assert.equal(t('schede.search.found', { n: 1, q: '987' }), '1 scheda per «987»');
    assert.equal(t('scheda.question.quadroOrdine'), 'Vuoi compilare la scheda per l\'ordine quadro?');
  });
});

describe('the form as rilievi read it', () => {
  it('a repeated name is a list, a file is a forged value, too many fields is no form', () => {
    const fd = new FormData();
    fd.append('tipoPorte', 'MANUALI');
    fd.append('tipoPorte', 'AUTOMATICHE');
    fd.append('indirizzo', new Blob(['x']));
    fd.append('matricola', '33871');
    const body = bodyOf(fd);
    assert.ok(body);
    assert.deepEqual(body.tipoPorte, ['MANUALI', 'AUTOMATICHE']);
    assert.equal(Object.getPrototypeOf(body), null, 'no prototype: «__proto__» is a plain key');
    const parsed = parseScheda({ ...body, data: '2026-10-12' });
    assert.equal(!parsed.ok && parsed.errors.indirizzo, 'invalid');
    const many = new FormData();
    for (let i = 0; i <= MAX_FORM_FIELDS; i++) many.append(`k${i}`, '');
    assert.equal(bodyOf(many), null);
  });

  it('takes a sheet’s id, the list’s search and page as rilievi did', () => {
    assert.ok(schedaIdSchema.safeParse('cm0000000000000000000001').success);
    for (const bad of ['../etc', 'abc', 'CM0000000000000000000001', '']) assert.ok(!schedaIdSchema.safeParse(bad).success, bad);
    assert.deepEqual(listParamsSchema.parse({ q: 'x'.repeat(150), p: '3' }), { q: 'x'.repeat(100), p: 3 });
    assert.deepEqual(listParamsSchema.parse({ q: ['a'], p: '0' }), { q: '', p: 1 });
    assert.deepEqual(listParamsSchema.parse({}), { q: '', p: 1 });
  });
});

describe('the form’s helpers', () => {
  it('label, link and explain every kind of error key', () => {
    assert.equal(errorLabelOf('identifiers', t), 'Identificazione');
    assert.equal(errorAnchorOf('identifiers'), '#f-indirizzo');
    assert.equal(errorLabelOf('mb-2-lunghezzaMm', t), 'Lunghezza, fermata 2');
    assert.equal(errorLabelOf('oq-quantita', t, moduloLookup), 'Quantità: (Pelazza Peppino)');
    assert.equal(errorLabelOf('oq-quantita', t, specLookup(moduloSpecs())), 'Quantità: (Pelazza Peppino)', 'the form’s specs say the same as the maps');
    assert.equal(errorLabelOf('portataKg', t), 'Portata');
    assert.equal(errorAnchorOf('mb-2-lunghezzaMm'), '#f-mb-2-lunghezzaMm');
    assert.deepEqual(errorParamsOf('portataKg'), { min: '0', max: '100000' });
    assert.equal(errorTextOf('portataKg', 'range', t), 'Inserisci un valore tra 0 e 100000.');
    assert.equal(errorTextOf('marca', 'tooLong', t), 'Massimo 120 caratteri.');
    assert.equal(errorTextOf('mb-3-interasseSuperiore', 'tooLong', t), 'Massimo 60 caratteri.');
    assert.equal(errorTextOf('oq-quantita', 'tooLong', t, moduloLookup), 'Massimo 5 caratteri.');
    assert.equal(errorTextOf('oq-quantita', 'tooLong', t, specLookup(moduloSpecs())), 'Massimo 5 caratteri.');
    assert.deepEqual(errorParamsOf('oq-ordine', moduloLookup), {}, 'a box has no length');
    assert.equal(unitTextOf('capienzaPersone', t), 'persone');
    assert.equal(unitTextOf('fermate', t), null);
    assert.deepEqual(['matricola', 'portataKg', 'ubicazioneCassettina', 'funiDiametroMm', 'data'].map(inputMaxLengthOf), [20, 9, null, 10, null]);
    assert.equal(flashOf('schedaSaved'), 'schedaSaved');
    assert.equal(flashOf('altro'), null);
  });

  it('name the PDFs by the lift number (or the matricola) and the date, safe characters only', () => {
    const s = { id: 'cm0000000000000000000001', numeroImpianto: '104552', matricola: '0033871', data: dateFromDay('2026-10-12') };
    assert.equal(pdfFileName(s), 'scheda-104552-2026-10-12.pdf');
    assert.equal(pdfFileName({ ...s, numeroImpianto: null }), 'scheda-0033871-2026-10-12.pdf');
    assert.equal(pdfFileName({ ...s, numeroImpianto: null, matricola: null }), 'scheda-00000001-2026-10-12.pdf');
    assert.equal(moduloFileName('ordine-quadro', { ...s, numeroImpianto: '880011' }), 'ordine-quadro-880011-2026-10-12.pdf');
  });
});

describe('the browser’s rules', () => {
  const values = { data: '2026-10-12', numeroImpianto: '104552', matricola: '', indirizzo: 'Via Verdi 14', doppioAccesso: 'no', tipoPorte: ['MANUALI'], fermate: ' 6 ' };

  it('prefill an untouched, empty field from the survey on the screen, and tick what the survey ticks', () => {
    assert.equal(surveyText('data', values), '12/10/2026');
    assert.equal(surveyText('rif', values), 'N° 104552 — Via Verdi 14');
    assert.equal(surveyText('accessi', values), '1');
    assert.equal(surveyText('azienda', values), '', 'the company was prefilled by the server');
    assert.equal(surveyText('fermate', values), '6');
    assert.equal(prefillInput({ kind: 'text', prefill: 'fermate', value: '', maxLength: 27 }, values), '6');
    assert.equal(prefillInput({ kind: 'text', prefill: 'fermate', value: '4', maxLength: 27 }, values), null, 'never over what is there');
    assert.equal(prefillInput({ kind: 'text', prefill: 'rif', value: '', maxLength: 5 }, values), 'N° 10');
    assert.equal(prefillInput({ kind: 'check', prefill: 'tipoPorte=MANUALI', value: false, maxLength: null }, values), true);
    assert.equal(prefillInput({ kind: 'check', prefill: 'tipoPorte=AUTOMATICHE', value: false, maxLength: null }, values), null);
  });

  it('show a row of measurements per stop typed, 1..300', () => {
    assert.deepEqual(['6', ' 8 ', '0', '301', 'tre', '', '-1'].map((v) => misureRowsFor(v)), [6, 8, 0, 0, 0, 0, 0]);
  });
});

describe('leaving the form with unsaved changes: another form the browser sends itself', () => {
  it('sends a form whose action is an address (the top bar\'s search, «Esci»)', () => {
    assert.equal(browserSendable('/it/app', ['q']), true);
    assert.equal(browserSendable('/api/logout', ['']), true);
    assert.equal(browserSendable(null, ['q']), true);
  });
  it('leaves to the app a form whose action is its function (drawn in the browser or on the server)', () => {
    assert.equal(browserSendable("javascript:throw new Error('A React form was unexpectedly submitted.')", ['id']), false);
    assert.equal(browserSendable(' JavaScript:void 0', []), false);
    assert.equal(browserSendable(null, ['$ACTION_REF_1', '$ACTION_1:0', 'id']), false);
    assert.equal(browserSendable(null, ['$ACTION_ID_7f3a']), false);
  });
});
