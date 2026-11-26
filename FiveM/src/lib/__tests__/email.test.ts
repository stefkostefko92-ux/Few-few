import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { brevoPayload, parseSender, sendMail } from '../email';

/**
 * Имейлите минават през Brevo (решение на собственика, 25.11.2026 — „навсякъде Brevo“):
 * Sendinblue SAS, Франция — ЕС. Досега беше Resend (САЩ), тоест пренос към трета държава.
 * Тестовете заковават доставчика, формата на заявката и поведението без ключ.
 */

const realFetch = globalThis.fetch;
const env = { ...process.env };
afterEach(() => {
  globalThis.fetch = realFetch;
  process.env = { ...env };
});

test('подателят „Име <адрес>“ се разделя за Brevo; голият адрес също минава', () => {
  assert.deepEqual(parseSender('Thraex PVP <no-reply@thraex.carbonstealth.eu>'), {
    name: 'Thraex PVP',
    email: 'no-reply@thraex.carbonstealth.eu',
  });
  assert.deepEqual(parseSender('no-reply@thraex.carbonstealth.eu'), { email: 'no-reply@thraex.carbonstealth.eu' });
  assert.equal(parseSender('не е адрес'), null);
});

test('заявката е във формата на Brevo POST /v3/smtp/email (текстово писмо)', () => {
  const p = brevoPayload(
    { to: 'a@example.eu', subject: 'Тема', body: 'Текст' },
    { name: 'Thraex PVP', email: 'no-reply@thraex.carbonstealth.eu' },
  );
  assert.deepEqual(p, {
    sender: { name: 'Thraex PVP', email: 'no-reply@thraex.carbonstealth.eu' },
    to: [{ email: 'a@example.eu' }],
    subject: 'Тема',
    textContent: 'Текст',
  });
});

test('без BREVO_API_KEY нищо не тръгва към мрежата и връща false', async () => {
  delete process.env.BREVO_API_KEY;
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    return new Response(null, { status: 201 });
  }) as typeof fetch;
  assert.equal(await sendMail({ to: 'a@example.eu', subject: 's', body: 'b' }), false);
  assert.equal(called, false);
});

test('с ключ: Brevo, ключът е в хедъра api-key (не в адреса), 201 = изпратено', async () => {
  process.env.BREVO_API_KEY = 'xkeysib-test';
  let seen: { url: string; init: RequestInit } | null = null;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    seen = { url: String(url), init: init ?? {} };
    return new Response('{"messageId":"<x>"}', { status: 201 });
  }) as typeof fetch;
  assert.equal(await sendMail({ to: 'a@example.eu', subject: 's', body: 'b' }), true);
  assert.ok(seen);
  const s = seen as { url: string; init: RequestInit };
  assert.equal(s.url, 'https://api.brevo.com/v3/smtp/email');
  const headers = s.init.headers as Record<string, string>;
  assert.equal(headers['api-key'], 'xkeysib-test');
  assert.ok(!('authorization' in headers), 'Brevo не ползва Bearer');
  assert.doesNotMatch(s.url, /xkeysib/);
});

test('отказ от доставчика → false, без да хвърля (решението остава взето)', async () => {
  process.env.BREVO_API_KEY = 'xkeysib-test';
  globalThis.fetch = (async () => new Response('{"code":"unauthorized"}', { status: 401 })) as typeof fetch;
  assert.equal(await sendMail({ to: 'a@example.eu', subject: 's', body: 'b' }), false);
  globalThis.fetch = (async () => {
    throw new Error('мрежа');
  }) as typeof fetch;
  assert.equal(await sendMail({ to: 'a@example.eu', subject: 's', body: 'b' }), false);
});
