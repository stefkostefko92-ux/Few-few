import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { Browser, prisma, STAFF_PASSWORD, startApp, stopApp } from './harness.js';
import { customer, newProject, sessionCsrf, staff } from './people.js';

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
  const onOwner = await admin.browser.post(`/admin/accounts/${owner.id}/ban`, {
    _csrf: aCsrf,
    reason: 'опит срещу собственика',
  });
  assert.equal(onOwner.status, 302);
  assert.equal(admin.browser.flash(), 'admin.errors.rank', 'refused for the rank, not the form');
  assert.equal(
    (await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).bannedAt,
    null,
    'an admin cannot ban the owner',
  );
  // the same request against a lower rank goes through: the refusal above is the rank check
  const onSupport = await admin.browser.post(`/admin/accounts/${support.id}/ban`, {
    _csrf: aCsrf,
    reason: 'опит срещу поддръжката',
  });
  assert.equal(onSupport.status, 302);
  assert.equal(admin.browser.flash(), 'flash.banned');
  assert.ok((await prisma.user.findUniqueOrThrow({ where: { id: support.id } })).bannedAt);

  await admin.browser.post(`/admin/accounts/${admin.id}/role`, { _csrf: aCsrf, role: 'OWNER' });
  assert.equal(admin.browser.flash(), 'admin.errors.self');
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
      passwordHash: await hashPassword(STAFF_PASSWORD),
      emailVerifiedAt: new Date(),
      plan: 'LIFETIME',
    },
  });
  const b = new Browser();
  assert.equal((await b.login('no2fa@example.test', STAFF_PASSWORD)).status, 302);
  const admin = await b.get('/admin');
  assert.equal(admin.status, 302);
  assert.equal(admin.location, '/account/security');
});

test('a project export by the team is recorded in the audit log', async () => {
  const support = await staff('SUPPORT', 'support3@example.test');
  const c = await customer('exported@example.test');
  const projectId = await newProject(c);
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

test('nobody creates or promotes an account to their own rank or above', async () => {
  const admin = await staff('ADMIN', 'admin3@example.test');
  const manager = await staff('MANAGER', 'manager3@example.test');
  const viewer = await staff('VIEWER', 'viewer3@example.test');
  const audited = (action: string) => prisma.auditLog.count({ where: { action } });
  const [createdBefore, rolesBefore] = [
    await audited('admin.account.created'),
    await audited('admin.role.changed'),
  ];
  const create = async (who: Browser, role: string, email: string) =>
    who.post('/admin/accounts-new', {
      _csrf: await sessionCsrf(who, '/admin'),
      name: 'Нов Служител',
      email,
      role,
      plan: 'TRIAL',
      password: 'Drawer-Slide-Cup-35',
    });
  for (const role of ['OWNER', 'ADMIN']) {
    const email = `made-${role.toLowerCase()}@example.test`;
    const reply = await create(admin.browser, role, email);
    assert.equal(reply.status, 302, role);
    assert.equal(admin.browser.flash(), 'admin.errors.rank', role);
    assert.equal(await prisma.user.count({ where: { email } }), 0, `an ADMIN made an ${role}`);
  }
  for (const [who, role] of [
    [manager, 'SUPPORT'],
    [viewer, 'CUSTOMER'],
  ] as const) {
    const email = `by-${who.actor.role.toLowerCase()}@example.test`;
    assert.equal((await create(who.browser, role, email)).status, 403, who.actor.role);
    assert.equal(await prisma.user.count({ where: { email } }), 0);
  }
  assert.equal(await audited('admin.account.created'), createdBefore);

  const made = await create(admin.browser, 'SUPPORT', 'made-support@example.test');
  assert.equal(admin.browser.flash(), 'flash.accountCreated', `below the rank: ${made.location}`);
  const support = await prisma.user.findUniqueOrThrow({
    where: { email: 'made-support@example.test' },
  });
  const csrf = await sessionCsrf(admin.browser, `/admin/accounts/${support.id}`);
  for (const role of ['OWNER', 'ADMIN']) {
    await admin.browser.post(`/admin/accounts/${support.id}/role`, { _csrf: csrf, role });
    assert.equal(admin.browser.flash(), 'admin.errors.rank', role);
  }
  assert.equal(
    (await prisma.user.findUniqueOrThrow({ where: { id: support.id } })).role,
    'SUPPORT',
  );
  assert.equal(await audited('admin.role.changed'), rolesBefore);
});

test('a staff form without the token or from a foreign origin changes nothing', async () => {
  const owner = await staff('OWNER', 'owner4@example.test');
  await customer('csrf-target@example.test');
  const id = await idOf('csrf-target@example.test');
  const csrf = await sessionCsrf(owner.browser, `/admin/accounts/${id}`);
  const ban = (form: Record<string, string>, headers?: Record<string, string>) =>
    owner.browser.post(`/admin/accounts/${id}/ban`, { reason: 'без токен', ...form }, headers);
  assert.equal((await ban({})).status, 403);
  assert.equal((await ban({ _csrf: 'x'.repeat(43) })).status, 403);
  assert.equal((await ban({ _csrf: csrf }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id } })).bannedAt, null);
  assert.equal(
    await prisma.auditLog.count({ where: { action: 'admin.account.banned', targetId: id } }),
    0,
  );
});
