import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { orderOutcome, revolutOrderBody, verifyRevolutSignature } from '../revolut-core';

const SECRET = 'wsk_test_secret';
const sign = (ts: string, body: string, secret = SECRET) =>
  `v1=${createHmac('sha256', secret).update(`v1.${ts}.${body}`).digest('hex')}`;

// P3
test('P3: валиден подпис v1 с текущ timestamp (ms) се приема', () => {
  const body = '{"event":"ORDER_COMPLETED","order_id":"o1"}';
  const ts = String(Date.parse('2026-11-14T10:00:00Z'));
  assert.equal(verifyRevolutSignature({ rawBody: body, timestamp: ts, signature: sign(ts, body), secret: SECRET, now: Number(ts) + 1000 }), true);
});

test('P3: при ротация хедърът носи няколко подписа — стига един верен', () => {
  const body = '{}';
  const ts = '1763114400000';
  const header = `v1=deadbeef,${sign(ts, body)}`;
  assert.equal(verifyRevolutSignature({ rawBody: body, timestamp: ts, signature: header, secret: SECRET, now: Number(ts) }), true);
});

test('P3: грешна тайна, променено тяло, старо време или празни стойности → отказ', () => {
  const body = '{"a":1}';
  const ts = '1763114400000';
  const now = Number(ts);
  assert.equal(verifyRevolutSignature({ rawBody: body, timestamp: ts, signature: sign(ts, body, 'other'), secret: SECRET, now }), false);
  assert.equal(verifyRevolutSignature({ rawBody: '{"a":2}', timestamp: ts, signature: sign(ts, body), secret: SECRET, now }), false);
  assert.equal(verifyRevolutSignature({ rawBody: body, timestamp: ts, signature: sign(ts, body), secret: SECRET, now: now + 6 * 60_000 }), false);
  assert.equal(verifyRevolutSignature({ rawBody: body, timestamp: '', signature: sign(ts, body), secret: SECRET, now }), false);
  assert.equal(verifyRevolutSignature({ rawBody: body, timestamp: ts, signature: '', secret: SECRET, now }), false);
  assert.equal(verifyRevolutSignature({ rawBody: body, timestamp: ts, signature: sign(ts, body), secret: '', now }), false);
});

// P2
test('P2: тялото на поръчката — сума в центове, EUR, референция = PlanOrder.id', () => {
  assert.deepEqual(
    revolutOrderBody({
      amountCents: 3840,
      description: 'Linketto Pro · 12 месеца',
      email: 'a@b.eu',
      reference: 'po_1',
      redirectUrl: 'https://linketto.example/bg/dashboard?upgraded=1',
    }),
    {
      amount: 3840,
      currency: 'EUR',
      description: 'Linketto Pro · 12 месеца',
      customer: { email: 'a@b.eu' },
      merchant_order_data: { reference: 'po_1' },
      metadata: { plan_order_id: 'po_1' },
      redirect_url: 'https://linketto.example/bg/dashboard?upgraded=1',
      expire_pending_after: 'PT1H',
    },
  );
});

// P4
test('P4: резултатът от поръчката — състояние, сума и двете държави', () => {
  const o = orderOutcome({
    id: 'o1',
    state: 'completed',
    amount: 400,
    currency: 'EUR',
    payments: [
      { state: 'failed', payment_method: { card_country_code: 'DE' } },
      {
        state: 'completed',
        // Payment-v3: billing_address е на ПЛАЩАНЕТО, не в payment_method (merchant.yaml).
        payment_method: { card_country_code: 'it' },
        billing_address: { country_code: 'fr' },
      },
    ],
  });
  assert.deepEqual(o, { state: 'completed', amountCents: 400, currency: 'EUR', cardCountry: 'IT', billingCountry: 'FR' });
  // адрес, сложен под payment_method, не е по схемата → не се чете
  const wrong = orderOutcome({
    state: 'completed',
    amount: 400,
    currency: 'EUR',
    payments: [{ state: 'completed', payment_method: { billing_address: { country_code: 'IT' } } }],
  });
  assert.equal(wrong.billingCountry, null);
  assert.equal(orderOutcome({ state: 'weird' }).state, 'unknown');
  assert.equal(orderOutcome(null).state, 'unknown');
});

// Единицата на Revolut-Request-Timestamp не е потвърдена от първоизточник
// (Д8) — приемаме и секунди, и милисекунди, със същия толеранс.
test('P3: timestamp в секунди също се приема; извън толеранса — не', () => {
  const body = '{"event":"ORDER_COMPLETED","order_id":"o1"}';
  const seconds = '1794650400';
  const now = Number(seconds) * 1000 + 2000;
  assert.equal(verifyRevolutSignature({ rawBody: body, timestamp: seconds, signature: sign(seconds, body), secret: SECRET, now }), true);
  assert.equal(
    verifyRevolutSignature({ rawBody: body, timestamp: seconds, signature: sign(seconds, body), secret: SECRET, now: now + 6 * 60_000 }),
    false,
  );
});
