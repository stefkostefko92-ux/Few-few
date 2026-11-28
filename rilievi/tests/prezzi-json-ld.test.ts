// The price of a plan in the JSON-LD of /prezzi (the legal review, 28 November 2026 — part A, M9): the plan is paid
// once for all its months, so the price is for the whole period. `unitCode: MON` on the price itself read as a
// monthly price — a 12-month plan looked twelve times dearer in the search results (D.Lgs. 145/2007).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { translatorFor } from '../src/i18n.js';
import { prezziStructuredData } from '../src/seo/structured-pagine.js';

process.env.PUBLIC_BASE_URL ??= 'https://rilievi.example.test';
process.env.DATABASE_URL ??= 'postgresql://unused@127.0.0.1:1/unused';
process.env.JWT_SECRET ??= 'a'.repeat(64);
process.env.INTERVENTI_SEAL_KEY ??= 'b'.repeat(64);

const t = translatorFor('it');

interface Specifica {
  price: string;
  unitCode?: string;
  referenceQuantity?: { value: number; unitCode: string };
  billingDuration?: { value: number; unitCode: string };
}

function specifiche(mesi: number, prezzoCent: number): Specifica {
  const json = prezziStructuredData(t, 'https://rilievi.example/prezzi', [
    { nome: 'Fino a 10 persone', prezzoCent, mesi },
  ]);
  const grafo = (
    JSON.parse(json) as { '@graph': { offers?: { priceSpecification: Specifica }[] }[] }
  )['@graph'];
  const app = grafo.find((n) => n.offers);
  assert.ok(app);
  return app.offers![0]!.priceSpecification;
}

describe('the price of a plan for the search engines', () => {
  it('is the price of the whole period, not of one month', () => {
    const s = specifiche(12, 120_000);
    assert.equal(s.price, '1200.00');
    assert.equal(s.unitCode, undefined, 'no unit on the price: it would read as per month');
    assert.deepEqual(s.referenceQuantity, {
      '@type': 'QuantitativeValue',
      value: 12,
      unitCode: 'MON',
    });
    assert.deepEqual(s.billingDuration, {
      '@type': 'QuantitativeValue',
      value: 12,
      unitCode: 'MON',
    });
  });
});
