import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { db, makeUser, resetDb, signIn, startApp, type Harness } from './helpers.js';
import { MODEL, seedWorld, type World } from './world.js';

/**
 * Списъците за административната конзола: продукти, табла, кодове, фирми (само четене, по клиент и
 * по роля), филтрите на одита (добавят се към ограничението на ролята) и малките полета, от които
 * UI има нужда (`uploadedByMe`, `capabilities`).
 */

let h: Harness;
let w: World;

before(async () => {
  h = await startApp();
});
after(async () => {
  await h.close();
  await db.$disconnect();
});
beforeEach(async () => {
  await resetDb();
  w = await seedWorld(h);
});

describe('Списъци: продукти, табла, кодове', () => {
  test('продуктите и таблата — само за kb:manage, само своя клиент', async () => {
    const products = await w.ownerA1.get('/api/v1/admin/products');
    assert.equal(products.status, 200);
    const models = products.body.products.map((p: { model: string }) => p.model).sort();
    assert.deepEqual(models, ['LTX-500', 'LTX-900', 'ZZ-100']);
    const ltx = products.body.products.find((p: { model: string }) => p.model === MODEL);
    assert.equal(ltx.revisions.length, 2);

    const devices = await w.ownerA1.get('/api/v1/admin/devices');
    assert.equal(devices.status, 200);
    const serials = devices.body.devices.map((d: { serial: string }) => d.serial);
    assert.ok(serials.includes('SN-ALFA-1'));
    assert.ok(!serials.includes('SN-B-1'), 'таблата на другия клиент не се виждат');
    assert.equal(devices.body.next, null);
    assert.equal(JSON.stringify(devices.body).includes('qrTokenHash'), false);

    for (const c of [w.tenantAdmin, w.support, w.portalAlfa]) {
      assert.equal((await c.get('/api/v1/admin/products')).status, 403);
      assert.equal((await c.get('/api/v1/admin/devices')).status, 403);
      assert.equal((await c.get('/api/v1/admin/errors')).status, 403);
    }
  });

  test('таблата: търсене и курсор', async () => {
    const found = await w.ownerA1.get('/api/v1/admin/devices?q=beta');
    assert.deepEqual(
      found.body.devices.map((d: { serial: string }) => d.serial),
      ['SN-BETA-1'],
    );
    const first = await w.ownerA1.get('/api/v1/admin/devices?limit=2');
    assert.equal(first.body.devices.length, 2);
    assert.ok(first.body.next);
    const second = await w.ownerA1.get(`/api/v1/admin/devices?limit=50&cursor=${first.body.next}`);
    const all = [...first.body.devices, ...second.body.devices].map(
      (d: { serial: string }) => d.serial,
    );
    assert.equal(new Set(all).size, all.length);
    assert.equal(all.length, 5);
    assert.equal((await w.ownerA1.get('/api/v1/admin/devices?foo=1')).status, 400);
  });

  test('новият QR етикет се отразява в hasQr', async () => {
    const before_ = await w.ownerA1.get('/api/v1/admin/devices?q=SN-ALFA-1');
    assert.equal(before_.body.devices[0].hasQr, false);
    assert.equal((await w.ownerA1.post('/api/v1/admin/devices/SN-ALFA-1/qr')).status, 200);
    const after_ = await w.ownerA1.get('/api/v1/admin/devices?q=SN-ALFA-1');
    assert.equal(after_.body.devices[0].hasQr, true);
  });

  test('кодовете: филтър по статус, преглед на един код, чужд клиент = 404', async () => {
    const all = await w.ownerA1.get('/api/v1/admin/errors?q=e37');
    assert.equal(all.status, 200);
    assert.ok(all.body.errors.length >= 2);
    assert.ok(all.body.errors.every((e: { code: string }) => e.code === 'E37'));
    const drafts = await w.ownerA1.get('/api/v1/admin/errors?status=DRAFT');
    assert.deepEqual(drafts.body.errors, []);
    const one = all.body.errors[0];
    const detail = await w.ownerA1.get(`/api/v1/admin/errors/${one.id}`);
    assert.equal(detail.status, 200);
    assert.ok(Array.isArray(detail.body.relations));
    assert.equal((await w.ownerB.get(`/api/v1/admin/errors/${one.id}`)).status, 404);
    assert.equal((await w.ownerA1.get('/api/v1/admin/errors?status=NOPE')).status, 400);
  });

  test('фирмите: kb:manage и users:manage, не и останалите; само своя клиент', async () => {
    const own = await w.tenantAdmin.get('/api/v1/admin/companies');
    assert.equal(own.status, 200);
    assert.deepEqual(
      own.body.companies.map((c: { name: string }) => c.name),
      ['Alfa Srl', 'Beta Srl'],
    );
    assert.equal((await w.ownerA1.get('/api/v1/admin/companies')).status, 200);
    assert.equal((await w.support.get('/api/v1/admin/companies')).status, 403);
    assert.equal((await w.portalAlfa.get('/api/v1/admin/companies')).status, 403);
    assert.deepEqual((await w.ownerB.get('/api/v1/admin/companies')).body.companies, []);
  });
});

