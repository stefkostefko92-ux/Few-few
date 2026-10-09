/**
 * The device fingerprint and the device cookie serve the provider's own purposes (repeated trials,
 * shared accounts) only with consent: a separate box at sign-up that is not ticked, recorded with
 * the time and the version of the text, and withdrawn from Security as easily as it is given — the
 * kept fingerprint goes with it. Without consent no fingerprint is read or kept, and linked
 * accounts use no device or HWID signal for that person. The trial does not depend on it; sign-in
 * security (known device, new sign-in email, lockout) stays as strictly necessary.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Browser,
  CUSTOMER_PASSWORD,
  linkIn,
  mailTo,
  nextIp,
  prisma,
  startApp,
  stopApp,
} from './harness.js';
import { customer, sessionCsrf } from './people.js';

before(startApp);
after(stopApp);

const { LEGAL_UPDATED } = await import('../../src/company.js');
const { linkedAccounts } = await import('../../src/services/admin-insights.js');
const { runMaintenance } = await import('../../src/services/maintenance.js');

const DAY = 86_400_000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0 Safari/537.36';

/** A browser with hardware of its own, so an HWID links only the accounts a test means to link. */
function machine(gpu: string): Browser {
  return new Browser(nextIp(), {
    platform: 'Win32',
    cores: 8,
    memory: 8,
    screen: '1920x1080',
    depth: 24,
    gpu,
  });
}

/** Whether the sign-in page in this browser lets the script read the fingerprint. */
async function signInReadsFingerprint(b: Browser): Promise<boolean> {
  const page = await b.get('/login');
  assert.equal(page.status, 200);
  return /data-fingerprint|name="fp"/.test(page.body);
}

async function confirm(b: Browser, email: string): Promise<void> {
  const reply = await b.confirmEmail(
    linkIn((await mailTo(email, /Потвърдете имейла/)).text, '/verify-email?token='),
  );
  assert.equal(reply.status, 200);
}

