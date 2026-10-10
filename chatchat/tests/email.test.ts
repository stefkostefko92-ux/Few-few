import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { loadConfig } from '../src/config.js';
import { answerIsUrgent } from '../src/services/collab/urgency.js';
import { EMAIL_KIND_OF } from '../src/services/email/enqueue.js';
import { BrevoMailer, type OutgoingMail } from '../src/services/email/mailer.js';
import { backoffMs, inQuietHours, localTime, quietUntil } from '../src/services/email/schedule.js';
import { renderEmail } from '../src/services/email/templates.js';

/**
 * Имейл известията (§12.3, FR-18): текстовете без съдържание и лични данни, на езика на човека;
 * времето (часова зона, тихи часове, повторни опити); клиентът към Brevo — ключът само в хедъра,
 * класификация по статус, без тялото на отговора; „спешно“ от записаното; конфигурацията.
 */

const BASE_ENV = {
  PUBLIC_BASE_URL: 'https://chatchat.test',
  DATABASE_URL: 'postgresql://x/y',
  SESSION_PEPPER: 'p'.repeat(40),
  MFA_ENC_KEY: Buffer.alloc(32, 1).toString('base64'),
};

describe('текстовете', () => {
  test('без съдържание/имена; място: канал по име, DM — общо; три езика', () => {
    const dm = renderEmail('it', {
      kind: 'MESSAGE',
      place: { type: 'DIRECT', name: null },
      link: 'https://chatchat.test/#c=abc',
    });
    assert.equal(dm.subject, 'ChatChat: nuovo messaggio in una conversazione diretta');
    assert.ok(dm.text.includes('https://chatchat.test/#c=abc'));
    const channel = renderEmail('en', {
      kind: 'MENTION',
      place: { type: 'CHANNEL', name: 'Service LTX' },
      link: 'https://x',
    });
    assert.equal(channel.subject, 'ChatChat: you were mentioned in “Service LTX”');
    const bg = renderEmail('bg', {
      kind: 'CASE_URGENT',
      caseNumber: 'CASE-2026-000001',
      link: 'https://x',
    });
    assert.equal(bg.subject, 'ChatChat: спешен случай CASE-2026-000001');
    const unknown = renderEmail('fr', {
      kind: 'DIGEST',
      messages: 3,
      conversations: 2,
      notifications: 1,
      link: 'https://x',
    });
    assert.match(unknown.text, /Ha 3 messaggi non letti in 2 conversazioni e 1 notifiche/);
  });

  test('HTML: всичко е екранирано (име на канал с тагове, връзка с кавички)', () => {
    const mail = renderEmail('it', {
      kind: 'MESSAGE',
      place: { type: 'CHANNEL', name: '<img src=x onerror=alert(1)>' },
      link: 'https://x/"><script>',
    });
    assert.equal(mail.html.includes('<img'), false);
    assert.equal(mail.html.includes('<script>'), false);
    assert.ok(mail.html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  });

  test('кои известия стават писмо', () => {
    assert.deepEqual(EMAIL_KIND_OF, {
      'message.mention': 'MENTION',
      'message.created': 'MESSAGE',
      'case.assigned': 'CASE_ASSIGNED',
      'case.urgent': 'CASE_URGENT',
    });
  });
});

describe('времето', () => {
  test('местно време по IANA зона; тихи часове през полунощ; край на тихите часове', () => {
    const at = new Date('2026-10-10T21:30:00Z'); // 23:30 в Рим (CEST), 00:30 в София
    assert.deepEqual(localTime(at, 'Europe/Rome'), { date: '2026-10-10', minutes: 23 * 60 + 30 });
    assert.deepEqual(localTime(at, 'Europe/Sofia'), { date: '2026-10-11', minutes: 30 });
    assert.equal(inQuietHours(23 * 60, 22 * 60, 7 * 60), true);
    assert.equal(inQuietHours(6 * 60 + 59, 22 * 60, 7 * 60), true);
    assert.equal(inQuietHours(7 * 60, 22 * 60, 7 * 60), false);
    assert.equal(inQuietHours(12 * 60, 9 * 60, 18 * 60), true);
    assert.equal(inQuietHours(12 * 60, 12 * 60, 12 * 60), false);
    const until = quietUntil(at, 'Europe/Rome', { start: 22 * 60, end: 7 * 60 });
    assert.equal(until?.toISOString(), '2026-10-11T05:00:00.000Z');
    assert.equal(quietUntil(at, 'Europe/Rome', { start: null, end: null }), null);
    assert.equal(quietUntil(at, 'Europe/Rome', { start: 8 * 60, end: 9 * 60 }), null);
  });

  test('повторни опити: 1, 2, 4… минути, таван час', () => {
    assert.deepEqual([1, 2, 3, 4].map(backoffMs), [60_000, 120_000, 240_000, 480_000]);
    assert.equal(backoffMs(30), 3_600_000);
  });
});

describe('клиентът към Brevo', () => {
  const mail: OutgoingMail = {
    to: 'tecnico@example.test',
    subject: 's',
    text: 't',
    html: '<p>t</p>',
    idempotencyKey: 'row-1',
    tag: 'MESSAGE',
  };
  const cfg = {
    apiKey: 'xkeysib-test-not-a-real-key',
    apiUrl: 'https://api.brevo.test/v3/smtp/email',
    fromEmail: 'no-reply@carbonstealth.eu',
    fromName: 'ChatChat',
    timeoutMs: 1000,
  };

  test('заявката: ключът само в хедъра, подател, получател, идемпотентност; 201 → изпратено', async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const fake: typeof fetch = async (url, init) => {
      seen = { url: String(url), init: init ?? {} };
      return new Response('{"messageId":"<x@relay>"}', { status: 201 });
    };
    const result = await new BrevoMailer(cfg, fake).send(mail);
    assert.deepEqual(result, { ok: true });
    assert.ok(seen);
    const { url, init } = seen as { url: string; init: RequestInit };
    assert.equal(url, cfg.apiUrl);
    const headers = init.headers as Record<string, string>;
    assert.equal(headers['api-key'], cfg.apiKey);
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    assert.deepEqual(body.sender, { email: cfg.fromEmail, name: 'ChatChat' });
    assert.deepEqual(body.to, [{ email: mail.to }]);
    assert.deepEqual(body.headers, { 'Idempotency-Key': 'row-1' });
    assert.equal(JSON.stringify(body).includes(cfg.apiKey), false);
  });

  test('статусите: 429/5xx/мрежа/таймаут → повтор; 400/401 → край; грешката не носи тялото', async () => {
    const answer = (status: number, body = 'tecnico@example.test rejected') =>
      new BrevoMailer(cfg, async () => new Response(body, { status })).send(mail);
    assert.deepEqual(await answer(429), { ok: false, retry: true, code: 'http_429' });
    assert.deepEqual(await answer(503), { ok: false, retry: true, code: 'http_503' });
    assert.deepEqual(await answer(400), { ok: false, retry: false, code: 'http_400' });
    assert.deepEqual(await answer(401), { ok: false, retry: false, code: 'http_401' });
    const network = await new BrevoMailer(cfg, async () => {
      throw new TypeError('fetch failed');
    }).send(mail);
    assert.deepEqual(network, { ok: false, retry: true, code: 'network' });
    const timeout = await new BrevoMailer(cfg, async () => {
      throw new DOMException('timeout', 'TimeoutError');
    }).send(mail);
    assert.deepEqual(timeout, { ok: false, retry: true, code: 'timeout' });
  });
});

