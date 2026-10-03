import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { totpCode } from '../../src/auth/totp.js';
import {
  Browser,
  customer,
  enable2fa,
  mailTo,
  prisma,
  sessionCsrf,
  staff,
  startApp,
  stopApp,
} from './harness.js';

before(startApp);
after(stopApp);

const DAY = 24 * 60 * 60 * 1000;

test('a weak password at sign-up gets the same answer for a free and for a taken email', async () => {
  await customer('taken@example.test');
  const taken = await new Browser().register('Нов Човек', 'taken@example.test', 'abc');
  const free = await new Browser().register('Нов Човек', 'free-weak@example.test', 'abc');
  assert.equal(taken.status, 400);
  assert.equal(free.status, taken.status);
  const error = (body: string) =>
    /id="form-error"[\s\S]*?<span>([\s\S]*?)<\/span>/.exec(body)?.[1]?.trim();
  assert.ok(error(taken.body), 'the password problem is shown');
  assert.equal(error(taken.body), error(free.body));
});

test('the panel cannot turn a confirmed email back into unconfirmed, and the purge keeps real accounts', async () => {
  const { runMaintenance } = await import('../../src/services/maintenance.js');
  await customer('keep-me@example.test');
  const target = await prisma.user.findUniqueOrThrow({ where: { email: 'keep-me@example.test' } });
  const manager = await staff('MANAGER', 'manager@example.test');
  const csrf = await sessionCsrf(manager.browser, `/admin/accounts/${target.id}`);
  const saved = await manager.browser.post(`/admin/accounts/${target.id}/edit`, {
    _csrf: csrf,
    name: target.name,
    email: target.email,
    locale: 'bg',
  });
  assert.equal(saved.status, 302);
  const after = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
  assert.ok(after.emailVerifiedAt, 'still confirmed');

  // an old account that somehow lost the flag but has a plan and sign-ins is never purged
  const old = new Date(Date.now() - 10 * DAY);
  await prisma.user.update({
    where: { id: target.id },
    data: { emailVerifiedAt: null, createdAt: old },
  });
  // a sign-up that was never confirmed is purged after 7 days
  await new Browser().register('Забравен', 'never-confirmed@example.test', 'Shelf-Hinge-Groove-42');
  await prisma.user.update({
    where: { email: 'never-confirmed@example.test' },
    data: { createdAt: old },
  });
  await runMaintenance();
  assert.ok(await prisma.user.findUnique({ where: { id: target.id } }), 'kept');
  assert.equal(
    await prisma.user.findUnique({ where: { email: 'never-confirmed@example.test' } }),
    null,
    'purged',
  );
});

test('wrong passwords sent at the same moment still lock the account after five', async () => {
  await customer('parallel@example.test');
  const tries = await Promise.all(
    Array.from({ length: 8 }, () => new Browser().login('parallel@example.test', 'not-the-pass-1')),
  );
  assert.ok(tries.every((r) => r.status === 401));
  const user = await prisma.user.findUniqueOrThrow({ where: { email: 'parallel@example.test' } });
  assert.ok(user.lockedUntil && user.lockedUntil > new Date(), 'locked');
  const right = await new Browser().login('parallel@example.test', 'Shelf-Hinge-Groove-42');
  assert.equal(right.status, 401, 'even the right password waits for the lock to pass');
});

test('wrong codes count for the account: new sign-ins with the password give no new tries', async () => {
  const owner = await customer('codes@example.test');
  const { secret } = await enable2fa(owner);
  for (let i = 0; i < 5; i++) {
    const b = new Browser();
    const login = await b.login('codes@example.test', 'Shelf-Hinge-Groove-42');
    assert.match(login.location, /^\/login\/2fa/, `attempt ${i + 1} reaches the code step`);
    const page = await b.get(login.location);
    await b.post('/login/2fa', { _csrf: Browser.csrf(page.body), next: '/app', code: '000000' });
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { email: 'codes@example.test' } });
  assert.ok(user.lockedUntil && user.lockedUntil > new Date(), 'locked after five wrong codes');
  assert.match((await mailTo('codes@example.test', /Грешни кодове/)).text, /сменете я веднага/);

  const late = new Browser();
  const login = await late.login('codes@example.test', 'Shelf-Hinge-Groove-42');
  assert.equal(login.status, 401, 'the password alone does not open a new round');
  assert.ok(secret.length >= 32);
});

test('one authenticator step is accepted once, even when sent twice at the same moment', async () => {
  const { claimTotpStep } = await import('../../src/services/auth-common.js');
  await customer('step@example.test');
  const { id } = await prisma.user.findUniqueOrThrow({ where: { email: 'step@example.test' } });
  const both = await Promise.all([claimTotpStep(id, 1000), claimTotpStep(id, 1000)]);
  assert.deepEqual(both.sort(), [false, true]);
  assert.equal(await claimTotpStep(id, 999), false, 'an older step is refused');
  assert.equal(await claimTotpStep(id, 1001), true);
  assert.ok(totpCode('JBSWY3DPEHPK3PXP', 0).length === 6);
});

test('the team downloads only projects of people below them', async () => {
  const top = await staff('OWNER', 'top@example.test');
  const support = await staff('SUPPORT', 'support@example.test');
  const created = await top.browser.post('/app/projects', {
    _csrf: await sessionCsrf(top.browser, '/app'),
    type: 'base',
    name: 'Проект на собственика',
  });
  const ownerProject = /\/app\/p\/([a-z0-9]+)/.exec(created.location)?.[1] ?? '';
  assert.ok(ownerProject, 'the owner made a project');
  assert.equal(
    (await support.browser.get(`/admin/projects/${ownerProject}/export`)).status,
    403,
    'support cannot take the owner’s project',
  );

  const client = await customer('client-project@example.test');
  const made = await client.post('/app/projects', {
    _csrf: await sessionCsrf(client, '/app'),
    type: 'base',
    name: 'Кухня',
  });
  const clientProject = /\/app\/p\/([a-z0-9]+)/.exec(made.location)?.[1] ?? '';
  assert.equal((await support.browser.get(`/admin/projects/${clientProject}/export`)).status, 200);
});
