import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { prepareTestDatabase, truncateAll } from './harness.js';
import { startHttp, type HttpClient } from './http.js';

prepareTestDatabase();
const { prisma } = await import('../../src/db.js');
const { register } = await import('../../src/accounts/register.js');
const { seedPlans } = await import('../../src/billing/seed-plans.js');
const { createServer } = await import('../../src/server.js');
const lockout = await import('../../src/auth/lockout.js');
const { hashPassword } = await import('../../src/auth/password.js');
const { generateTotpSecret, totpCodeAt, totpStep } = await import('../../src/auth/totp.js');
const { encryptTotpSecret } = await import('../../src/auth/keys.js');
const { MINUTE } = await import('../../src/time.js');

/**
 * Довереното устройство (ревюто на Кодаджията, 16.11.2026): не спира от заключването, но само докато
 * грешките от доверени устройства са под `TRUSTED_MAX_FAILED` — иначе бисквитката + паролата дават
 * неограничени опити за кода. Бисквитката е вързана с паролата и 2FA: смяната им я обезсилва.
 */
const PASSWORD = 'дълга-и-трудна-парола-2026';
const EMAIL = 'owner@example.test';
let http: HttpClient;
let userId = '';
const secret = generateTotpSecret();

before(async () => {
  await truncateAll(prisma);
  await prisma.$transaction((tx) => seedPlans(tx));
  ({ userId } = await register({
    kind: 'company',
    name: 'Иван Петров',
    email: EMAIL,
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

const jar = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0]!);
const isDevice = (c: string) => /^(__Host-)?fakturist_dev=/.test(c);

async function passwordStep(device: string[], password = PASSWORD): Promise<Response> {
  return fetch(`${http.origin}/vhod`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: device.join('; ') },
    body: new URLSearchParams({ email: EMAIL, password }),
  });
}

async function codeStep(cookies: string[]): Promise<Response> {
  await prisma.user.update({ where: { id: userId }, data: { totpLastStep: null } });
  const cookie = cookies.join('; ');
  const form = await (await fetch(`${http.origin}/vhod/kod`, { headers: { cookie } })).text();
  const csrf = /name="_csrf" value="([^"]+)"/.exec(form)?.[1] ?? '';
  return fetch(`${http.origin}/vhod/kod`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
    body: new URLSearchParams({
      _csrf: csrf,
      code: totpCodeAt(secret, totpStep(Math.floor(Date.now() / 1000))),
    }),
  });
}

const lockedState = {
  lockedUntil: new Date(Date.now() + 15 * MINUTE),
  failedLogins: 5,
  lockouts: 1,
};
const clearState = { lockedUntil: null, failedLogins: 0, lockouts: 0, trustedFailures: 0 };

test('паралелни опити от доверено устройство: не повече от TRUSTED_MAX_FAILED; успешен вход нулира', async () => {
  const results = await Promise.all(
    Array.from({ length: lockout.TRUSTED_MAX_FAILED + 5 }, () =>
      lockout.reserveTrustedAttempt(userId),
    ),
  );
  assert.equal(results.filter(Boolean).length, lockout.TRUSTED_MAX_FAILED);
  await lockout.attemptSucceeded(userId);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  assert.equal(user.trustedFailures, 0);
});

test('заключен профил: доверено устройство влиза, докато грешките от доверени са под тавана', async () => {
  const first = await passwordStep([]);
  assert.equal(first.status, 303);
  const device = jar(first).filter(isDevice);
  assert.equal(device.length, 1);

  await prisma.user.update({ where: { id: userId }, data: lockedState });
  assert.equal((await passwordStep(device)).status, 303, 'под тавана — влиза покрай заключването');

  await prisma.user.update({
    where: { id: userId },
    data: { ...lockedState, trustedFailures: lockout.TRUSTED_MAX_FAILED },
  });
  assert.equal((await passwordStep(device)).status, 400, 'над тавана — заключването важи');
  await prisma.user.update({ where: { id: userId }, data: clearState });
});

test('кодът (2FA) от доверено устройство над тавана — заключен, както без бисквитка', async () => {
  await prisma.user.update({
    where: { id: userId },
    data: {
      ...clearState,
      totpSecretEnc: encryptTotpSecret(secret, userId),
      totpEnabledAt: new Date(),
    },
  });
  // Пълен вход: бисквитката е вързана и с 2FA, затова се взема наново след включването ѝ.
  const pass = await passwordStep([]);
  const login = await codeStep(jar(pass));
  assert.equal(login.status, 303);
  const device = jar(login).filter(isDevice);
  assert.equal(device.length, 1);

  // Паролата минава (профилът не е заключен), после — заключен и изчерпан таван за доверените.
  const step1 = await passwordStep(device);
  assert.equal(step1.status, 303);
  await prisma.user.update({
    where: { id: userId },
    data: { ...lockedState, trustedFailures: lockout.TRUSTED_MAX_FAILED },
  });
  const refused = await codeStep([...device, ...jar(step1)]);
  assert.equal(refused.status, 400, 'кодът не се проверява — профилът е заключен');

  // Под тавана — довереното устройство минава кода покрай заключването (SPEC 46).
  await prisma.user.update({ where: { id: userId }, data: { ...clearState } });
  const step2 = await passwordStep(device);
  assert.equal(step2.status, 303);
  await prisma.user.update({ where: { id: userId }, data: lockedState });
  assert.equal((await codeStep([...device, ...jar(step2)])).status, 303);
  await prisma.user.update({
    where: { id: userId },
    data: { ...clearState, totpSecretEnc: null, totpEnabledAt: null },
  });
});

test('нова парола обезсилва довереното устройство', async () => {
  const first = await passwordStep([]);
  const device = jar(first).filter(isDevice);
  assert.equal(device.length, 1);
  const NEW = 'друга-дълга-парола-2026';
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(NEW), ...lockedState },
  });
  assert.equal((await passwordStep(device, NEW)).status, 400, 'старата бисквитка не е доверена');
  await prisma.user.update({ where: { id: userId }, data: clearState });
  assert.equal((await passwordStep(device, NEW)).status, 303);
});
