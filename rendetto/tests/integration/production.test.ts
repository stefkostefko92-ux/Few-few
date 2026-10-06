import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CUSTOMER_PASSWORD, prisma, startApp, stopApp, type Reply } from './harness.js';
import { startChildApp, type ChildApp } from './child.js';

/**
 * Production mode is where the cookie hardening matters (`__Host-`, Secure), and the main test process
 * runs as `test`: a second app process in production mode, on the same test database.
 */
let app: ChildApp;
const anchorDir = mkdtempSync(join(tmpdir(), 'rendetto-anchor-'));

before(startApp);
before(async () => {
  app = await startChildApp({
    NODE_ENV: 'production',
    // in production the config insists on SMTP; nothing listens on the discard port, so no mail leaves
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: '9',
    AUDIT_ANCHOR_PATH: join(anchorDir, 'audit-head.json'),
  });
});
after(async () => {
  await app.stop();
  rmSync(anchorDir, { recursive: true, force: true });
});
after(stopApp);

/** Every Set-Cookie line of the answers, by cookie name. */
function cookiesOf(replies: Reply[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const reply of replies)
    for (const line of reply.headers.getSetCookie())
      out.set(line.slice(0, line.indexOf('=')), line);
  return out;
}

test('in production every cookie is Secure and HttpOnly on the whole site; session and device are __Host-', async () => {
  const { hashPassword } = await import('../../src/auth/password.js');
  await prisma.user.create({
    data: {
      email: 'prod@example.test',
      name: 'Продукция',
      passwordHash: await hashPassword(CUSTOMER_PASSWORD),
      emailVerifiedAt: new Date(),
      planExpiresAt: new Date(Date.now() + 86_400_000),
    },
  });
  const b = app.browser();
  const replies: Reply[] = [];
  replies.push(await b.get('/login?lang=en'));
  const login = await b.login('prod@example.test', CUSTOMER_PASSWORD);
  replies.push(login);
  assert.equal(login.status, 302, 'signed in on the production app');
  // an unknown order: the answer leaves a one-time message (the flash cookie)
  replies.push(await b.get('/account/plan/withdraw/nope'));
  assert.equal(b.flash(), 'plan.withdraw.unavailable');

  const cookies = cookiesOf(replies);
  assert.deepEqual([...cookies.keys()].sort(), [
    '__Host-rd_dev',
    '__Host-rd_sid',
    'rd_flash',
    'rd_lang',
    'rd_pre',
  ]);
  for (const [name, line] of cookies) {
    assert.match(line, /;\s*Secure(;|$)/i, `${name}: Secure`);
    assert.match(line, /;\s*HttpOnly(;|$)/i, `${name}: HttpOnly`);
    assert.match(line, /;\s*Path=\/(;|$)/i, `${name}: the whole site`);
    assert.doesNotMatch(line, /;\s*Domain=/i, `${name}: no Domain (a subdomain cannot set it)`);
  }
  assert.match(cookies.get('__Host-rd_sid') ?? '', /SameSite=Strict/i);
  assert.match(cookies.get('rd_pre') ?? '', /SameSite=Strict/i);
  assert.match(cookies.get('__Host-rd_dev') ?? '', /SameSite=Lax/i);
  assert.ok(!b.cookies.has('rd_sid') && !b.cookies.has('rd_dev'), 'no test-mode names');

  assert.match(
    replies[0]?.headers.get('strict-transport-security') ?? '',
    /max-age=63072000; includeSubDomains/,
  );
  assert.match(
    replies[0]?.headers.get('content-security-policy') ?? '',
    /upgrade-insecure-requests/,
  );
});
