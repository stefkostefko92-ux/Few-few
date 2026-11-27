// Панелът и инвариантите (SPEC §2–4, критерии 8–11): без вход → 401; webhook-ът е извън сесията;
// рисков клас без второ потвърждение → 409; БЕЗ ОДОБРЕНИЕ НИЩО НЕ ИЗЛИЗА — в кода няма изпращач и
// целият път не прави нито една изходяща заявка; старите писма се трият.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../src/http/app.js';
import { MemoryTicketStore } from '../src/tickets/memory.js';
import { MemoryOwnerStore } from '../src/auth/owner-store.js';
import { hashPassword } from '../src/auth/password.js';
import { generateTotpSecret, totpCodeAt, totpStep } from '../src/auth/totp.js';
import { encryptSecret } from '../src/auth/crypto.js';
import { draftOnce } from '../src/draft/worker.js';
import { purgeExpired } from '../src/tickets/retention.js';
import type { AppConfig } from '../src/config.js';
import { item } from './fixtures.js';

const fake = (label: string): string => ['t', label, 'x'.repeat(40)].join('-');
const ORIGIN = 'https://otgovorko.example';
const NOW = new Date('2026-11-27T10:00:00Z');
const config: AppConfig = {
  jwtSecret: fake('jwt'),
  totpKey: Buffer.alloc(32, 7).toString('base64'),
  dataKey: Buffer.alloc(32, 8).toString('base64'),
  appOrigin: ORIGIN,
  cookieSecure: false,
  httpPort: 0,
  trustProxy: false,
  inboundPath: 'p'.repeat(40),
  inboundToken: 'k'.repeat(40),
  vertexProjectId: null,
  vertexRegion: 'eu',
  draftModel: 'claude-sonnet-5-5',
  allowedLinkDomains: ['carbonstealth.eu'],
  retentionDays: 180,
  leakCanary: 'CSABCDEF0123456789',
};
const TOTP = generateTotpSecret();
const store = new MemoryTicketStore();
let server: Server;
let base = '';
let cookie = '';
const outbound: string[] = [];
const realFetch = globalThis.fetch;

before(async () => {
  const owners = new MemoryOwnerStore();
  await owners.create({
    email: 'owner@otgovorko.example',
    passwordHash: await hashPassword(fake('pass')),
    totpSecretEnc: encryptSecret(TOTP, config.totpKey),
  });
  const app = createApp({
    config,
    tickets: store,
    owners,
    now: () => NOW,
    nowSeconds: () => Math.floor(NOW.getTime() / 1000),
    pingDb: async () => true,
  });
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  // Всяка изходяща заявка, която не е към нашия тестов сървър, се записва — очакваме нула.
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith(base)) outbound.push(url);
    return realFetch(input, init);
  }) as typeof fetch;
  const login = await api('/api/auth/login', {
    email: 'owner@otgovorko.example',
    password: fake('pass'),
    code: totpCodeAt(TOTP, totpStep(Math.floor(NOW.getTime() / 1000))),
  });
  assert.equal(login.status, 200);
  cookie = (login.headers.get('set-cookie') ?? '').split(';')[0]!;
});

after(() => {
  globalThis.fetch = realFetch;
  server.close();
});

function api(
  path: string,
  body?: unknown,
  method = body === undefined ? 'GET' : 'POST',
): Promise<Response> {
  return fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', origin: ORIGIN, ...(cookie ? { cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const inbound = (over: Record<string, unknown>) =>
  fetch(`${base}/inbound/brevo/${config.inboundPath}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${config.inboundToken}` },
    body: JSON.stringify({ items: [item(over)] }),
  });

test('без вход: панелът → 401; webhook-ът е извън сесията и Origin проверката', async () => {
  for (const p of ['/api/tickets', '/api/voice', '/api/samples']) {
    assert.equal((await fetch(`${base}${p}`)).status, 401, p);
  }
  assert.equal((await inbound({ MessageId: '<p1@x>' })).status, 200);
});

