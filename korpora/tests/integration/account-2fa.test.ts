import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { totpCode } from '../../src/auth/totp.js';
import {
  Browser,
  CUSTOMER_PASSWORD,
  STAFF_PASSWORD,
  forgetMailTo,
  mailTo,
  prisma,
  startApp,
  stopApp,
} from './harness.js';
import { customer, sessionCsrf, staff } from './people.js';
import { enable2fa } from './twofa.js';

before(startApp);
after(stopApp);

const nowSeconds = () => Math.floor(Date.now() / 1000);

/** A code of the app that is not valid in the step now, the one before or the one after. */
function wrongAppCode(secret: string): string {
  const valid = [-30, 0, 30].map((shift) => totpCode(secret, nowSeconds() + shift));
  for (let n = 0; ; n++) {
    const candidate = String(n).padStart(6, '0');
    if (!valid.includes(candidate)) return candidate;
  }
}

/** The step after the enrolment one: accepted once, with the drift the server allows. */
const nextAppCode = (secret: string) => totpCode(secret, nowSeconds() + 30);

const state = (email: string) =>
  prisma.user.findUniqueOrThrow({
    where: { email },
    select: { id: true, totpEnabledAt: true, totpSecretEnc: true },
  });

test('turning 2FA off needs the password and a code; a wrong code keeps it on', async () => {
  const email = 'off-2fa@example.test';
  const b = await customer(email);
  const { secret, codes } = await enable2fa(b);
  const { id } = await state(email);
  const off = async (form: Record<string, string>) =>
    b.post('/account/security/2fa/disable', {
      _csrf: await sessionCsrf(b, '/account/security'),
      ...form,
    });

  await off({ password: CUSTOMER_PASSWORD, code: wrongAppCode(secret) });
  assert.equal(b.flash(), 'flash.wrongCode');
  assert.ok((await state(email)).totpEnabledAt, 'a wrong code leaves 2FA on');
  assert.equal(await prisma.recoveryCode.count({ where: { userId: id } }), codes.length);

  await off({ password: 'Wrong-Password-000', code: nextAppCode(secret) });
  assert.equal(b.flash(), 'flash.wrongPassword');
  assert.ok((await state(email)).totpEnabledAt, 'a wrong password leaves 2FA on');

  forgetMailTo(email);
  await off({ password: CUSTOMER_PASSWORD, code: nextAppCode(secret) });
  assert.equal(b.flash(), 'flash.twoFactorOff');
  const after = await state(email);
  assert.equal(after.totpEnabledAt, null);
  assert.equal(after.totpSecretEnc, null, 'the secret is not kept');
  assert.equal(await prisma.recoveryCode.count({ where: { userId: id } }), 0);
  await mailTo(email, /Двуфакторната защита е изключена/);
  assert.equal(
    (await new Browser().login(email, CUSTOMER_PASSWORD)).location.startsWith('/login/2fa'),
    false,
    'the next sign-in asks for no code',
  );
});

test('a recovery code can also turn 2FA off', async () => {
  const email = 'off-recovery@example.test';
  const b = await customer(email);
  const { codes } = await enable2fa(b);
  await b.post('/account/security/2fa/disable', {
    _csrf: await sessionCsrf(b, '/account/security'),
    password: CUSTOMER_PASSWORD,
    code: codes[0] ?? '',
  });
  assert.equal(b.flash(), 'flash.twoFactorOff');
  assert.equal((await state(email)).totpEnabledAt, null);
});

test('a team member cannot turn 2FA off', async () => {
  const member = await staff('SUPPORT', 'keeps-2fa@example.test');
  await member.browser.post('/account/security/2fa/disable', {
    _csrf: await sessionCsrf(member.browser, '/account/security'),
    password: STAFF_PASSWORD,
    code: nextAppCode(member.secret),
  });
  assert.equal(member.browser.flash(), 'flash.staffKeeps2fa');
  const after = await state('keeps-2fa@example.test');
  assert.ok(after.totpEnabledAt && after.totpSecretEnc, '2FA of the team stays');
});

test('new recovery codes need a code; the old ones stop working', async () => {
  const email = 'regen@example.test';
  const b = await customer(email);
  const { secret, codes: oldCodes } = await enable2fa(b);
  const { id } = await state(email);
  const regenerate = async (code: string) =>
    b.post('/account/security/recovery', {
      _csrf: await sessionCsrf(b, '/account/security'),
      code,
    });

  const refused = await regenerate(wrongAppCode(secret));
  assert.equal(refused.status, 302);
  assert.equal(b.flash(), 'flash.wrongCode');
  assert.equal(
    await prisma.recoveryCode.count({ where: { userId: id, usedAt: null } }),
    oldCodes.length,
  );

  const done = await regenerate(nextAppCode(secret));
  assert.equal(done.status, 200);
  const fresh = [...done.body.matchAll(/<li>([A-Za-z0-9-]{8,})<\/li>/g)].map((m) => m[1] ?? '');
  assert.equal(fresh.length, 10);
  assert.equal(
    fresh.some((code) => oldCodes.includes(code)),
    false,
    'the new codes are new',
  );
  assert.equal(await prisma.recoveryCode.count({ where: { userId: id } }), 10, 'not 20');

  const second = async (code: string) => {
    const c = new Browser();
    const login = await c.login(email, CUSTOMER_PASSWORD);
    const page = await c.get(login.location);
    return c.post('/login/2fa', { _csrf: Browser.csrf(page.body), next: '/app', code });
  };
  assert.equal((await second(oldCodes[0] ?? '')).status, 401, 'an old code no longer works');
  assert.equal((await second(fresh[0] ?? '')).status, 302, 'a new one does');
});
