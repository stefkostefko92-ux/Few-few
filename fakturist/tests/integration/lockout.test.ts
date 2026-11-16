import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { prepareTestDatabase, truncateAll } from './harness.js';
import { startHttp, type HttpClient } from './http.js';

prepareTestDatabase();
delete process.env['SMTP_HOST'];
const { prisma } = await import('../../src/db.js');
const { register } = await import('../../src/accounts/register.js');
const { seedPlans } = await import('../../src/billing/seed-plans.js');
const { createServer } = await import('../../src/server.js');
const lockout = await import('../../src/auth/lockout.js');
const { MINUTE, HOUR } = await import('../../src/time.js');

/** SPEC 46: заключване след 5 грешни пароли, по-дълго всеки път; успешен вход нулира. */
const PASSWORD = 'дълга-и-трудна-парола-2026';
let http: HttpClient;
let userId = '';

before(async () => {
  await truncateAll(prisma);
  await prisma.$transaction((tx) => seedPlans(tx));
  ({ userId } = await register({
    kind: 'company',
    name: 'Иван Петров',
    email: 'owner@example.test',
    password: PASSWORD,
    acceptTerms: 'on',
    legalName: 'Пекарна Зора ЕООД',
    eik: '131063188',
    addressStreet: 'ул. „Раковски“ 2',
    addressCity: 'Перник',
    postalCode: '2300',
  }));
  http = await startHttp(createServer);
});

after(async () => {
  await http.close();
  await prisma.$disconnect();
});

const tryLogin = (password: string, email = 'owner@example.test') =>
  http.post(null, '/vhod', { email, password });

test('пет грешни пароли заключват; вярната парола тогава не влиза; доверено устройство — влиза', async () => {
  // Успешен вход по-рано: браузърът получава бисквитката за доверено устройство.
  const first = await tryLogin(PASSWORD);
  assert.equal(first.status, 303);
  const device = (first.headers.getSetCookie() ?? []).find((c) => c.startsWith('fakturist_dev='));
  assert.ok(device, 'бисквитка за доверено устройство');
  const deviceCookie = device.split(';')[0]!;

  const wrong = await tryLogin('грешна-парола-1');
  const wrongText = await wrong.text();
  for (let i = 2; i <= 5; i += 1) assert.equal((await tryLogin(`грешна-парола-${i}`)).status, 400);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  assert.ok(user.lockedUntil && user.lockedUntil.getTime() > Date.now() + 14 * MINUTE);
  assert.equal(user.lockouts, 1);
  const locked = await tryLogin(PASSWORD);
  assert.equal(locked.status, 400);
  // Заключеният и непознатият получават същата страница като грешната парола.
  const unknown = await tryLogin('каквато-и-да-е', 'nobody@example.test');
  const strip = (html: string) => html.replace(/value="[^"]*@example\.test"/g, '');
  assert.equal(strip(await locked.text()), strip(wrongText));
  assert.equal(strip(await unknown.text()), strip(wrongText));
  assert.equal(
    await prisma.notification.count({
      where: { kind: 'account.locked', toEmail: 'owner@example.test' },
    }),
    1,
  );
  // Собственикът от своя браузър влиза въпреки заключването (чуждият не може да го държи вън).
  const trusted = await http.post({ cookie: deviceCookie, csrf: '' }, '/vhod', {
    email: 'owner@example.test',
    password: PASSWORD,
  });
  assert.equal(trusted.status, 303);
});

