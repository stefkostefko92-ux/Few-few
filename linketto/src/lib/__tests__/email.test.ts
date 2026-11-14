import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brevoPayload, deliveryEmailHtml, deliverySubject, parseSender } from '../email';

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

test('parseSender: „Име <адрес>“ и само адрес; невалидно → null', () => {
  assert.deepEqual(parseSender('Linketto <no-reply@linketto.eu>'), {
    name: 'Linketto',
    email: 'no-reply@linketto.eu',
  });
  assert.deepEqual(parseSender('no-reply@linketto.eu'), { email: 'no-reply@linketto.eu' });
  assert.deepEqual(parseSender('  "Linketto Team" <a@b.eu> '), { name: 'Linketto Team', email: 'a@b.eu' });
  assert.equal(parseSender(''), null);
  assert.equal(parseSender('Linketto <не-е-имейл>'), null);
});

test('brevoPayload: полетата на Brevo v3 (sender/to/subject/htmlContent), без стандартни хедъри', () => {
  const body = brevoPayload({
    sender: { name: 'Linketto', email: 'no-reply@linketto.eu' },
    to: 'buyer@example.com',
    subject: 'Покупка',
    html: '<p>x</p>',
    tag: 'delivery',
  });
  assert.deepEqual(body, {
    sender: { name: 'Linketto', email: 'no-reply@linketto.eu' },
    to: [{ email: 'buyer@example.com' }],
    subject: 'Покупка',
    htmlContent: '<p>x</p>',
    tags: ['delivery'],
  });
  assert.equal('headers' in body, false);
});
