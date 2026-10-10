import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Browser,
  CUSTOMER_PASSWORD,
  forgetMailTo,
  linkIn,
  mailTo,
  prisma,
  type Reply,
  startApp,
  stopApp,
} from './harness.js';
import { customer, sessionCsrf } from './people.js';

before(startApp);
after(stopApp);

const HOUR = 3_600_000;
const NEW_PASSWORD = 'New-Oak-Plank-2026x';

const tokenOf = (link: string): string =>
  new URL(`http://x${link}`).searchParams.get('token') ?? '';

/** What a browser gets for the link on /reset (GET) and for the new-password form posted with it. */
async function tryReset(token: string): Promise<{ page: Reply; reply: Reply }> {
  const anon = new Browser();
  const csrf = Browser.csrf((await anon.get('/forgot')).body);
  const page = await anon.get(`/reset?token=${encodeURIComponent(token)}`);
  const reply = await anon.post('/reset', { _csrf: csrf, token, password: NEW_PASSWORD });
  return { page, reply };
}

test('an expired password-reset link is refused and the password stays', async () => {
  await customer('expired-reset@example.test');
  const anon = new Browser();
  await anon.submit('/forgot', '/forgot', { email: 'expired-reset@example.test' });
  const link = linkIn(
    (await mailTo('expired-reset@example.test', /Нова парола/)).text,
    '/reset?token=',
  );
  assert.equal((await new Browser().get(link)).status, 200, 'the fresh link opens the form');

  await prisma.emailToken.updateMany({
    where: { user: { email: 'expired-reset@example.test' } },
    data: { expiresAt: new Date(Date.now() - HOUR) },
  });
  const { reply, page } = await tryReset(tokenOf(link));
  assert.equal(page.status, 400, 'the form is not shown for an expired link');
  assert.equal(reply.status, 400);
  assert.equal(
    (await new Browser().login('expired-reset@example.test', CUSTOMER_PASSWORD)).status,
    302,
    'the old password still works',
  );
  assert.equal(
    (await new Browser().login('expired-reset@example.test', NEW_PASSWORD)).status,
    401,
    'the new one was not set',
  );
});

test('a sign-up confirmation link cannot reset a password', async () => {
  const b = new Browser();
  await b.register('Мария', 'wrong-purpose@example.test', CUSTOMER_PASSWORD);
  const link = linkIn(
    (await mailTo('wrong-purpose@example.test', /Потвърдете/)).text,
    '/verify-email?token=',
  );
  const before = await prisma.user.findUniqueOrThrow({
    where: { email: 'wrong-purpose@example.test' },
  });
  const { reply, page } = await tryReset(tokenOf(link));
  assert.equal(page.status, 400);
  assert.equal(reply.status, 400);
  const after = await prisma.user.findUniqueOrThrow({
    where: { email: 'wrong-purpose@example.test' },
  });
  assert.equal(after.passwordHash, before.passwordHash, 'the password is not changed');
  assert.equal(after.emailVerifiedAt, null, 'the address is not confirmed by the detour');
  assert.equal(
    (await prisma.emailToken.findFirstOrThrow({ where: { userId: after.id } })).usedAt,
    null,
    'the confirmation link is not used up by the wrong form',
  );
  assert.equal((await b.confirmEmail(link)).status, 200, 'it still confirms the address');
});

test('an expired confirmation link does not confirm the address or start the trial', async () => {
  const b = new Browser();
  await b.register('Иван', 'expired-verify@example.test', CUSTOMER_PASSWORD);
  const link = linkIn(
    (await mailTo('expired-verify@example.test', /Потвърдете/)).text,
    '/verify-email?token=',
  );
  await prisma.emailToken.updateMany({
    where: { user: { email: 'expired-verify@example.test' } },
    data: { expiresAt: new Date(Date.now() - HOUR) },
  });
  assert.equal((await b.confirmEmail(link)).status, 400);
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: 'expired-verify@example.test' },
  });
  assert.equal(user.emailVerifiedAt, null);
  assert.equal(user.planExpiresAt, null, 'the trial does not start');
});

test('an email-change link neither resets a password nor works once it has expired', async () => {
  const b = await customer('change-link@example.test');
  forgetMailTo('change-link-new@example.test');
  const sent = await b.post('/account/email', {
    _csrf: await sessionCsrf(b),
    email: 'change-link-new@example.test',
    password: CUSTOMER_PASSWORD,
  });
  assert.equal(sent.status, 302);
  const link = linkIn(
    (await mailTo('change-link-new@example.test', /Потвърдете новия/)).text,
    '/verify-email?token=',
  );
  const { reply, page } = await tryReset(tokenOf(link));
  assert.equal(page.status, 400);
  assert.equal(reply.status, 400);

  await prisma.emailToken.updateMany({
    where: { user: { email: 'change-link@example.test' } },
    data: { expiresAt: new Date(Date.now() - HOUR) },
  });
  assert.equal((await b.confirmEmail(link)).status, 400, 'expired');
  assert.ok(
    await prisma.user.findUnique({ where: { email: 'change-link@example.test' } }),
    'the address is unchanged',
  );
  assert.equal(
    await prisma.user.findUnique({ where: { email: 'change-link-new@example.test' } }),
    null,
  );
});
