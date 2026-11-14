import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canViewPaidProduct } from '../buyer-access';

// R-buyer (ревю 2026-11-14): платилият купувач пази достъпа, дори продуктът да е
// архивиран, профилът — свален от публикация (по-нисък план) или анонимизиран.
test('купувач с достъп вижда продукта независимо от публикацията', () => {
  assert.equal(canViewPaidProduct({ productActive: false, profilePublished: false, hasAccess: true }), true);
  assert.equal(canViewPaidProduct({ productActive: true, profilePublished: false, hasAccess: true }), true);
});

test('случаен посетител вижда само активен продукт на публикуван профил', () => {
  assert.equal(canViewPaidProduct({ productActive: true, profilePublished: true, hasAccess: false }), true);
  assert.equal(canViewPaidProduct({ productActive: false, profilePublished: true, hasAccess: false }), false);
  assert.equal(canViewPaidProduct({ productActive: true, profilePublished: false, hasAccess: false }), false);
});
