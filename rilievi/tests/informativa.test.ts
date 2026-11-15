// The notice under GDPR art. 13 for the people who sign on the screen (owner, 12 November 2026 — point D4):
// the company is the controller and writes it in its settings; until then the model, filled with the
// company's own data. The optional email for the signed copy is only an address or nothing.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  copiaEmailSchema,
  informativaPerFirma,
  informativaSchema,
  modelloInformativa,
} from '../src/legale/informativa.js';

describe('the notice on the signature page', () => {
  it('fills the model with the company data, and says so when they are missing', () => {
    const testo = modelloInformativa({
      name: 'Ascensori Prova',
      datiSocietari: {
        ragioneSociale: 'Ascensori Prova S.r.l.',
        indirizzo: 'Via Roma 1',
        cap: '20100',
        citta: 'Milano',
        provincia: 'MI',
        email: 'info@prova.it',
      },
    });
    assert.match(
      testo,
      /^Titolare del trattamento: Ascensori Prova S\.r\.l\., Via Roma 1, 20100 Milano, MI\. Contatto: info@prova\.it\./,
    );
    assert.match(testo, /responsabile del trattamento \(art\. 28 GDPR\)/);
    assert.doesNotMatch(testo, /\{\w+\}/);
    const vuoto = modelloInformativa({ name: 'Ascensori Vuoti', datiSocietari: null });
    assert.match(
      vuoto,
      /^Titolare del trattamento: Ascensori Vuoti\. Contatto: i recapiti dell'azienda\./,
    );
  });

  it("uses the company's own text once written", () => {
    const azienda = { name: 'A', datiSocietari: null, informativaFirme: 'Il nostro testo.' };
    assert.equal(informativaPerFirma(azienda), 'Il nostro testo.');
    assert.match(informativaPerFirma({ ...azienda, informativaFirme: '  ' }), /^Titolare/);
  });

  it('cleans what is written and refuses it empty or too long', () => {
    assert.equal(informativaSchema.parse('Riga 1  \r\n\u0007Riga 2\n'), 'Riga 1\n Riga 2');
    assert.equal(informativaSchema.safeParse('   ').success, false);
    assert.equal(informativaSchema.safeParse('x'.repeat(4001)).success, false);
  });

  it('takes an email or nothing for the signed copy', () => {
    assert.equal(copiaEmailSchema.parse(''), null);
    assert.equal(copiaEmailSchema.parse(' cliente@esempio.it '), 'cliente@esempio.it');
    assert.equal(copiaEmailSchema.safeParse('non-una-email').success, false);
  });
});
