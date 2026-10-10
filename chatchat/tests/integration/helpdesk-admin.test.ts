import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import type { IntegrationDeps } from '../../src/services/integrations/deps.js';
import { FakeHelpdesk } from './helpdesk-fake.js';
import {
  configure,
  configureWebhook,
  drain,
  INBOUND,
  localDeps,
  openTicket,
  seedHelpdeskWorld,
  SIGNING,
  strictDeps,
  type HelpdeskWorld,
} from './helpdesk-world.js';
import { db, makeUser, resetDb, signIn, startApp, type Harness } from './helpers.js';

/**
 * Админ API на интеграцията (`integrations:manage`): достъп само за администратора на клиента,
 * тайните никога в отговор/одит/базата в открит вид, SSRF при запис и при теста на връзката,
 * задължителните тайни, изолация между клиентите, изключена интеграция без INTEGRATION_KEK.
 */

const fake = new FakeHelpdesk();
let h: Harness;
let strict: Harness;
let strictIntegrations: IntegrationDeps;
let off: Harness;
let w: HelpdeskWorld;

before(async () => {
  await fake.start();
  h = await startApp({ diagnose: 'none', integrations: localDeps(fake) });
  // Продукционната политика; DNS: „helpdesk.example“ → публичен, „private.example“ → частен адрес.
  strictIntegrations = strictDeps({
    resolve: async (host) => [
      { address: host.startsWith('private') ? '10.0.0.7' : '93.184.216.34', family: 4 },
    ],
    timeoutMs: 500,
  });
  strict = await startApp({ diagnose: 'none', integrations: strictIntegrations });
  off = await startApp({ diagnose: 'none', integrations: null });
});
after(async () => {
  await Promise.all([h.close(), strict.close(), off.close()]);
  await fake.close();
  await db.$disconnect();
});
beforeEach(async () => {
  await resetDb();
  fake.reset();
  w = await seedHelpdeskWorld(h);
});

describe('достъп', () => {
  test('само администраторът на клиента; поддръжка/техник → 403', async () => {
    assert.equal((await w.adminA.get('/api/v1/admin/integrations')).status, 200);
    for (const c of [w.support, w.tech]) {
      assert.equal((await c.get('/api/v1/admin/integrations')).status, 403);
      assert.equal((await c.get('/api/v1/admin/integrations/deliveries')).status, 403);
      assert.equal(
        (await configure(c, { kind: 'WEBHOOK', enabled: false, settings: {} })).status,
        403,
      );
    }
    const noMfa = await makeUser({
      tenantId: w.tenantA.id,
      role: 'TENANT_ADMIN',
      name: 'Senza MFA',
    });
    const pending = await signIn(h, noMfa, { mfaPassed: false });
    assert.equal((await pending.get('/api/v1/admin/integrations')).status, 401);
    const me = await w.adminA.get('/api/v1/auth/me');
    assert.ok((me.body.capabilities as string[]).includes('integrations:manage'));
  });

  test('без INTEGRATION_KEK → available:false, запис/тест 503', async () => {
    const adminOff = w.adminA.withBase(off.base);
    const view = await adminOff.get('/api/v1/admin/integrations');
    assert.deepEqual([view.status, view.body.available], [200, false]);
    const put = await configure(adminOff, {
      kind: 'WEBHOOK',
      enabled: false,
      settings: { url: 'https://x.example' },
    });
    assert.deepEqual([put.status, put.body.code], [503, 'integrations_unavailable']);
    assert.equal((await adminOff.post('/api/v1/admin/integrations/test')).status, 503);
  });

  test('дневникът е по клиент: B не вижда доставките на A', async () => {
    await configureWebhook(w.adminA, fake);
    await openTicket(w.tech);
    const a = await w.adminA.get('/api/v1/admin/integrations/deliveries');
    const b = await w.adminB.get('/api/v1/admin/integrations/deliveries');
    assert.equal(a.body.items.length, 1);
    assert.equal(b.body.items.length, 0);
    assert.equal(
      (await w.adminA.get('/api/v1/admin/integrations/deliveries?status=NOPE')).status,
      400,
    );
  });
});

