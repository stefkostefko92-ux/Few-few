// ДДС на еднократния checkout в магазина (ядро: пари, TAX.md). Мястото на
// доставка на електронна услуга е при купувача → адресът за фактуриране е
// задължителен (доказателство по чл. 24е, б. „а“ Регл. 282/2011), а данъчният
// код следва вида продукт. ДДС номер НЕ се събира в Checkout: Stripe Tax
// прилага обратно начисляване само по ФОРМАТА на номера, преди VIES
// проверката (docs.stripe.com/billing/customer/tax-ids) — гост сесия няма как
// да бъде проверена предварително → без номер = с ДДС.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHOP_TAX_CODES, shopOneOffTaxParams } from '../shop-checkout-tax';

test('ST1 Stripe Tax включен: адрес за фактуриране задължителен + automatic_tax + крайна цена', () => {
  for (const type of ['DIGITAL', 'COURSE'] as const) {
    const p = shopOneOffTaxParams(type, true);
    assert.equal(p.session.billing_address_collection, 'required');
    assert.deepEqual(p.session.automatic_tax, { enabled: true });
    assert.equal(p.price.tax_behavior, 'inclusive');
  }
});

test('ST2 ДДС номер не се събира в Checkout (обратно начисляване само по формат = недоплатен ДДС)', () => {
  for (const type of ['DIGITAL', 'COURSE'] as const) {
    for (const tax of [true, false]) {
      assert.equal('tax_id_collection' in shopOneOffTaxParams(type, tax).session, false);
    }
  }
});

test('ST3 tax_code по вид продукт: DIGITAL = общи електронни услуги, COURSE = записан курс (стрийм)', () => {
  assert.equal(SHOP_TAX_CODES.DIGITAL, 'txcd_10000000');
  assert.equal(SHOP_TAX_CODES.COURSE, 'txcd_20060158');
  assert.notEqual(SHOP_TAX_CODES.DIGITAL, SHOP_TAX_CODES.COURSE);
  assert.equal(shopOneOffTaxParams('DIGITAL', true).product.tax_code, 'txcd_10000000');
  assert.equal(shopOneOffTaxParams('COURSE', true).product.tax_code, 'txcd_20060158');
});

test('ST4 без Stripe Tax: адресът пак се събира (държавата на купувача за OSS записа), без automatic_tax', () => {
  const p = shopOneOffTaxParams('DIGITAL', false);
  assert.equal(p.session.billing_address_collection, 'required');
  assert.equal('automatic_tax' in p.session, false);
  assert.equal('tax_behavior' in p.price, false);
  assert.equal('tax_code' in p.product, false);
});
