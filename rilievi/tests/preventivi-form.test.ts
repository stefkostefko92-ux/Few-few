// The form of a quote (point C1): the customer of the company, subject, plant, date and validity, the
// lines, notes and payment terms. Money and quantities become whole numbers here; totals are only computed
// by the server. An empty line is not a line; a line that says anything needs a description, a quantity and
// a price.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formValuesDaPreventivo,
  formValuesDalBody,
  indiciRighe,
  parsePreventivo,
} from '../src/preventivi/form.js';

const FULL = {
  cliente: 'Condominio Via Roma 1',
  clienteIndirizzo: 'Via Roma 1, 20121 Milano',
  clientePiva: '80012345678',
  clienteEmail: 'Amministratore@Example.com',
  oggetto: 'Sostituzione del quadro di manovra',
  impianto: 'Matricola MI 1234 · Via Roma 1',
  data: '2026-11-13',
  validitaGiorni: '60',
  'r-0-codice': 'QM-01',
  'r-0-descrizione': 'Quadro di manovra VVVF',
  'r-0-unita': 'pz',
  'r-0-quantita': '1',
  'r-0-prezzo': '4.850,00',
  'r-0-sconto': '5',
  'r-0-iva': '10',
  'r-2-descrizione': 'Manodopera',
  'r-2-unita': 'h',
  'r-2-quantita': '12,5',
  'r-2-prezzo': '45',
  'r-2-iva': '22',
  note: 'Escluse opere murarie.',
  condizioni: '30% all’ordine, saldo a fine lavori.',
};

function ok(body: Record<string, unknown>) {
  const r = parsePreventivo(body);
  assert.ok(r.ok, JSON.stringify(!r.ok && r.errors));
  return r.data;
}
function ko(body: Record<string, unknown>) {
  const r = parsePreventivo(body);
  assert.ok(!r.ok);
  return r.errors;
}

describe('the quote form', () => {
  it('reads every field, money and quantities as whole numbers', () => {
    const d = ok(FULL);
    assert.equal(d.cliente, 'Condominio Via Roma 1');
    assert.equal(d.clienteEmail, 'amministratore@example.com');
    assert.equal(d.validitaGiorni, 60);
    assert.deepEqual(d.righe, [
      {
        codice: 'QM-01',
        descrizione: 'Quadro di manovra VVVF',
        unita: 'pz',
        quantita: 1000,
        prezzo: 485000,
        sconto: 500,
        iva: 10,
      },
      {
        codice: null,
        descrizione: 'Manodopera',
        unita: 'h',
        quantita: 12500,
        prezzo: 4500,
        sconto: 0,
        iva: 22,
      },
    ]);
  });

  it('asks for the customer, the subject, the date and at least one line', () => {
    const e = ko({});
    assert.equal(e.cliente, 'required');
    assert.equal(e.oggetto, 'required');
    assert.equal(e.data, 'required');
    assert.equal(e.righe, 'required');
  });

  it('checks every line: description, quantity, price, discount and VAT rate', () => {
    const e = ko({
      ...FULL,
      'r-5-quantita': '2',
      'r-6-descrizione': 'x',
      'r-6-quantita': '0',
      'r-6-prezzo': '1,234',
      'r-7-descrizione': 'y',
      'r-7-quantita': '1',
      'r-7-prezzo': '10',
      'r-7-sconto': '150',
      'r-7-iva': '21',
    });
    assert.equal(e['r-5-descrizione'], 'required');
    assert.equal(e['r-5-prezzo'], 'required');
    assert.equal(e['r-6-quantita'], 'decimal');
    assert.equal(e['r-6-prezzo'], 'decimal');
    assert.equal(e['r-7-sconto'], 'range');
    assert.equal(e['r-7-iva'], 'option');
  });

  it('checks the tax code, the email, the date and the validity', () => {
    assert.equal(ko({ ...FULL, clientePiva: '123' }).clientePiva, 'invalid');
    assert.equal(ok({ ...FULL, clientePiva: 'rssmra80a01f205x' }).clientePiva, 'RSSMRA80A01F205X');
    assert.equal(ok({ ...FULL, clientePiva: 'IT 800 1234 5678' }).clientePiva, 'IT80012345678');
    assert.equal(ko({ ...FULL, clienteEmail: 'no' }).clienteEmail, 'invalid');
    assert.equal(ko({ ...FULL, data: '2026-02-30' }).data, 'invalidDate');
    assert.equal(ko({ ...FULL, validitaGiorni: '0' }).validitaGiorni, 'range');
    assert.equal(ko({ ...FULL, validitaGiorni: '400' }).validitaGiorni, 'range');
    assert.equal(ok({ ...FULL, validitaGiorni: '' }).validitaGiorni, 30);
  });

  it('refuses a total over what the quote keeps (21.474.836,47 €), field by field fine', () => {
    const body: Record<string, string> = { ...FULL };
    for (let i = 3; i < 6; i += 1) {
      body[`r-${i}-descrizione`] = `Riga ${i}`;
      body[`r-${i}-quantita`] = '1';
      body[`r-${i}-prezzo`] = '9.999.999,99';
    }
    const e = ko(body);
    assert.deepEqual(Object.keys(e), ['totale']);
    assert.equal(e.totale, 'range');
    // Just under the cap: fine.
    const ok1 = ok({ ...FULL, 'r-0-prezzo': '1.000.000,00', 'r-0-sconto': '', 'r-0-iva': '22' });
    assert.ok(ok1.righe.length === 2);
  });

  it('refuses more than 100 lines', () => {
    const body: Record<string, string> = { ...FULL };
    for (let i = 3; i < 103; i += 1) {
      body[`r-${i}-descrizione`] = `Riga ${i}`;
      body[`r-${i}-quantita`] = '1';
      body[`r-${i}-prezzo`] = '1';
    }
    assert.equal(ko(body).righe, 'range');
  });

  it('gives the saved quote back to the form, and the form back after an error', () => {
    const d = ok(FULL);
    const values = formValuesDaPreventivo(d);
    assert.equal(values['r-0-prezzo'], '4850,00');
    assert.equal(values['r-1-quantita'], '12,5');
    assert.equal(values['r-0-sconto'], '5');
    assert.deepEqual(ok(values), d);
    const back = formValuesDalBody({ ...FULL, extra: 'x' });
    assert.equal(back.extra, undefined);
    assert.deepEqual(indiciRighe(back), [0, 2]);
  });
});
