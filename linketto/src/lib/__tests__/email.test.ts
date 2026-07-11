import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deliveryEmailHtml, deliverySubject } from '../email';

test('имейлът за доставка е на езика на купувача', () => {
  const en = deliveryEmailHtml({
    productTitle: 'E-book',
    deliveryUrl: 'https://example.com/x',
    amountCents: 1200,
    locale: 'en',
  });
  assert.ok(en.includes('Thank you for buying'));
  assert.ok(en.includes('€12.00'));
  assert.ok(en.includes('14-day right of withdrawal'));

  const it = deliveryEmailHtml({
    productTitle: 'E-book',
    deliveryUrl: 'https://example.com/x',
    amountCents: 500,
    locale: 'it',
  });
  assert.ok(it.includes('Grazie per aver acquistato'));
});

test('липсващ/непознат език пада към bg (източник)', () => {
  const fallback = deliveryEmailHtml({
    productTitle: 'X',
    deliveryUrl: 'https://example.com/x',
    amountCents: 300,
  });
  assert.ok(fallback.includes('Благодарим за покупката'));
});

test('темата на имейла носи заглавието и езика', () => {
  assert.equal(deliverySubject('Курс', 'bg'), 'Linketto — Покупка: Курс');
  assert.equal(deliverySubject('Course', 'en'), 'Linketto — Purchase: Course');
});

test('HTML-ът екранира потребителския вход (без инжекция)', () => {
  const html = deliveryEmailHtml({
    productTitle: '<script>alert(1)</script>',
    deliveryUrl: 'https://example.com/"x',
    amountCents: 300,
    locale: 'en',
  });
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});
