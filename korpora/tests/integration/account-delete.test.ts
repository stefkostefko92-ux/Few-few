import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { totpCode } from '../../src/auth/totp.js';
import { CUSTOMER_PASSWORD, prisma, startApp, stopApp } from './harness.js';
import { customer, newProject, sessionCsrf, staff } from './people.js';
import { enable2fa } from './twofa.js';

before(startApp);
after(stopApp);

const exists = async (email: string) =>
  (await prisma.user.findUnique({ where: { email } })) !== null;

test('deleting your own account needs the password and the tick, and removes everything of the person', async () => {
  const b = await customer('gone@example.test');
  const pid = await newProject(b, 'base', 'X');
  const { codes } = await enable2fa(b);
  const user = await prisma.user.findUniqueOrThrow({ where: { email: 'gone@example.test' } });
  assert.ok(await prisma.project.findUnique({ where: { id: pid } }), 'the project exists first');
  const csrf = await sessionCsrf(b, '/account/data');
  const ask = (form: Record<string, string>) =>
    b.post('/account/data/delete', { _csrf: csrf, ...form });

  assert.equal((await ask({ password: CUSTOMER_PASSWORD })).status, 302);
  assert.equal(b.flash(), 'account.delete.confirmMissing', 'no tick, no deletion');
  assert.ok(await exists('gone@example.test'));

  await ask({ password: 'Wrong-Password-000', confirm: 'yes', code: codes[0] ?? '' });
  assert.equal(b.flash(), 'flash.wrongPassword');
  assert.ok(await exists('gone@example.test'), 'wrong password keeps the account');

  await ask({ password: CUSTOMER_PASSWORD, confirm: 'yes', code: '' });
  assert.equal(b.flash(), 'flash.wrongCode', 'with 2FA on, the second factor is needed too');
  assert.ok(await exists('gone@example.test'));
  assert.equal(
    await prisma.recoveryCode.count({ where: { userId: user.id, usedAt: null } }),
    codes.length,
    'a refused attempt spends no recovery code',
  );

  const done = await ask({ password: CUSTOMER_PASSWORD, confirm: 'yes', code: codes[0] ?? '' });
  assert.equal(done.location, '/login');
  assert.equal(await exists('gone@example.test'), false);
  assert.equal(
    await prisma.project.findUnique({ where: { id: pid } }),
    null,
    'the project is gone',
  );
  for (const [what, count] of [
    ['sessions', await prisma.session.count({ where: { userId: user.id } })],
    ['devices', await prisma.device.count({ where: { userId: user.id } })],
    ['recovery codes', await prisma.recoveryCode.count({ where: { userId: user.id } })],
    ['login events', await prisma.loginEvent.count({ where: { userId: user.id } })],
  ] as const)
    assert.equal(count, 0, what);
  assert.equal((await b.get('/app')).status, 302, 'the old session does not open anything');
});

test('a code from the app also confirms the deletion', async () => {
  const b = await customer('gone-totp@example.test');
  const { secret } = await enable2fa(b);
  // the enrolment used this step; the next one is accepted (one step of drift)
  const code = totpCode(secret, Math.floor(Date.now() / 1000) + 30);
  const done = await b.post('/account/data/delete', {
    _csrf: await sessionCsrf(b, '/account/data'),
    password: CUSTOMER_PASSWORD,
    confirm: 'yes',
    code,
  });
  assert.equal(done.location, '/login');
  assert.equal(await exists('gone-totp@example.test'), false);
});

test('the last owner cannot delete the account, however right the password', async () => {
  const owner = await staff('OWNER', 'only-owner@example.test');
  const reply = await owner.browser.post('/account/data/delete', {
    _csrf: await sessionCsrf(owner.browser, '/account/data'),
    password: 'Oak-Router-Plane-37',
    confirm: 'yes',
    code: totpCode(owner.secret, Math.floor(Date.now() / 1000) + 30),
  });
  assert.equal(reply.status, 302);
  assert.equal(owner.browser.flash(), 'account.delete.lastOwner');
  assert.ok(await exists('only-owner@example.test'));
  assert.equal(await prisma.user.count({ where: { role: 'OWNER' } }), 1);
});
