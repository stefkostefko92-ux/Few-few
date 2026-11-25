import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isExternalPaymentUrl } from '../external-url';

// P13: линкът за плащане при създателя — само https, валиден, без вграден акаунт
test('P13: приема https линкове за плащане', () => {
  assert.ok(isExternalPaymentUrl('https://revolut.me/maria'));
  assert.ok(isExternalPaymentUrl('https://checkout.revolut.com/pay/abc'));
  assert.ok(isExternalPaymentUrl('https://www.paypal.com/paypalme/maria/10'));
});

test('P13: отказва http, javascript:, data:, вграден user:pass, празно и твърде дълго', () => {
  assert.ok(!isExternalPaymentUrl('http://revolut.me/maria'));
  assert.ok(!isExternalPaymentUrl('javascript:alert(1)'));
  assert.ok(!isExternalPaymentUrl('data:text/html,x'));
  assert.ok(!isExternalPaymentUrl('https://user:pass@evil.example/'));
  assert.ok(!isExternalPaymentUrl(''));
  assert.ok(!isExternalPaymentUrl(`https://a.example/${'x'.repeat(2001)}`));
  assert.ok(!isExternalPaymentUrl('https://localhost/pay'));
});