async function idOf(email: string): Promise<string> {
  return (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
}

test('the sign-up form asks for the fingerprint with a box of its own, not ticked, in all three languages', async () => {
  for (const [lang, purpose] of [
    ['bg', /повторни тестови периоди/],
    ['en', /repeated trials/],
    ['it', /prove ripetute/],
  ] as const) {
    const page = await new Browser().get(`/register?lang=${lang}`);
    assert.equal(page.status, 200);
    const box = /<input[^>]*name="deviceConsent"[^>]*>/.exec(page.body)?.[0];
    assert.ok(box, `${lang}: a consent box of its own`);
    assert.match(box, /type="checkbox"/);
    assert.doesNotMatch(box, /\bchecked\b/, `${lang}: not ticked in advance`);
    assert.doesNotMatch(box, /\brequired\b/, `${lang}: not a condition of the sign-up`);
    const label = /<label class="check">\s*<input[^>]*name="deviceConsent"[\s\S]*?<\/label>/.exec(
      page.body,
    )?.[0];
    assert.match(label ?? '', purpose, `${lang}: the box names the purpose`);
  }
});

test('without consent no fingerprint is kept, even when the browser sends one, and the trial runs the same', async () => {
  const email = 'no-consent@example.test';
  const b = machine('ANGLE (No Consent GPU)');
  assert.equal((await b.register('Без Съгласие', email, CUSTOMER_PASSWORD)).status, 200);
  const signed = await prisma.user.findUniqueOrThrow({ where: { email } });
  assert.equal(signed.deviceConsentAt, null);
  assert.equal(signed.deviceConsentVersion, null);
  assert.equal(signed.signupFingerprint, null, 'no HWID without consent');
  assert.ok(signed.signupDeviceHash, 'the device cookie stays for sign-in security');

  await confirm(b, email);
  const verified = await prisma.user.findUniqueOrThrow({ where: { email } });
  assert.ok(verified.emailVerifiedAt && verified.planExpiresAt);
  const days = (verified.planExpiresAt.getTime() - verified.emailVerifiedAt.getTime()) / DAY;
  assert.ok(Math.abs(days - 30) < 0.01, `the trial does not depend on consent: ${days} days`);

  assert.equal(await signInReadsFingerprint(b), false, 'the sign-in page reads no fingerprint');
  assert.equal((await b.login(email, CUSTOMER_PASSWORD)).status, 302);
  const user = await prisma.user.findUniqueOrThrow({
    where: { email },
    include: { devices: true, logins: true },
  });
  assert.equal(user.devices.length, 1, 'the known device is still recorded');
  assert.equal(user.devices[0]?.fingerprintHash, null);
  assert.equal(user.devices[0]?.summary, 'Windows, Chrome 141', 'only system and browser');
  assert.ok(user.logins.length > 0 && user.logins.every((l) => l.fingerprintHash === null));
});

test('with consent the fingerprint is kept, with the time and the version of the text', async () => {
  const email = 'consent@example.test';
  const b = machine('ANGLE (Consent GPU)');
  const start = Date.now();
  await b.register('Със Съгласие', email, CUSTOMER_PASSWORD, true);
  const signed = await prisma.user.findUniqueOrThrow({ where: { email } });
  assert.ok(signed.deviceConsentAt, 'when');
  assert.ok(signed.deviceConsentAt.getTime() >= start - 1000);
  assert.equal(signed.deviceConsentVersion, LEGAL_UPDATED.privacy, 'which text');
  assert.ok(signed.signupFingerprint);
  const registered = await prisma.auditLog.findFirstOrThrow({
    where: { action: 'account.registered', targetId: signed.id },
  });
  assert.deepEqual(registered.detail, { deviceConsent: LEGAL_UPDATED.privacy });

  await confirm(b, email);
  assert.equal(await signInReadsFingerprint(b), true, 'a browser of consenting accounts only');
  assert.equal(
    await signInReadsFingerprint(new Browser()),
    false,
    'a browser nobody signed in from',
  );
  assert.equal((await b.login(email, CUSTOMER_PASSWORD)).status, 302);
  const user = await prisma.user.findUniqueOrThrow({
    where: { email },
    include: { devices: true, logins: true },
  });
  assert.ok(user.devices[0]?.fingerprintHash);
  assert.match(user.devices[0]?.summary ?? '', /ANGLE \(Consent GPU\)/);
  assert.ok(user.logins.some((l) => l.outcome === 'SUCCESS' && l.fingerprintHash));

  const exported = await b.post('/account/data/export', {
    _csrf: await sessionCsrf(b, '/account/data'),
  });
  const data = JSON.parse(exported.body) as {
    account: { deviceConsent: { givenAt: string; textVersion: string } | null };
  };
  assert.deepEqual(data.account.deviceConsent, {
    givenAt: signed.deviceConsentAt.toISOString(),
    textVersion: LEGAL_UPDATED.privacy,
  });
});

test('a sign-in from a browser another account without consent used reads no fingerprint', async () => {
  const shared = machine('ANGLE (Family GPU)');
  await shared.register('Със Съгласие', 'family-yes@example.test', CUSTOMER_PASSWORD, true);
  await confirm(shared, 'family-yes@example.test');
  assert.equal(await signInReadsFingerprint(shared), true);
  await shared.register('Без Съгласие', 'family-no@example.test', CUSTOMER_PASSWORD);
  assert.equal(await signInReadsFingerprint(shared), false);
});

test('a failed sign-in keeps no fingerprint, whoever tries', async () => {
  await customer('tried@example.test', undefined, undefined, true);
  await machine('ANGLE (Stranger GPU)').login('tried@example.test', 'Wrong-Password-000');
  await machine('ANGLE (Stranger GPU)').login('nobody-here@example.test', 'Wrong-Password-000');
  assert.equal(
    await prisma.loginEvent.count({
      where: { outcome: { not: 'SUCCESS' }, fingerprintHash: { not: null } },
    }),
    0,
  );
});

test('linked accounts use the device and the HWID only between accounts with consent', async () => {
  const shared = machine('ANGLE (Shared GPU)');
  await shared.register('Първи', 'linked-a@example.test', CUSTOMER_PASSWORD);
  await shared.register('Втори', 'linked-b@example.test', CUSTOMER_PASSWORD, true);
  await machine('ANGLE (Shared GPU)').register(
    'Трети',
    'linked-c@example.test',
    CUSTOMER_PASSWORD,
    true,
  );
  const reasons = async (of: string, other: string) =>
    (await linkedAccounts(await idOf(of))).find((u) => u.email === other)?.reasons ?? [];
  const deviceOrHwid = (list: string[]) => list.filter((r) => r !== 'ip');

  assert.deepEqual(
    deviceOrHwid(await reasons('linked-a@example.test', 'linked-b@example.test')),
    [],
    'without consent: no device or HWID signal for this person',
  );
  assert.deepEqual(
    deviceOrHwid(await reasons('linked-b@example.test', 'linked-a@example.test')),
    [],
    'nor when found from the side of an account with consent',
  );
  assert.deepEqual(await reasons('linked-b@example.test', 'linked-c@example.test'), ['hwid']);
  assert.deepEqual(await reasons('linked-c@example.test', 'linked-b@example.test'), ['hwid']);
});

test('consent is withdrawn from Security with one button, and the kept fingerprint is deleted', async () => {
  const email = 'withdraw-consent@example.test';
  const b = await customer(email, undefined, undefined, true);
  const before = await prisma.user.findUniqueOrThrow({
    where: { email },
    include: { devices: true },
  });
  assert.ok(before.signupFingerprint && before.devices[0]?.fingerprintHash);

  const page = await b.get('/account/security');
  assert.match(page.body, /action="\/account\/security\/device-consent\/withdraw"/);
  const done = await b.post('/account/security/device-consent/withdraw', {
    _csrf: Browser.csrf(page.body),
  });
  assert.equal(done.status, 302);
  assert.equal(b.flash(), 'flash.deviceConsentWithdrawn');

  const after = await prisma.user.findUniqueOrThrow({
    where: { email },
    include: { devices: true, logins: true },
  });
  assert.equal(after.deviceConsentAt, null);
  assert.equal(after.deviceConsentVersion, null);
  assert.equal(after.signupFingerprint, null);
  assert.ok(after.devices.every((d) => d.fingerprintHash === null && !/ANGLE/.test(d.summary)));
  assert.ok(after.logins.every((l) => l.fingerprintHash === null));
  assert.equal(
    after.signupDeviceHash,
    before.signupDeviceHash,
    'sign-in security keeps the cookie',
  );
  assert.ok(
    await prisma.auditLog.findFirst({
      where: { action: 'account.deviceConsent.withdrawn', targetId: after.id },
    }),
  );
  assert.doesNotMatch(
    (await b.get('/account/security')).body,
    /device-consent\/withdraw/,
    'nothing left to withdraw',
  );

  // From now on the browser is not asked, and what an old script would still send is not kept.
  await b.post('/logout', { _csrf: await sessionCsrf(b, '/account/security') });
  assert.equal(await signInReadsFingerprint(b), false);
  assert.equal((await b.login(email, CUSTOMER_PASSWORD)).status, 302);
  const later = await prisma.user.findUniqueOrThrow({
    where: { email },
    include: { devices: true },
  });
  assert.ok(later.devices.every((d) => d.fingerprintHash === null));
});

test('the maintenance deletes fingerprints kept without consent, also from before the consent box', async () => {
  const kept = await customer('keeps-consent@example.test', undefined, undefined, true);
  assert.ok(kept);
  const fp = 'f'.repeat(64);
  const legacy = await prisma.user.create({
    data: {
      email: 'legacy@example.test',
      name: 'Отпреди',
      passwordHash: 'x',
      emailVerifiedAt: new Date(),
      signupDeviceHash: 'd'.repeat(64),
      signupFingerprint: fp,
      devices: {
        create: {
          cookieHash: 'c'.repeat(64),
          fingerprintHash: fp,
          summary: 'Windows, Chrome 141, 1920×1080, 8 CPU, ANGLE (Old GPU), Europe/Sofia',
          userAgent: UA,
        },
      },
      logins: { create: { outcome: 'SUCCESS', fingerprintHash: fp } },
    },
  });
  await prisma.loginEvent.create({ data: { outcome: 'UNKNOWN_EMAIL', fingerprintHash: fp } });

  await runMaintenance();

  const gone = await prisma.user.findUniqueOrThrow({
    where: { id: legacy.id },
    include: { devices: true, logins: true },
  });
  assert.equal(gone.signupFingerprint, null);
  assert.equal(gone.signupDeviceHash, 'd'.repeat(64), 'the security cookie hash stays');
  assert.equal(gone.devices[0]?.fingerprintHash, null);
  assert.equal(gone.devices[0]?.summary, 'Windows, Chrome 141');
  assert.equal(gone.logins[0]?.fingerprintHash, null);
  assert.equal(
    await prisma.loginEvent.count({ where: { userId: null, fingerprintHash: { not: null } } }),
    0,
  );
  const consenting = await prisma.user.findUniqueOrThrow({
    where: { email: 'keeps-consent@example.test' },
    include: { devices: true },
  });
  assert.ok(
    consenting.signupFingerprint && consenting.devices[0]?.fingerprintHash,
    'consent: kept',
  );
});
