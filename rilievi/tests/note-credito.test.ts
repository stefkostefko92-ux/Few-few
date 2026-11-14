// The credit note that is due after a refund or a lost dispute (conditions 2026-11-14, art. 12.9; art. 115 of the
// Bulgarian VAT act): the portal issues nothing — it remembers what is due. The amounts follow the invoice:
//  - with reverse charge the whole refunded sum is the taxable amount, no VAT;
//  - with Bulgarian VAT (a Bulgarian customer, or an EU customer whose number is not valid in VIES) the refunded
//    sum is gross: the taxable amount and the 20 % VAT are split out of it, to the cent, and add up exactly;
//  - the note is due within 5 days of the day the money went back.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  entroIlDa,
  GIORNI_NOTA_CREDITO,
  scomponiRimborso,
} from '../src/pagamenti/note-credito-importi.js';

describe('the amounts of a credit note', () => {
  it('has no VAT with reverse charge', () => {
    assert.deepEqual(scomponiRimborso(29000, 'inversione'), { imponibile: 29000, iva: 0 });
  });

  it('splits the Bulgarian VAT out of the refunded sum', () => {
    assert.deepEqual(scomponiRimborso(34800, 'iva-bg'), { imponibile: 29000, iva: 5800 });
    assert.deepEqual(scomponiRimborso(34800, 'iva-bg-ue'), { imponibile: 29000, iva: 5800 });
    // A partial refund: 100,00 € gross is 83,33 € + 16,67 €.
    assert.deepEqual(scomponiRimborso(10000, 'iva-bg-ue'), { imponibile: 8333, iva: 1667 });
  });

  it('always adds up to the refunded sum, with nothing negative', () => {
    for (const regime of ['iva-bg', 'iva-bg-ue', 'inversione']) {
      for (const totale of [1, 2, 5, 6, 7, 99, 100, 101, 1199, 1200, 1201, 34799, 999_999_99]) {
        const { imponibile, iva } = scomponiRimborso(totale, regime);
        assert.equal(imponibile + iva, totale, `${regime} ${totale}`);
        assert.ok(imponibile >= 0 && iva >= 0, `${regime} ${totale}`);
        assert.ok(Number.isInteger(imponibile) && Number.isInteger(iva));
      }
    }
  });

  it('is due within 5 days of the refund', () => {
    assert.equal(GIORNI_NOTA_CREDITO, 5);
    assert.deepEqual(entroIlDa(new Date('2026-11-14T09:30:00Z')), new Date('2026-11-19T09:30:00Z'));
  });
});
