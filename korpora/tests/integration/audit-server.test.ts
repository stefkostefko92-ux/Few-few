/**
 * The findings of the server audit (sign-in, plans, orders, mail, export, cache): each test fails on the
 * code before its fix and names the finding it guards.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { Browser, forgetMailTo, mailTo, prisma, startApp, stopApp } from './harness.js';
import { customer, sessionCsrf } from './people.js';

before(startApp);
after(stopApp);

const { exportOwnData } = await import('../../src/services/account-self.js');

/** The id of the audit chain's advisory lock (audit.ts): every audit entry waits for it. */
const AUDIT_LOCK = 7241020;

async function idOf(email: string): Promise<string> {
  return (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
}

/** Work that runs after the answer (fire and forget): wait for its row a little. */
async function eventually<T>(read: () => Promise<T | null>, timeoutMs = 3000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = await read();
    if (value !== null) return value;
    if (Date.now() - start > timeoutMs) throw new Error('the row did not appear');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/* ------------------------------------- вход ------------------------------------- */

test('auth:A1 — „forgot password“ answers before the work for a known address is done', async () => {
  const email = 'forgot-timing@example.test';
  await customer(email);
  forgetMailTo(email);
  const anon = new Browser();
  const csrf = Browser.csrf((await anon.get('/forgot')).body);
  // Another transaction holds the audit chain: the work for a known address waits on it, the work
  // for an unknown one never reaches it. The answer must not tell the two apart.
  let release = (): void => {};
  let held = (): void => {};
  const holding = new Promise<void>((resolve) => (held = resolve));
  const lock = prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${AUDIT_LOCK})`);
      held();
      await new Promise<void>((resolve) => (release = resolve));
    },
    { timeout: 20_000 },
  );
  await holding;
  const reply = await Promise.race([
    anon.post('/forgot', { _csrf: csrf, email }),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
  ]);
  release();
  await lock;
  assert.ok(reply, 'the answer waited for the reset work of a known address');
  assert.equal(reply.status, 200);
  await mailTo(email, /Нова парола/);
});

test('auth:A2 — a reset asked for by anyone is the system’s entry with the asker’s IP, not the owner’s', async () => {
  const email = 'forgot-actor@example.test';
  await customer(email);
  const id = await idOf(email);
  const anon = new Browser('203.0.113.9');
  await anon.submit('/forgot', '/forgot', { email });
  const row = await eventually(() =>
    prisma.auditLog.findFirst({ where: { action: 'auth.reset.requested', targetId: id } }),
  );
  assert.deepEqual([row.actorType, row.actorId, row.ip], ['SYSTEM', null, '203.0.113.9']);
  const data = (await exportOwnData(id)) as {
    auditLog: Array<{ action: string; by: string; ip: string | null }>;
  };
  const entry = data.auditLog.find((a) => a.action === 'auth.reset.requested');
  assert.deepEqual([entry?.by, entry?.ip], ['system', null]);
  assert.ok(!JSON.stringify(data).includes('203.0.113.9'), 'the asker’s IP is not in the export');
});

test('auth:A3 — a sign-out sent from another site of the same domain leaves the session alone', async () => {
  const b = await customer('logout-origin@example.test');
  const csrf = await sessionCsrf(b, '/app');
  const foreign = await b.post(
    '/logout',
    { _csrf: csrf },
    { origin: 'https://linketto.carbonstealth.eu' },
  );
  assert.equal(foreign.status, 302);
  assert.equal((await b.get('/account')).status, 200, 'still signed in');
  const own = await b.post('/logout', { _csrf: csrf });
  assert.equal(own.status, 302);
  assert.equal((await b.get('/account')).status, 302, 'signed out from our own page');
});