describe('спешно и конфигурацията', () => {
  test('спешен AI отговор: блокиран от Safety Gate или препоръчана ескалация', () => {
    assert.equal(
      answerIsUrgent({ safety: { level: 'blocked' }, escalation: { recommended: false } }),
      true,
    );
    assert.equal(
      answerIsUrgent({ safety: { level: 'standard' }, escalation: { recommended: true } }),
      true,
    );
    assert.equal(
      answerIsUrgent({ safety: { level: 'caution' }, escalation: { recommended: false } }),
      false,
    );
    for (const junk of [null, 'blocked', [], { safety: 'blocked' }]) {
      assert.equal(answerIsUrgent(junk), false);
    }
  });

  test('Brevo: празно → изключено; ключ без валиден подател → не тръгва', () => {
    const off = loadConfig({ ...BASE_ENV, BREVO_API_KEY: '', MAIL_FROM_EMAIL: '' });
    assert.equal(off.BREVO_API_KEY, '');
    assert.equal(off.BREVO_API_URL, 'https://api.brevo.com/v3/smtp/email');
    assert.throws(
      () => loadConfig({ ...BASE_ENV, BREVO_API_KEY: 'xkeysib-1', MAIL_FROM_EMAIL: 'nope' }),
      /MAIL_FROM_EMAIL/,
    );
    const on = loadConfig({
      ...BASE_ENV,
      BREVO_API_KEY: 'xkeysib-1',
      MAIL_FROM_EMAIL: 'no-reply@carbonstealth.eu',
      EMAIL_DELAY_SECONDS: '60',
    });
    assert.equal(on.EMAIL_DELAY_SECONDS, 60);
    assert.equal(on.EMAIL_DIGEST_HOUR, 7);
  });
});
