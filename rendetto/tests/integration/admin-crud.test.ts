import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { Browser, customer, prisma, sessionCsrf, staff, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

async function idOf(email: string): Promise<string> {
  return (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
}

test('owner CRUD: create, edit, change role, delete with the email typed in', async () => {
  const owner = await staff('OWNER', 'owner1@example.test');
  let csrf = await sessionCsrf(owner.browser, '/admin/accounts-new');
  const created = await owner.browser.post('/admin/accounts-new', {
    _csrf: csrf,
    name: 'Нов Клиент',
    email: 'crud@example.test',
    role: 'CUSTOMER',
    locale: 'it',
    plan: 'PREMIUM',
    months: '3',
    password: 'Drawer-Slide-Cup-35',
  });
  assert.equal(created.status, 302);
  const id = await idOf('crud@example.test');
  assert.equal((await new Browser().login('crud@example.test', 'Drawer-Slide-Cup-35')).status, 302);

  csrf = await sessionCsrf(owner.browser, `/admin/accounts/${id}`);
  await owner.browser.post(`/admin/accounts/${id}/edit`, {
    _csrf: csrf,
    name: 'Нов Клиент 2',
    email: 'crud2@example.test',
    locale: 'en',
    emailVerified: 'yes',
  });
  let user = await prisma.user.findUniqueOrThrow({ where: { id } });
  assert.deepEqual(
    [user.name, user.email, user.locale],
    ['Нов Клиент 2', 'crud2@example.test', 'en'],
  );

  await owner.browser.post(`/admin/accounts/${id}/role`, { _csrf: csrf, role: 'SUPPORT' });
  user = await prisma.user.findUniqueOrThrow({ where: { id } });
  assert.equal(user.role, 'SUPPORT');

  const wrongConfirm = await owner.browser.post(`/admin/accounts/${id}/delete`, {
    _csrf: csrf,
    confirmEmail: 'someone@example.test',
  });
  assert.equal(wrongConfirm.status, 302);
  assert.ok(await prisma.user.findUnique({ where: { id } }), 'not deleted without the right email');
  await owner.browser.post(`/admin/accounts/${id}/delete`, {
    _csrf: csrf,
    confirmEmail: 'crud2@example.test',
  });
  assert.equal(await prisma.user.findUnique({ where: { id } }), null);
  const log = await prisma.auditLog.findFirstOrThrow({
    where: { action: 'admin.account.deleted', targetId: id },
  });
  assert.doesNotMatch(
    JSON.stringify(log),
    /crud2@example\.test/,
    'the audit keeps a hash, not the email',
  );
});

test('roles are enforced on every action, not only on the pages', async () => {
  const viewer = await staff('VIEWER', 'viewer1@example.test');
  const support = await staff('SUPPORT', 'support2@example.test');
  const admin = await staff('ADMIN', 'admin2@example.test');
  const owner = await staff('OWNER', 'owner2@example.test');
  await customer('target@example.test');
  const id = await idOf('target@example.test');

  const vCsrf = await sessionCsrf(viewer.browser, `/admin/accounts/${id}`);
  assert.equal(
    (
      await viewer.browser.post(`/admin/accounts/${id}/ban`, {
        _csrf: vCsrf,
        reason: 'опит от наблюдател',
      })
    ).status,
    403,
  );
  const sCsrf = await sessionCsrf(support.browser, `/admin/accounts/${id}`);
  assert.equal(
    (await support.browser.post(`/admin/accounts/${id}/plan`, { _csrf: sCsrf, plan: 'LIFETIME' }))
      .status,
    403,
  );
  assert.equal(
    (
      await support.browser.post(`/admin/accounts/${id}/delete`, {
        _csrf: sCsrf,
        confirmEmail: 'target@example.test',
      })
    ).status,
    403,
  );
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id } })).plan, 'TRIAL');

  const aCsrf = await sessionCsrf(admin.browser, `/admin/accounts/${owner.id}`);
  await admin.browser.post(`/admin/accounts/${owner.id}/ban`, {
    _csrf: aCsrf,
    reason: 'опит срещу собственика',
  });
  assert.equal(
    (await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).bannedAt,
    null,
    'an admin cannot ban the owner',
  );
  await admin.browser.post(`/admin/accounts/${admin.id}/role`, { _csrf: aCsrf, role: 'OWNER' });
  assert.equal(
    (await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).role,
    'ADMIN',
    'no self-promotion',
  );

  const plain = await customer('plain@example.test');
  assert.equal((await plain.get('/admin')).status, 403);
  assert.equal((await plain.get(`/admin/accounts/${id}`)).status, 403);
});

test('a team member without 2FA cannot open the admin panel', async () => {
  const { hashPassword } = await import('../../src/auth/password.js');
  await prisma.user.create({
    data: {
      email: 'no2fa@example.test',
      name: 'Без 2FA',
      role: 'ADMIN',
      passwordHash: await hashPassword('Oak-Router-Plane-37'),
      emailVerifiedAt: new Date(),
      plan: 'LIFETIME',
    },
  });
  const b = new Browser();
  assert.equal((await b.login('no2fa@example.test', 'Oak-Router-Plane-37')).status, 302);
  const admin = await b.get('/admin');
  assert.equal(admin.status, 302);
  assert.equal(admin.location, '/account/security');
});

test('a project export by the team is recorded in the audit log', async () => {
  const support = await staff('SUPPORT', 'support3@example.test');
  const c = await customer('exported@example.test');
  const csrf = await sessionCsrf(c, '/app');
  const created = await c.post('/app/projects', { _csrf: csrf, type: 'base', name: 'Шкаф' });
  const projectId = created.location.split('/').pop() ?? '';
  const zip = await support.browser.get(`/admin/projects/${projectId}/export`);
  assert.equal(zip.status, 200);
  assert.equal(zip.headers.get('content-type'), 'application/zip');
  assert.equal(
    await prisma.auditLog.count({
      where: { action: 'admin.project.exported', targetId: projectId },
    }),
    1,
  );
});
