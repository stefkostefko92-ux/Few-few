// Входът (SPEC §1.1, критерии 1–3): webhook-ът на Brevo inbound. Brevo няма подпис — пазят ни тайният път
// и Bearer токенът. 4xx/5xx изхвърлят писмото без повторен опит, 429 се опитва пак → временен провал = 429.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { parseBrevoPayload } from '../src/inbound/brevo.js';
import { MemoryTicketStore } from '../src/tickets/memory.js';
import { inboundRoutes } from '../src/http/inbound-routes.js';
import express from 'express';
import { item } from './fixtures.js';

const PATH = 'p'.repeat(40);
const TOKEN = 't'.repeat(40);
const NOW = new Date('2026-11-27T10:00:00Z');

test('парсер: текстът без подписа, адресът с малки букви, само имената на прикачените', () => {
  const { mails, invalid } = parseBrevoPayload({ items: [item()] });
  assert.equal(invalid, 0);
  const m = mails[0]!;
  assert.equal(m.messageId, '<abc-1@mail.example>');
  assert.equal(m.fromAddress, 'ivan@firma.bg');
  assert.equal(m.fromName, 'Иван Петров');
  assert.equal(m.text, 'Здравейте, не мога да вляза.');
  assert.equal(m.spamScore, 0.4);
  assert.deepEqual(m.attachments, [{ name: 'snimka.png', contentType: 'image/png', size: 2048 }]);
  assert.doesNotMatch(JSON.stringify(m), /SECRET-DL-TOKEN/, 'DownloadToken не се пази');
});

test('парсер: Spam.Score (по документацията) или SpamScore (по примера); без текст → RawTextBody → HTML без тагове', () => {
  assert.equal(
    parseBrevoPayload({ items: [item({ SpamScore: undefined, Spam: { Score: 7.5 } })] }).mails[0]!
      .spamScore,
    7.5,
  );
  const noMd = parseBrevoPayload({
    items: [item({ ExtractedMarkdownMessage: '', RawTextBody: 'само текст' })],
  }).mails[0]!;
  assert.equal(noMd.text, 'само текст');
  const onlyHtml = parseBrevoPayload({
    items: [
      item({
        ExtractedMarkdownMessage: null,
        RawTextBody: null,
        RawHtmlBody: '<p>Ред&nbsp;1</p><script>x()</script><p>Ред 2</p>',
      }),
    ],
  }).mails[0]!;
  assert.equal(onlyHtml.text, 'Ред 1\nРед 2');
});

test('парсер: без MessageId или подател — невалиден запис се брои, не чупи останалите', () => {
  const r = parseBrevoPayload({
    items: [item(), item({ MessageId: '' }), item({ From: null }), 'боклук'],
  });
  assert.equal(r.mails.length, 1);
  assert.equal(r.invalid, 3);
  assert.deepEqual(parseBrevoPayload({ nope: 1 }), { mails: [], invalid: 0 });
});

let server: Server;
let base = '';
let store: MemoryTicketStore;
let failNext = false;

before(async () => {
  store = new MemoryTicketStore();
  const orig = store.saveInbound.bind(store);
  store.saveInbound = async (...a) => {
    if (failNext) {
      failNext = false;
      throw new Error('db down');
    }
    return orig(...a);
  };
  const app = express();
  app.use('/inbound/brevo', inboundRoutes({ store, path: PATH, token: TOKEN, now: () => NOW }));
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

const send = (path: string, body: unknown, token: string | null = TOKEN) =>
  fetch(`${base}/inbound/brevo/${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

test('webhook: грешен път → 404; без или с грешен Bearer → 401; добро писмо → 200 и билет', async () => {
  assert.equal((await send('x'.repeat(40), { items: [item()] })).status, 404);
  assert.equal((await send(PATH, { items: [item()] }, null)).status, 401);
  assert.equal((await send(PATH, { items: [item()] }, 'z'.repeat(40))).status, 401);
  const ok = await send(PATH, { items: [item()] });
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { accepted: 1, duplicates: 0, invalid: 0 });
  const [t] = await store.list(10);
  assert.equal(t!.cls, 'technical');
  assert.equal(t!.status, 'new');
});

test('webhook: същият MessageId втори път → един билет', async () => {
  const r = await send(PATH, { items: [item()] });
  assert.deepEqual(await r.json(), { accepted: 0, duplicates: 1, invalid: 0 });
  assert.equal((await store.list(10)).length, 1);
});

test('webhook: провал на базата → 429 (Brevo опитва пак), не 500 (изхвърля)', async () => {
  failNext = true;
  const r = await send(PATH, { items: [item({ MessageId: '<abc-2@mail.example>' })] });
  assert.equal(r.status, 429);
  assert.equal(
    (await send(PATH, { items: [item({ MessageId: '<abc-2@mail.example>' })] })).status,
    200,
    'повторният опит минава',
  );
});

test('webhook: спам по оценка → клас spam, без чернова; DSAR → чака човек', async () => {
  await send(PATH, {
    items: [
      item({
        MessageId: '<s@x>',
        SpamScore: 9.1,
        Subject: 'WIN',
        ExtractedMarkdownMessage: 'cheap',
      }),
    ],
  });
  await send(PATH, {
    items: [
      item({
        MessageId: '<d@x>',
        Subject: 'Искане',
        ExtractedMarkdownMessage: 'Моля, изтрийте личните ми данни по GDPR.',
      }),
    ],
  });
  const all = await store.list(10);
  assert.equal(all.find((t) => t.subject === 'WIN')!.status, 'closed');
  assert.equal(all.find((t) => t.subject === 'Искане')!.status, 'needs_human');
});
