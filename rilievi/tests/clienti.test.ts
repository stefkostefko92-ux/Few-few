// The customers of a company (the owner, 13 November 2026: "добави страница клиенти за всяка една фирма, по
// този начин ще могат да регистрират клиентите си с техни профили и да не трябва да ги пишат всеки път когато
// правят Preventivi"). What is checked here, without a database: the profile as it is typed (a name, and by
// choice an address, a VAT number or tax code, an email, a phone, a contact person, a note), what the search
// finds, and the way a profile fills a quote and a quote gives a profile.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  clienteDaPreventivo,
  MAX_CLIENTE,
  parseCliente,
  searchTextCliente,
  valoriCliente,
  valoriPreventivoDa,
} from '../src/clienti/form.js';

const PIENO = {
  nome: '  Condominio   Via Roma 12 ',
  indirizzo: 'Via Roma 12, 20121 Milano (MI)',
  piva: 'it 0123 4567 890',
  email: ' Amministratore@Studio-Bianchi.IT ',
  telefono: '+39 02 1234567',
  referente: 'Geom. Luca Bianchi',
  note: 'Riga 1\r\nRiga 2',
};

describe('the profile of a customer', () => {
  it('needs only a name; everything else is by choice and cleaned', () => {
    const solo = parseCliente({ nome: 'Rossi Mario' });
    assert.deepEqual(solo, {
      ok: true,
      data: {
        nome: 'Rossi Mario',
        indirizzo: null,
        piva: null,
        email: null,
        telefono: null,
        referente: null,
        note: null,
      },
    });
    const pieno = parseCliente(PIENO);
    assert.ok(pieno.ok);
    assert.deepEqual(pieno.data, {
      nome: 'Condominio Via Roma 12',
      indirizzo: 'Via Roma 12, 20121 Milano (MI)',
      piva: 'IT01234567890',
      email: 'amministratore@studio-bianchi.it',
      telefono: '+39 02 1234567',
      referente: 'Geom. Luca Bianchi',
      note: 'Riga 1\nRiga 2',
    });
  });

  it('says which field is wrong', () => {
    const errori = (body: Record<string, unknown>) => {
      const parsed = parseCliente({ nome: 'Cliente', ...body });
      return parsed.ok ? {} : parsed.errors;
    };
    assert.deepEqual(errori({ nome: '   ' }), { nome: 'required' });
    assert.deepEqual(errori({ nome: 'x'.repeat(MAX_CLIENTE.nome + 1) }), { nome: 'tooLong' });
    assert.deepEqual(errori({ nome: ['a', 'b'] }), { nome: 'invalid' });
    // The same rule as on the quote: 11 digits (with or without IT) or a tax code of 16 characters.
    assert.deepEqual(errori({ piva: '12345' }), { piva: 'invalid' });
    assert.deepEqual(errori({ piva: 'RSSMRA80A01F205X' }), {});
    assert.deepEqual(errori({ email: 'non-un-indirizzo' }), { email: 'invalid' });
    assert.deepEqual(errori({ email: 'a@b.it\r\nBcc: x@y.z' }), { email: 'invalid' });
    assert.deepEqual(errori({ telefono: 'chiamami' }), { telefono: 'invalid' });
    assert.deepEqual(errori({ telefono: '12' }), { telefono: 'invalid' });
    assert.deepEqual(errori({ telefono: '02/123.45.67 (int. 3)' }), { telefono: 'invalid' });
    assert.deepEqual(errori({ telefono: '02/123.45.67' }), {});
    assert.deepEqual(errori({ note: 'x'.repeat(MAX_CLIENTE.note + 1) }), { note: 'tooLong' });
    assert.deepEqual(errori({ indirizzo: 'x'.repeat(301), referente: 'y'.repeat(121) }), {
      indirizzo: 'tooLong',
      referente: 'tooLong',
    });
  });

  it('is found by any of its parts, without accents and capitals', () => {
    const parsed = parseCliente({ ...PIENO, nome: 'Società Àncora S.r.l.' });
    assert.ok(parsed.ok);
    const testo = searchTextCliente(parsed.data);
    for (const parola of ['societa', 'ancora', 'roma', 'it01234567890', 'bianchi', '021234567'])
      assert.ok(testo.includes(parola), `${parola} in «${testo}»`);
    // The note is not searched: it is free text about the customer, not a way to find them.
    assert.ok(!testo.includes('riga'));
  });

  it('goes back into its form as it was saved', () => {
    const parsed = parseCliente(PIENO);
    assert.ok(parsed.ok);
    assert.deepEqual(valoriCliente(parsed.data), {
      nome: 'Condominio Via Roma 12',
      indirizzo: 'Via Roma 12, 20121 Milano (MI)',
      piva: 'IT01234567890',
      email: 'amministratore@studio-bianchi.it',
      telefono: '+39 02 1234567',
      referente: 'Geom. Luca Bianchi',
      note: 'Riga 1\nRiga 2',
    });
    assert.deepEqual(valoriCliente(null), {});
  });

  it('fills the customer of a quote, and a quote gives a profile', () => {
    const parsed = parseCliente(PIENO);
    assert.ok(parsed.ok);
    assert.deepEqual(valoriPreventivoDa({ id: 'c1', ...parsed.data }), {
      clienteId: 'c1',
      cliente: 'Condominio Via Roma 12',
      clienteIndirizzo: 'Via Roma 12, 20121 Milano (MI)',
      clientePiva: 'IT01234567890',
      clienteEmail: 'amministratore@studio-bianchi.it',
    });
    assert.deepEqual(
      clienteDaPreventivo({
        cliente: 'Condominio Verdi',
        clienteIndirizzo: null,
        clientePiva: '01234567890',
        clienteEmail: 'verdi@example.it',
      }),
      {
        nome: 'Condominio Verdi',
        indirizzo: null,
        piva: '01234567890',
        email: 'verdi@example.it',
        telefono: null,
        referente: null,
        note: null,
      },
    );
  });
});
