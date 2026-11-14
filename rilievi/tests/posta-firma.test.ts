// Under every email of the portal: who sends it (the audit of 12 November 2026 — Dir. 2000/31, art. 5). The texts
// end with the short signature; the mailer puts the legal form, the registered office, the registration number
// and the VAT number in its place, from one source. A text that does not end with it is left as it is.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMPANY } from '../src/company.js';
import { translatorFor } from '../src/i18n.js';
import { conFirma } from '../src/mail/mailer.js';

describe('the signature of the emails', () => {
  it('names the sender in full once, at the end', () => {
    const t = translatorFor('it');
    const testo = conFirma('Ciao,\n\nprova.\n\nCarbon Stealth VCC — https://carbonstealth.eu');
    assert.match(testo, /^Ciao,\n\nprova\.\n\nCarbon Stealth VCC — /);
    assert.ok(testo.includes(`EIK ${COMPANY.eik}`));
    assert.ok(testo.includes(COMPANY.vat));
    assert.ok(testo.includes(t('company.street')));
    assert.ok(testo.endsWith(COMPANY.url));
    assert.equal(testo.split(COMPANY.url).length, 2);
    assert.equal(conFirma('Buongiorno,\nordine in allegato.'), 'Buongiorno,\nordine in allegato.');
  });

  it('is at the end of every email text of the dictionary that signs', () => {
    const t = translatorFor('it');
    for (const key of [
      'mail.cambio.cancellato.body',
      'pagamenti.mail.body',
      'pagamenti.mail.masterBody',
    ]) {
      const testo = t(key, {});
      if (testo.includes('Carbon Stealth VCC —'))
        assert.ok(testo.endsWith('Carbon Stealth VCC — https://carbonstealth.eu'), key);
    }
  });
});
