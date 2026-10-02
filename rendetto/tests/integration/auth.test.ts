import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Browser,
  customer,
  expectedCountry,
  linkIn,
  mailTo,
  prisma,
  startApp,
  stopApp,
} from './harness.js';

before(startApp);
after(stopApp);

const DAY = 86_400_000;

test('sign-up → email confirmation → a 30-day trial that starts at the confirmation', async () => {
  const b = new Browser('8.8.8.8');
  const reply = await b.register('Иван Петров', 'ivan@example.test', 'Shelf-Hinge-Groove-42');
  assert.equal(reply.status, 200);
  assert.match(reply.body, /Проверете пощата си/);
  const before = await prisma.user.findUniqueOrThrow({ where: { email: 'ivan@example.test' } });
  assert.equal(before.emailVerifiedAt, null);
  assert.equal(before.planExpiresAt, null, 'the trial does not run before the confirmation');
  assert.equal(before.signupIp, '8.8.8.8');
  assert.equal(before.signupCountry, expectedCountry());
  assert.ok(
    before.signupDeviceHash && before.signupFingerprint,
    'device cookie hash and HWID stored at sign-up',
  );
  assert.notEqual(before.passwordHash, 'Shelf-Hinge-Groove-42');
  assert.match(before.passwordHash, /^\$argon2id\$/);

  const verified = await b.get(
    linkIn((await mailTo('ivan@example.test', /Потвърдете/)).text, '/verify-email?token='),
  );
  assert.equal(verified.status, 200);
  const after = await prisma.user.findUniqueOrThrow({ where: { email: 'ivan@example.test' } });
  assert.equal(after.plan, 'TRIAL');
  assert.ok(after.emailVerifiedAt && after.planExpiresAt);
  const days = (after.planExpiresAt.getTime() - after.emailVerifiedAt.getTime()) / DAY;
  assert.ok(Math.abs(days - 30) < 0.01, `trial of ${days} days`);
});

test('a confirmation link works once', async () => {
  const b = new Browser();
  await b.register('Мария', 'maria@example.test', 'Shelf-Hinge-Groove-42');
  const link = linkIn(
    (await mailTo('maria@example.test', /Потвърдете/)).text,
    '/verify-email?token=',
  );
  assert.equal((await b.get(link)).status, 200);
  assert.equal((await b.get(link)).status, 400);
});

test('signing in records IP, country, device and HWID', async () => {
  const b = await customer('records@example.test', undefined, '8.8.8.8');
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: 'records@example.test' },
    include: { devices: true, logins: true },
  });
  assert.equal(user.lastLoginIp, '8.8.8.8');
  assert.equal(user.lastLoginCountry, expectedCountry());
  assert.equal(user.devices.length, 1);
  assert.ok(user.devices[0]?.fingerprintHash);
  assert.match(user.devices[0]?.summary ?? '', /Windows/);
  assert.ok(
    user.logins.some(
      (l) =>
        l.outcome === 'SUCCESS' &&
        l.ip === '8.8.8.8' &&
        l.country === expectedCountry() &&
        l.fingerprintHash,
    ),
  );
  const projects = await b.get('/app');
  assert.equal(projects.status, 200);
  assert.match(projects.body, /Тест: 30 дни/);
});

test('the same answer for a new and an existing email (no account enumeration)', async () => {
  await customer('taken@example.test');
  const fresh = await new Browser().register(
    'Някой',
    'nobody-yet@example.test',
    'Shelf-Hinge-Groove-42',
  );
  const taken = await new Browser().register(
    'Някой',
    'taken@example.test',
    'Shelf-Hinge-Groove-42',
  );
  assert.equal(fresh.status, taken.status);
  assert.equal(
    fresh.body.replace('nobody-yet@example.test', 'X'),
    taken.body.replace('taken@example.test', 'X'),
  );
  assert.match(
    (await mailTo('taken@example.test', /Вече имате акаунт/)).subject,
    /Вече имате акаунт/,
  );
  const wrongPassword = await new Browser().login('taken@example.test', 'Wrong-Password-000');
  const unknownEmail = await new Browser().login(
    'nobody-at-all@example.test',
    'Wrong-Password-000',
  );
  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownEmail.status, 401);
  assert.match(wrongPassword.body, /Грешен имейл или парола/);
  assert.match(unknownEmail.body, /Грешен имейл или парола/);
});

test('five wrong passwords lock the account; the right one does not get in while locked', async () => {
  await customer('lock@example.test');
  const b = new Browser('9.9.9.9');
  for (let i = 0; i < 5; i++)
    assert.equal((await b.login('lock@example.test', `Wrong-Password-${i}00`)).status, 401);
  const user = await prisma.user.findUniqueOrThrow({ where: { email: 'lock@example.test' } });
  assert.ok(
    user.lockedUntil && user.lockedUntil.getTime() > Date.now() + 14 * 60_000,
    'locked for about 15 minutes',
  );
  const right = await b.login('lock@example.test', 'Shelf-Hinge-Groove-42');
  assert.equal(right.status, 401, 'a locked account answers like a wrong password');
  await prisma.user.update({
    where: { id: user.id },
    data: { lockedUntil: new Date(Date.now() - 1000) },
  });
  assert.equal((await b.login('lock@example.test', 'Shelf-Hinge-Groove-42')).status, 302);
});

test('weak passwords are refused at sign-up', async () => {
  for (const password of ['short', 'Rendetto2026!', 'aaaaaaaaaaaaaaaa', 'weak-ivanov-123']) {
    const reply = await new Browser().register('Иван', 'ivanov@example.test', password);
    assert.equal(reply.status, 400, password);
  }
  assert.equal(await prisma.user.count({ where: { email: 'ivanov@example.test' } }), 0);
});

test('password reset: one-time link, all sessions end, the new password works', async () => {
  const signedIn = await customer('reset@example.test');
  const anon = new Browser();
  const sent = await anon.submit('/forgot', '/forgot', { email: 'reset@example.test' });
  assert.equal(sent.status, 200);
  const link = linkIn((await mailTo('reset@example.test', /Нова парола/)).text, '/reset?token=');
  const page = await anon.get(link);
  assert.equal(page.status, 200);
  const token = new URL(`http://x${link}`).searchParams.get('token') ?? '';
  const done = await anon.post('/reset', {
    _csrf: Browser.csrf(page.body),
    token,
    password: 'New-Oak-Plank-2026x',
  });
  assert.equal(done.status, 302);
  assert.equal((await signedIn.get('/app')).status, 302, 'old session ended');
  assert.equal((await anon.get(link)).status, 400, 'link used up');
  assert.equal(
    (await new Browser().login('reset@example.test', 'New-Oak-Plank-2026x')).status,
    302,
  );
  assert.equal(
    (await new Browser().login('reset@example.test', 'Shelf-Hinge-Groove-42')).status,
    401,
  );
});

test('pages after sign-in are never cached and redirect when signed out', async () => {
  const b = await customer('cache@example.test');
  const page = await b.get('/account');
  assert.equal(page.headers.get('cache-control'), 'no-store');
  const anon = await new Browser().get('/account');
  assert.equal(anon.status, 302);
  assert.match(anon.location, /^\/login\?next=%2Faccount/);
});