describe('Документи и сесия: полета за UI', () => {
  test('uploadedByMe — само за качилия', async () => {
    const mine = await w.ownerA1.get('/api/v1/admin/documents');
    const doc = mine.body.documents.find((d: { code: string }) => d.code === 'PROC-DOOR-001');
    assert.equal(doc.uploadedByMe, true);
    const theirs = await w.ownerA2.get('/api/v1/admin/documents');
    const same = theirs.body.documents.find((d: { code: string }) => d.code === 'PROC-DOOR-001');
    assert.equal(same.uploadedByMe, false);
  });

  test('/auth/me носи способностите на ролята', async () => {
    const admin = await w.tenantAdmin.get('/api/v1/auth/me');
    assert.ok(admin.body.capabilities.includes('users:manage'));
    assert.ok(admin.body.capabilities.includes('audit:read'));
    assert.ok(!admin.body.capabilities.includes('kb:manage'));
    const owner = await w.ownerA1.get('/api/v1/auth/me');
    assert.ok(owner.body.capabilities.includes('kb:manage'));
    const portal = await w.portalAlfa.get('/api/v1/auth/me');
    assert.ok(!portal.body.capabilities.includes('users:manage'));
  });
});

describe('Одит: филтри', () => {
  test('действие, обект и дата стесняват резултата; невалидно поле = 400', async () => {
    await w.ownerA1.post('/api/v1/admin/devices/SN-ALFA-1/qr');
    const kb = await w.tenantAdmin.get('/api/v1/audit?action=kb.document.');
    assert.equal(kb.status, 200);
    assert.ok(kb.body.events.length > 0);
    assert.ok(kb.body.events.every((e: { action: string }) => e.action.startsWith('kb.document.')));
    const qr = await w.tenantAdmin.get('/api/v1/audit?action=catalog.device.qr&objectType=device');
    assert.equal(qr.body.events.length, 1);
    const future = new Date(Date.now() + 3600_000).toISOString();
    const none = await w.tenantAdmin.get(`/api/v1/audit?from=${encodeURIComponent(future)}`);
    assert.deepEqual(none.body.events, []);
    assert.equal((await w.tenantAdmin.get('/api/v1/audit?from=вчера')).status, 400);
    assert.equal((await w.tenantAdmin.get('/api/v1/audit?tenantId=x')).status, 400);
  });

  test('филтърът не отваря входовете за администратора на клиента', async () => {
    const login = await w.tenantAdmin.get('/api/v1/audit?action=auth.');
    assert.equal(login.status, 200);
    assert.deepEqual(login.body.events, []);
    const platform = await makeUser({ tenantId: w.tenantA.id, role: 'PLATFORM_ADMIN' });
    const pa = await signIn(h, platform);
    await db.auditEvent.create({
      data: { tenantId: w.tenantA.id, action: 'auth.login', prevHash: 'x', hash: 'h-login-test' },
    });
    const seen = await pa.get('/api/v1/audit?action=auth.login');
    assert.ok(seen.body.events.some((e: { hash: string }) => e.hash === 'h-login-test'));
  });

  test('платформеният администратор вижда само одита на своя клиент', async () => {
    const platform = await makeUser({ tenantId: w.tenantA.id, role: 'PLATFORM_ADMIN' });
    const pa = await signIn(h, platform);
    await db.auditEvent.create({
      data: { tenantId: w.tenantB.id, action: 'auth.login', prevHash: 'y', hash: 'h-other-tenant' },
    });
    const all = await pa.get('/api/v1/audit');
    assert.equal(all.status, 200);
    assert.ok(all.body.events.length > 0);
    assert.ok(all.body.events.every((e: { tenantId: string }) => e.tenantId === w.tenantA.id));
  });
});