test('второто заключване е по-дълго; успешен вход след срока нулира всичко', async () => {
  // Таванът на заявките по адрес (10 за 15 минути) вече спира HTTP входа от теста — по-нататък
  // логиката на заключването се вика пряко.
  // Едно скорошно заключване (в рамките на деня) — следващото е по-дългото.
  await prisma.user.update({
    where: { id: userId },
    data: { lockedUntil: new Date(Date.now() - 1000), failedLogins: 0, lockouts: 1 },
  });
  let until: Date | null = null;
  for (let i = 1; i <= 5; i += 1) {
    assert.equal(await lockout.reserveAttempt(userId), true);
    until = await lockout.attemptFailed(userId);
  }
  assert.ok(until && until.getTime() > Date.now() + 55 * MINUTE, 'второто — час');
  assert.ok(until.getTime() < Date.now() + 61 * MINUTE, 'таванът е час');
  const second = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  assert.equal(second.lockouts, 2);
  assert.equal(await lockout.reserveAttempt(userId), false, 'заключен — без проверка');
  await prisma.user.update({
    where: { id: userId },
    data: { lockedUntil: new Date(Date.now() - 1000) },
  });
  assert.equal(await lockout.reserveAttempt(userId), true);
  await lockout.attemptSucceeded(userId);
  const reset = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  assert.deepEqual([reset.failedLogins, reset.lockouts, reset.lockedUntil], [0, 0, null]);
});

test('паралелни опити не получават повече от 5 проверки', async () => {
  const results = await Promise.all(
    Array.from({ length: 12 }, () => lockout.reserveAttempt(userId)),
  );
  assert.equal(results.filter(Boolean).length, 5);
  assert.equal(lockout.lockDuration(0), 15 * MINUTE);
  assert.equal(lockout.lockDuration(1), HOUR);
  assert.equal(lockout.lockDuration(9), HOUR);
  await prisma.user.update({ where: { id: userId }, data: { failedLogins: 0 } });
});

test('стъпката отшумява след ден без заключване; блокиран профил не трупа брояча', async () => {
  // Последното заключване е отпреди повече от ден → следващото е пак 15 минути.
  await prisma.user.update({
    where: { id: userId },
    data: { failedLogins: 0, lockouts: 5, lockedUntil: new Date(Date.now() - 2 * 24 * HOUR) },
  });
  let until: Date | null = null;
  for (let i = 1; i <= 5; i += 1) {
    await lockout.reserveAttempt(userId);
    until = await lockout.attemptFailed(userId);
  }
  assert.ok(until && until.getTime() < Date.now() + 16 * MINUTE);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).lockouts, 1);
});

test('правен преглед: с двуфакторен вход довереното устройство идва чак след кода', async () => {
  const { generateTotpSecret, totpCodeAt, totpStep } = await import('../../src/auth/totp.js');
  const { encryptTotpSecret } = await import('../../src/auth/keys.js');
  const secret = generateTotpSecret();
  await prisma.user.update({
    where: { id: userId },
    data: {
      totpSecretEnc: encryptTotpSecret(secret, userId),
      totpEnabledAt: new Date(),
      totpLastStep: null,
      lockedUntil: null,
      failedLogins: 0,
      lockouts: 0,
    },
  });
  const password = await tryLogin(PASSWORD);
  assert.equal(password.status, 303);
  const cookies = password.headers.getSetCookie();
  assert.ok(
    !cookies.some((c) => c.startsWith('fakturist_dev=') || c.startsWith('__Host-fakturist_dev=')),
    'само с паролата — не',
  );
  const session = cookies.map((c) => c.split(';')[0]).join('; ');
  const page = await fetch(`${http.origin}/vhod/kod`, { headers: { cookie: session } });
  const csrf = /name="_csrf" value="([^"]+)"/.exec(await page.text())?.[1] ?? '';
  const code = totpCodeAt(secret, totpStep(Math.floor(Date.now() / 1000)));
  const done = await fetch(`${http.origin}/vhod/kod`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: session },
    body: new URLSearchParams({ _csrf: csrf, code }),
  });
  assert.equal(done.status, 303);
  assert.ok(
    done.headers
      .getSetCookie()
      .some((c) => c.startsWith('fakturist_dev=') || c.startsWith('__Host-fakturist_dev=')),
    'след кода — да',
  );
  await prisma.user.update({
    where: { id: userId },
    data: { totpSecretEnc: null, totpEnabledAt: null, totpLastStep: null },
  });
});
