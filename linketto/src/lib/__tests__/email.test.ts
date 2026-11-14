import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brevoPayload, broadcastHtml, parseSender, subscribeConfirmHtml } from '../email';

test('потвърждението за бюлетин е на езика на абоната; непознат → en', () => {
  const it = subscribeConfirmHtml({ sellerName: 'Ana', confirmUrl: 'https://example.com/c', locale: 'it' });
  assert.ok(it.includes('Conferma la tua email'));
  const fallback = subscribeConfirmHtml({ sellerName: 'Ana', confirmUrl: 'https://example.com/c', locale: 'xx' });
  assert.ok(fallback.includes('Please confirm your email'));
});

test('HTML-ът екранира потребителския вход (без инжекция)', () => {
  const html = broadcastHtml({
    sellerName: '<img src=x onerror=alert(1)>',
    subject: '<script>alert(1)</script>',
    body: 'ред 1\n<b>ред 2</b>',
    unsubscribeUrl: 'https://example.com/"x',
    locale: 'en',
  });
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('ред 1<br>&lt;b&gt;'));
  assert.ok(html.includes('&quot;x'));
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
