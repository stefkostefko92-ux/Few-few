import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { SESSION_LIMITS } from '../../src/auth/sessions.js';
import { Browser, CUSTOMER_PASSWORD, prisma, startApp, stopApp } from './harness.js';
import { customer, staff } from './people.js';
import { enable2fa } from './twofa.js';

before(startApp);
after(stopApp);

const MINUTE = 60_000;

async function userId(email: string): Promise<string> {
  return (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
}

test('a customer session idle past its expiry is signed out and its row is gone', async () => {
  const b = await customer('idle-customer@example.test');
  const id = await userId('idle-customer@example.test');
  assert.equal((await b.get('/app')).status, 200, 'the session works before it expires');
  await prisma.session.updateMany({
    where: { userId: id },
    data: { expiresAt: new Date(Date.now() - MINUTE) },
  });
  const after = await b.get('/app');
  assert.equal(after.status, 302);
  assert.match(after.location, /^\/login/);
  assert.equal(await prisma.session.count({ where: { userId: id } }), 0, 'the row is deleted');
});

test('a customer session older than the absolute ceiling ends even if it was kept alive', async () => {
  const b = await customer('ceiling-customer@example.test');
  const id = await userId('ceiling-customer@example.test');
  const { absoluteMs } = SESSION_LIMITS.customer;
  // just inside the ceiling: still valid, however recently it was used
  await prisma.session.updateMany({
    where: { userId: id },
    data: { createdAt: new Date(Date.now() - (absoluteMs - MINUTE)) },
  });
  assert.equal((await b.get('/app')).status, 200, 'inside the ceiling');
  await prisma.session.updateMany({
    where: { userId: id },
    data: {
      createdAt: new Date(Date.now() - (absoluteMs + MINUTE)),
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
    },
  });
  const after = await b.get('/app');
  assert.equal(after.status, 302);
  assert.match(after.location, /^\/login/);
  assert.equal(await prisma.session.count({ where: { userId: id } }), 0);
});

test('a team session ends at its own, shorter limits: idle and absolute', async () => {
  const idle = await staff('SUPPORT', 'idle-staff@example.test');
  assert.equal((await idle.browser.get('/admin')).status, 200, 'the session works before');
  await prisma.session.updateMany({
    where: { userId: idle.id },
    data: { expiresAt: new Date(Date.now() - MINUTE) },
  });
  const idleAfter = await idle.browser.get('/admin');
  assert.equal(idleAfter.status, 302);
  assert.match(idleAfter.location, /^\/login/);
  assert.equal(await prisma.session.count({ where: { userId: idle.id } }), 0);

  const old = await staff('SUPPORT', 'ceiling-staff@example.test');
  const { absoluteMs } = SESSION_LIMITS.staff;
  assert.ok(absoluteMs < SESSION_LIMITS.customer.absoluteMs, 'the team ceiling is the shorter one');
  await prisma.session.updateMany({
    where: { userId: old.id },
    data: {
      createdAt: new Date(Date.now() - (absoluteMs + MINUTE)),
      expiresAt: new Date(Date.now() + SESSION_LIMITS.staff.idleMs),
    },
  });
  const oldAfter = await old.browser.get('/admin');
  assert.equal(oldAfter.status, 302);
  assert.match(oldAfter.location, /^\/login/);
  assert.equal(await prisma.session.count({ where: { userId: old.id } }), 0);
});

test('a half-open 2FA session lives minutes, not days, and does not slide while waiting', async () => {
  const b = await customer('pending-2fa@example.test');
  await enable2fa(b);
  const id = await userId('pending-2fa@example.test');
  await prisma.session.deleteMany({ where: { userId: id } });

  const c = new Browser();
  const login = await c.login('pending-2fa@example.test', CUSTOMER_PASSWORD);
  assert.match(login.location, /^\/login\/2fa/);
  const half = await prisma.session.findFirstOrThrow({ where: { userId: id } });
  assert.equal(half.mfaPassed, false);
  assert.ok(
    half.expiresAt.getTime() <= Date.now() + 10 * MINUTE,
    'the code has to be entered within ten minutes',
  );

  // a visit one minute+ later does not push the end of a session that has not passed the second factor
  await prisma.session.update({
    where: { id: half.id },
    data: { lastSeenAt: new Date(Date.now() - 5 * MINUTE) },
  });
  assert.equal((await c.get(login.location)).status, 200);
  const waited = await prisma.session.findUniqueOrThrow({ where: { id: half.id } });
  assert.equal(waited.expiresAt.getTime(), half.expiresAt.getTime(), 'no sliding before the code');

  await prisma.session.update({
    where: { id: half.id },
    data: { expiresAt: new Date(Date.now() - MINUTE) },
  });
  const late = await c.get('/login/2fa');
  assert.equal(late.status, 302);
  assert.equal(late.location, '/login', 'the code window is over: back to the password');
  assert.equal(await prisma.session.count({ where: { id: half.id } }), 0);
});
