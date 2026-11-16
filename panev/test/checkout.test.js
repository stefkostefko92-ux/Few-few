'use strict';
// IVA в checkout-а (ядро: пари). Онлайн плащането е спряно (PAYMENTS_ENABLED), но включено
// никога не бива да даде цена без ДДС:
//  - цените са IVA esclusa → всеки ред носи Tax Rate IVA 22% (exclusive), проверен на сървъра
//    преди сесията (fail-closed);
//  - доставка само в Италия: Сан Марино и Ватикана са необлагаеми доставки по чл. 71 DPR
//    633/1972 със собствена процедура — не онлайн, само по оферта;
//  - P.IVA не се събира в Checkout: Stripe прилага обратно начисляване само по ФОРМАТА на
//    номера, независимо от VIES (docs.stripe.com/billing/customer/tax-ids).
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  checkoutIdempotencyKey,
  checkoutLineItem,
  checkoutSessionParams,
  isItalianPiva,
  resolveIvaTaxRateId,
} = require('../lib/checkout');

const ITEM = { name: 'Staffa', description: 'SU-1', unitAmountCents: 1250, qty: 2 };
const BASE = { lineItems: [], email: 'a@example.test', metadata: { x: '1' }, baseUrl: 'https://x.test' };

test('C1 ogni riga porta il Tax Rate IVA (prezzi IVA esclusa → IVA aggiunta)', () => {
  const li = checkoutLineItem(ITEM, 'txr_iva22');
  assert.deepEqual(li.tax_rates, ['txr_iva22']);
  assert.equal(li.price_data.unit_amount, 1250);
  assert.equal(li.quantity, 2);
});

test('C1b senza Tax Rate la riga non si costruisce (fail-closed, mai un prezzo senza IVA)', () => {
  assert.throws(() => checkoutLineItem(ITEM, ''), /IVA/);
  assert.throws(() => checkoutLineItem(ITEM, undefined), /IVA/);
});

test('C2 spedizione solo IT: niente San Marino / Vaticano (art. 71 DPR 633/1972)', () => {
  const p = checkoutSessionParams({ ...BASE, piva: 'IT01234567890' });
  assert.deepEqual(p.shipping_address_collection, { allowed_countries: ['IT'] });
});

test('C3 nessun tax_id_collection; la P.IVA del modulo va nei metadati (fattura)', () => {
  const p = checkoutSessionParams({ ...BASE, piva: 'IT01234567890' });
  assert.equal('tax_id_collection' in p, false);
  assert.equal(p.metadata.partita_iva, 'IT01234567890');
  assert.equal(p.payment_intent_data.metadata.partita_iva, 'IT01234567890');
  assert.equal(p.metadata.x, '1');
  assert.equal(p.billing_address_collection, 'required');
});

test('C4 P.IVA: solo italiana (11 cifre, IT opzionale); San Marino e altri rifiutati', () => {
  assert.equal(isItalianPiva('IT01234567890'), true);
  assert.equal(isItalianPiva('01234567890'), true);
  assert.equal(isItalianPiva('SM12345'), false);
  assert.equal(isItalianPiva('SM01234567890'), false);
  assert.equal(isItalianPiva('DE123456789'), false);
});

function stripeWith(rate) {
  return { taxRates: { retrieve: async (id) => ({ id, ...rate }) } };
}
const GOOD = { active: true, inclusive: false, percentage: 22, country: 'IT' };

test('C5 resolveIvaTaxRateId: accetta solo IVA IT 22% esclusiva e attiva', async () => {
  assert.equal(
    await resolveIvaTaxRateId(stripeWith(GOOD), { STRIPE_TAX_RATE_IVA22: 'txr_ok' }),
    'txr_ok',
  );
  for (const env of [{}, { STRIPE_TAX_RATE_IVA22: '' }, { STRIPE_TAX_RATE_IVA22: 'price_x' }]) {
    await assert.rejects(resolveIvaTaxRateId(stripeWith(GOOD), env), /IVA/);
  }
  for (const bad of [
    { active: false },
    { inclusive: true },
    { percentage: 0 },
    { percentage: 10 },
    { country: 'SM' },
    { country: null },
  ]) {
    await assert.rejects(
      resolveIvaTaxRateId(stripeWith({ ...GOOD, ...bad }), { STRIPE_TAX_RATE_IVA22: 'txr_bad' }),
      /IVA/,
    );
  }
});

test('C6 idempotencyKey: la P.IVA entra nella chiave (stesso carrello, P.IVA diversa → sessione diversa)', () => {
  const base = { clientIp: '1.2.3.4', lineItems: [checkoutLineItem(ITEM, 'txr_iva22')], email: 'a@example.test' };
  const a = checkoutIdempotencyKey({ ...base, piva: '12345678901' });
  const b = checkoutIdempotencyKey({ ...base, piva: '10987654321' });
  assert.notEqual(a, b);
  // stessa richiesta ripetuta (retry di rete) → stessa chiave; P.IVA normalizzata come nei metadati
  assert.equal(a, checkoutIdempotencyKey({ ...base, piva: '12345678901' }));
  assert.equal(checkoutIdempotencyKey({ ...base, piva: 'IT12345678901' }), checkoutIdempotencyKey({ ...base, piva: 'it 1234567 8901' }));
  assert.match(a, /^co_1\.2\.3\.4_[0-9a-f]{32}$/);
});

test('C7 P.IVA con e senza prefisso IT → stessa chiave E stessi metadati (forma canonica unica)', () => {
  const base = { clientIp: '1.2.3.4', lineItems: [checkoutLineItem(ITEM, 'txr_iva22')], email: 'a@example.test' };
  const spellings = ['IT12345678901', '12345678901', 'it 1234567 8901'];
  const keys = spellings.map((piva) => checkoutIdempotencyKey({ ...base, piva }));
  const metas = spellings.map((piva) => checkoutSessionParams({ ...BASE, piva }).metadata.partita_iva);
  const piMetas = spellings.map((piva) => checkoutSessionParams({ ...BASE, piva }).payment_intent_data.metadata.partita_iva);
  assert.equal(new Set(keys).size, 1);
  assert.deepEqual(metas, ['IT12345678901', 'IT12345678901', 'IT12345678901']);
  assert.deepEqual(piMetas, metas);
});
