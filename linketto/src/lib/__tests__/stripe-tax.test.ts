import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shopSalesAllowed, stripeTaxEnabled } from '../stripe-tax';

test('stripeTaxEnabled: само при STRIPE_TAX_ENABLED=1', () => {
  assert.equal(stripeTaxEnabled({ STRIPE_TAX_ENABLED: '1' }), true);
  assert.equal(stripeTaxEnabled({ STRIPE_TAX_ENABLED: '0' }), false);
  assert.equal(stripeTaxEnabled({}), false);
});

test('shopSalesAllowed: включен Stripe Tax → да (и с live ключ)', () => {
  assert.equal(
    shopSalesAllowed({ STRIPE_TAX_ENABLED: '1', STRIPE_SECRET_KEY: 'sk_live_x' }),
    true,
  );
});

test('shopSalesAllowed: test mode ключ → да (приемният тест)', () => {
  assert.equal(shopSalesAllowed({ STRIPE_SECRET_KEY: 'sk_test_abc' }), true);
});

test('shopSalesAllowed: live ключ без Stripe Tax → НЕ (fail closed)', () => {
  assert.equal(shopSalesAllowed({ STRIPE_SECRET_KEY: 'sk_live_abc' }), false);
  assert.equal(shopSalesAllowed({}), false);
});