describe('тайните', () => {
  test('само „зададена ли е“ в отговора; в базата — шифровани; в одита — само имената на полетата', async () => {
    const res = await configure(w.adminA, {
      kind: 'WEBHOOK',
      enabled: true,
      settings: { url: `${fake.base}/hook`, language: 'bg' },
      secrets: { signingSecret: SIGNING, inboundSecret: INBOUND },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const view = await w.adminA.get('/api/v1/admin/integrations');
    assert.deepEqual(view.body.integration.secrets, { signingSecret: true, inboundSecret: true });
    assert.match(view.body.integration.inboundUrl, /\/api\/v1\/integrations\/inbound\/[\w-]{16,}$/);
    const everything = JSON.stringify([res.body, view.body]);
    const row = await db.helpdeskIntegration.findUniqueOrThrow({
      where: { tenantId: w.tenantA.id },
    });
    const audits = JSON.stringify(
      await db.auditEvent.findMany({ where: { action: { startsWith: 'integration.' } } }),
    );
    for (const secret of [SIGNING, INBOUND]) {
      assert.equal(everything.includes(secret), false, 'не в API');
      assert.equal((row.secrets ?? '').includes(secret), false, 'не открито в базата');
      assert.equal(audits.includes(secret), false, 'не в одита');
    }
    assert.match(audits, /"secretsChanged":\["signingSecret","inboundSecret"\]/);
    // Пропуснато поле = без промяна; null = изтриване.
    await configure(w.adminA, {
      kind: 'WEBHOOK',
      enabled: true,
      settings: { url: `${fake.base}/hook` },
      secrets: { inboundSecret: null },
    });
    const after2 = await w.adminA.get('/api/v1/admin/integrations');
    assert.deepEqual(after2.body.integration.secrets, {
      signingSecret: true,
      inboundSecret: false,
    });
  });

  test('включване без задължителна тайна, непознато поле, слаба тайна → 422 с имената на полетата', async () => {
    const missing = await configure(w.adminA, {
      kind: 'ZENDESK',
      enabled: true,
      settings: { subdomain: 'alfa', authMode: 'api_token' },
      secrets: { email: 'svc@alfa.example' },
    });
    assert.deepEqual(
      [missing.status, missing.body.code, missing.body.fields],
      [422, 'secrets_missing', ['apiToken']],
    );
    const unknown = await configure(w.adminA, {
      kind: 'WEBHOOK',
      enabled: false,
      settings: { url: `${fake.base}/hook` },
      secrets: { password: 'x'.repeat(40) },
    });
    assert.deepEqual([unknown.status, unknown.body.code], [422, 'invalid_secret_field']);
    const weak = await configure(w.adminA, {
      kind: 'WEBHOOK',
      enabled: true,
      settings: { url: `${fake.base}/hook` },
      secrets: { signingSecret: 'short' },
    });
    assert.deepEqual(
      [weak.status, weak.body.code, weak.body.fields],
      [422, 'invalid_secret', ['signingSecret']],
    );
    const badSettings = await configure(w.adminA, {
      kind: 'JSM',
      enabled: false,
      settings: { baseUrl: 'https://x.example', serviceDeskId: 'abc' },
    });
    assert.deepEqual([badSettings.status, badSettings.body.code], [422, 'invalid_settings']);
  });
});

describe('SSRF и тест на връзката', () => {
  test('продукционната политика: http, IP литерал, вътрешно име → 422 при запис', async () => {
    const admin = w.adminA.withBase(strict.base);
    for (const [url, code] of [
      ['http://helpdesk.example/hook', 'https_required'],
      ['https://127.0.0.1/hook', 'ssrf_blocked'],
      ['https://169.254.169.254/latest', 'ssrf_blocked'],
      ['https://[::1]/hook', 'ssrf_blocked'],
      ['https://helpdesk.internal/hook', 'ssrf_blocked'],
      ['https://user:pw@helpdesk.example/hook', 'credentials_in_url'],
    ] as const) {
      const res = await configure(admin, {
        kind: 'WEBHOOK',
        enabled: true,
        settings: { url },
        secrets: { signingSecret: SIGNING },
      });
      assert.deepEqual([res.status, res.body.code], [422, code], url);
    }
  });

  test('име, което DNS разрешава до частен адрес → тестът и доставката дават ssrf_blocked', async () => {
    const admin = w.adminA.withBase(strict.base);
    const res = await configure(admin, {
      kind: 'WEBHOOK',
      enabled: true,
      settings: { url: 'https://private.example/hook' },
      secrets: { signingSecret: SIGNING },
    });
    assert.equal(res.status, 200, 'синтактично адресът е допустим');
    const t = await admin.post('/api/v1/admin/integrations/test');
    assert.deepEqual(t.body.test, { ok: false, code: 'ssrf_blocked' });
    await openTicket(w.tech.withBase(strict.base));
    await drain(strictIntegrations);
    const row = await db.helpdeskDelivery.findFirstOrThrow();
    assert.deepEqual([row.status, row.lastError], ['DEAD', 'ssrf_blocked']);
  });

  test('тестът срещу фалшивия helpdesk: успех и грешка — само код, в одита', async () => {
    assert.equal((await w.adminA.post('/api/v1/admin/integrations/test')).status, 404);
    await configureWebhook(w.adminA, fake);
    const ok = await w.adminA.post('/api/v1/admin/integrations/test');
    assert.deepEqual(ok.body.test, { ok: true, code: 'ok' });
    assert.equal((JSON.parse(fake.to('/hook')[0]?.body ?? '{}') as { type: string }).type, 'ping');
    fake.failNext = [{ status: 401 }];
    const failed = await w.adminA.post('/api/v1/admin/integrations/test');
    assert.deepEqual(failed.body.test, { ok: false, code: 'http_401' });
    const audits = await db.auditEvent.findMany({
      where: { action: 'integration.test' },
      orderBy: { id: 'asc' },
    });
    assert.deepEqual(
      audits.map((a) => (a.detail as { code: string }).code),
      ['ok', 'http_401'],
    );
  });
});
