// The invoice of a plan paid on Revolut is issued outside the portal (art. 113(4) of the Bulgarian VAT act — within
// 5 days of the tax event; the payment is an advance, art. 25(7)), without a database. Acceptance criteria:
//  - every payment to invoice carries its deadline: the moment of the payment plus GIORNI_FATTURA (5) days;
//  - the day of a document (the invoice, the credit note) is a real calendar day, not in the future;
//  - the text for MASTER lists what the invoice must carry in each VAT regime: with the reverse charge no rate
//    and no VAT, the wording "обратно начисляване" / "inversione contabile", the ground (art. 21(2) of the
//    Bulgarian VAT act, art. 196 of Directive 2006/112) and the customer's VAT number confirmed by VIES, on the
//    name and address given by VIES; with Bulgarian VAT the 20 % rate and the VAT.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { DICITURA_INVERSIONE, fatturaEntroIl } from '../src/pagamenti/fatture.js';
import { giornoDocumento } from '../src/pagamenti/note-credito.js';
import { GIORNI_FATTURA } from '../src/pagamenti/offerta.js';
import { businessDay } from '../src/time.js';

const GIORNO = 24 * 60 * 60 * 1000;

describe('the deadline of the invoice', () => {
  it('is 5 days from the payment', () => {
    assert.equal(GIORNI_FATTURA, 5);
    const pagato = new Date('2026-11-20T15:30:00Z');
    assert.equal(fatturaEntroIl(pagato).getTime() - pagato.getTime(), 5 * GIORNO);
  });
});

describe('the day of a document', () => {
  it('takes a real day up to today and refuses anything else', () => {
    assert.equal(giornoDocumento('2026-11-14')?.toISOString(), '2026-11-14T12:00:00.000Z');
    assert.equal(giornoDocumento(businessDay())?.toISOString().slice(0, 10), businessDay());
    const domani = new Date(Date.now() + 2 * GIORNO).toISOString().slice(0, 10);
    for (const no of ['', '14/11/2026', '2026-02-30', '2025-12-31', domani, undefined, 5])
      assert.equal(giornoDocumento(no), null, String(no));
  });
});

describe('what the invoice carries, for MASTER', () => {
  const testi = JSON.parse(readFileSync('locales/it/pagamenti.json', 'utf8')) as {
    pagamenti: { master: Record<string, unknown> };
  };
  const m = testi.pagamenti.master;
  const regimi = m.fatturareRegimi as Record<string, string>;

  it('says the deadline from the payment and the name and address from VIES', () => {
    const testo = String(m.fatturareTesto);
    assert.match(testo, /\{giorni\} giorni dal pagamento/);
    assert.match(testo, /art\. 25, c\. 7/);
    assert.match(testo, /nome e all'indirizzo dati dal VIES/);
    assert.match(testo, /numero e la data/);
  });

  it('lists the particulars of each regime', () => {
    assert.deepEqual(Object.keys(regimi).sort(), ['inversione', 'ivaBg', 'ivaBgUe']);
    const inv = regimi.inversione!;
    assert.match(inv, /senza aliquota e senza IVA/);
    // The Bulgarian wording comes from the code (the Italian dictionary holds no Cyrillic).
    assert.match(inv, /«\{dicitura\}»/);
    assert.equal(DICITURA_INVERSIONE, 'обратно начисляване');
    assert.match(inv, /«inversione contabile»/);
    assert.match(inv, /art\. 21, c\. 2/);
    assert.match(inv, /art\. 196 della Direttiva 2006\/112\/CE/);
    assert.match(inv, /partita IVA del cliente confermata dal VIES/);
    assert.match(inv, /art\. 114/);
    for (const k of ['ivaBg', 'ivaBgUe'] as const) {
      assert.match(regimi[k]!, /aliquota 20 %/);
      assert.match(regimi[k]!, /importo dell'IVA/);
    }
  });
});