test('целият път: писмо → чернова → преглед → „пратено“, рисковото — с второ потвърждение', async () => {
  await inbound({
    MessageId: '<p2@x>',
    Subject: 'Двойно таксуване',
    ExtractedMarkdownMessage: 'Таксувахте ме два пъти, върнете парите.',
  });
  const model = {
    async complete() {
      return 'Здравейте! Проверяваме плащането и ще Ви върнем отговор до 2 работни дни.';
    },
  };
  while (
    (await draftOnce({
      store,
      model,
      now: () => NOW,
      canary: config.leakCanary,
      allowedDomains: config.allowedLinkDomains,
      draftModel: config.draftModel,
    })) !== 'idle'
  );
  const list = (await (await api('/api/tickets')).json()) as {
    tickets: { id: string; cls: string; status: string; risky: boolean }[];
  };
  const pay = list.tickets.find((t) => t.cls === 'payment')!;
  assert.equal(pay.status, 'drafted');
  assert.equal(pay.risky, true);
  const one = await api(`/api/tickets/${pay.id}`);
  const detail = (await one.json()) as {
    draft: string;
    from: { address: string };
    subject: string;
  };
  assert.match(detail.draft, /Проверяваме плащането/);
  const text = detail.draft + '\n\nПоздрави, Стефан';
  const noConfirm = await api(`/api/tickets/${pay.id}/sent`, { text });
  assert.equal(noConfirm.status, 409);
  assert.equal(((await noConfirm.json()) as { code: string }).code, 'confirm_risk');
  const ok = await api(`/api/tickets/${pay.id}/sent`, { text, confirmRisk: true });
  assert.equal(ok.status, 200);
  const after = (await (await api(`/api/tickets/${pay.id}`)).json()) as {
    status: string;
    draft: string;
  };
  assert.equal(after.status, 'sent');
  assert.match(after.draft, /Поздрави, Стефан/, 'пазим пратения текст (за образец)');
  assert.equal(
    (await api(`/api/tickets/${pay.id}/sent`, { text, confirmRisk: true })).status,
    409,
    'не два пъти',
  );
  assert.deepEqual(outbound, [], 'нито една изходяща заявка — Отговорко не праща');
});

test('гласът и образците: само собственикът; образецът е от пратен отговор', async () => {
  assert.equal((await api('/api/voice', { text: 'Пишем кратко, на „Вие“.' }, 'PUT')).status, 200);
  assert.equal(
    ((await (await api('/api/voice')).json()) as { text: string }).text,
    'Пишем кратко, на „Вие“.',
  );
  const list = (await (await api('/api/tickets')).json()) as {
    tickets: { id: string; status: string }[];
  };
  const sent = list.tickets.find((t) => t.status === 'sent')!;
  assert.equal((await api(`/api/tickets/${sent.id}/sample`, {})).status, 200);
  const samples = (await (await api('/api/samples')).json()) as {
    samples: { id: string; text: string }[];
  };
  assert.equal(samples.samples.length, 1);
  const draftOnly = list.tickets.find((t) => t.status !== 'sent')!;
  assert.equal(
    (await api(`/api/tickets/${draftOnly.id}/sample`, {})).status,
    409,
    'непратен не става образец',
  );
});

test('чужд Origin при промяна → 403 (CSRF)', async () => {
  const r = await fetch(`${base}/api/voice`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', origin: 'https://evil.example', cookie },
    body: JSON.stringify({ text: 'x' }),
  });
  assert.equal(r.status, 403);
});

test('срокът: писмо по-старо от 180 дни се трие, по-новото остава', async () => {
  const s = new MemoryTicketStore();
  const old = await s.saveInbound(
    {
      messageId: '<old@x>',
      inReplyTo: null,
      fromAddress: 'a@b.bg',
      fromName: null,
      subject: 's',
      text: 't',
      spamScore: 0,
      attachments: [],
    },
    'question',
    new Date('2026-05-01T10:00:00Z'),
  );
  const fresh = await s.saveInbound(
    {
      messageId: '<new@x>',
      inReplyTo: null,
      fromAddress: 'a@b.bg',
      fromName: null,
      subject: 's',
      text: 't',
      spamScore: 0,
      attachments: [],
    },
    'question',
    new Date('2026-11-01T10:00:00Z'),
  );
  assert.equal(await purgeExpired(s, NOW, 180), 1);
  assert.equal(await s.get(old.id), null);
  assert.ok(await s.get(fresh.id));
});

test('в кода няма изпращач: нито fetch, нито SMTP, нито Brevo /smtp — единствената мрежа е моделът (SDK)', () => {
  const files: string[] = [];
  const walk = (d: string): void => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.ts')) files.push(p);
    }
  };
  walk(new URL('../src', import.meta.url).pathname);
  assert.ok(files.length > 10);
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    assert.doesNotMatch(src, /\bfetch\(|nodemailer|smtp|sendmail|\/v3\/smtp|createTransport/i, f);
  }
});
