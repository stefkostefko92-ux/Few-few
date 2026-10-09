/**
 * The findings of the server audit (sign-in, plans, orders, mail, export, cache): each test fails on the
 * code before its fix and names the finding it guards.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import ejs from 'ejs';
import { totpCode } from '../../src/auth/totp.js';
import {
  Browser,
  STAFF_INBOX,
  STAFF_PASSWORD,
  forgetMailTo,
  mailTo,
  outbox,
  prisma,
  startApp,
  stopApp,
} from './harness.js';
import { customer, placeOrder, sessionCsrf, staff, withdraw } from './people.js';

before(startApp);
after(stopApp);

const { changePlan, rejectRequest } = await import('../../src/services/admin-plan.js');
const { banAccount } = await import('../../src/services/admin-security.js');
const { exportOwnData } = await import('../../src/services/account-export.js');
const { runMaintenance } = await import('../../src/services/maintenance.js');
const { resendOrderMail } = await import('../../src/services/plan-requests.js');
const { LEGAL_UPDATED } = await import('../../src/company.js');
const { LOGIN_RETENTION_DAYS } = await import('../../src/retention.js');

const DAY = 86_400_000;
/** The id of the audit chain's advisory lock (audit.ts): every audit entry waits for it. */
const AUDIT_LOCK = 7241020;
const now = () => Math.floor(Date.now() / 1000);

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

/* ------------------------------------- планове ------------------------------------- */

test('business:A1 — no paid plan by hand while an order is open; the account page links the order', async () => {
  const manager = await staff('MANAGER', 'open-order.manager@example.test');
  const { row } = await placeOrder('open-order@example.test', { option: 'm1', buyer: 'consumer' });
  assert.deepEqual(
    await changePlan(manager.actor, row.userId, {
      plan: 'PREMIUM',
      mode: 'months',
      months: 1,
      notify: false,
    }),
    { ok: false, key: 'admin.errors.openOrder' },
  );
  assert.deepEqual(
    await changePlan(manager.actor, row.userId, { plan: 'LIFETIME', notify: false }),
    { ok: false, key: 'admin.errors.openOrder' },
  );
  const user = await prisma.user.findUniqueOrThrow({ where: { id: row.userId } });
  assert.equal(user.plan, 'TRIAL');
  assert.equal(
    (await prisma.upgradeRequest.findUniqueOrThrow({ where: { id: row.id } })).status,
    'OPEN',
  );
  // more trial days are no paid plan and stay possible
  assert.deepEqual(
    await changePlan(manager.actor, row.userId, { plan: 'TRIAL', days: 10, notify: false }),
    { ok: true },
  );
  const page = await manager.browser.get(`/admin/accounts/${row.userId}`);
  assert.ok(
    page.body.includes(`href="/admin/accounts/${row.userId}?request=${row.id}#plan"`),
    'the open order is linked from the account page',
  );
});

test('business:A2 — an owner gives the owner role with their password and code; it is audited', async () => {
  const owner = await staff('OWNER', 'owner.first@example.test');
  const admin = await staff('ADMIN', 'owner.second@example.test');
  const path = `/admin/accounts/${admin.id}/owner`;
  const page = await owner.browser.get(`/admin/accounts/${admin.id}`);
  assert.ok(page.body.includes(`action="${path}#profile"`), 'the owner sees the form');
  const csrf = Browser.csrf(page.body);
  const role = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id } })).role;

  await owner.browser.post(path, {
    _csrf: csrf,
    password: 'Not-The-Password-1',
    code: totpCode(owner.secret, now() + 30),
  });
  assert.equal(owner.browser.flash(), 'flash.wrongPassword');
  assert.equal(await role(admin.id), 'ADMIN');
  await owner.browser.post(path, { _csrf: csrf, password: STAFF_PASSWORD, code: '000000' });
  assert.equal(owner.browser.flash(), 'flash.wrongCode');
  assert.equal(await role(admin.id), 'ADMIN');

  await owner.browser.post(path, {
    _csrf: csrf,
    password: STAFF_PASSWORD,
    code: totpCode(owner.secret, now() + 30),
  });
  assert.equal(owner.browser.flash(), 'flash.roleChanged');
  assert.equal(await role(admin.id), 'OWNER');
  assert.equal(await prisma.session.count({ where: { userId: admin.id } }), 0, 'signs in again');
  const entry = await prisma.auditLog.findFirstOrThrow({
    where: { action: 'admin.role.changed', targetId: admin.id },
  });
  assert.equal(entry.actorId, owner.id);
  assert.deepEqual(entry.detail, { from: 'ADMIN', to: 'OWNER', reauth: true });

  // nobody below the owner gives it, whatever they confirm with
  const other = await staff('ADMIN', 'owner.third@example.test');
  const target = await staff('MANAGER', 'owner.fourth@example.test');
  const otherPage = await other.browser.get(`/admin/accounts/${target.id}`);
  assert.ok(!otherPage.body.includes(`/admin/accounts/${target.id}/owner`));
  await other.browser.post(`/admin/accounts/${target.id}/owner`, {
    _csrf: Browser.csrf(otherPage.body),
    password: STAFF_PASSWORD,
    code: totpCode(other.secret, now() + 30),
  });
  assert.equal(await role(target.id), 'MANAGER');
});

test('business:A3 — an order activated without the „send a mail“ tick still tells the customer', async () => {
  const manager = await staff('MANAGER', 'notify.manager@example.test');
  const { row } = await placeOrder('notify@example.test', { option: 'm1', buyer: 'business' });
  const page = await manager.browser.get(`/admin/accounts/${row.userId}?request=${row.id}`);
  assert.ok(!page.body.includes('name="notify"'), 'no tick to take off when an order is fulfilled');
  forgetMailTo('notify@example.test');
  assert.deepEqual(
    await changePlan(manager.actor, row.userId, {
      plan: 'PREMIUM',
      mode: 'months',
      months: 1,
      notify: false,
      requestId: row.id,
    }),
    { ok: true },
  );
  await mailTo('notify@example.test', /Планът ви в Korpora е сменен/);
});

test('business:A4 — a rejected order is told to the customer by email, with its number', async () => {
  const manager = await staff('MANAGER', 'reject.manager@example.test');
  const { row } = await placeOrder('rejected@example.test', { option: 'm3', buyer: 'consumer' });
  assert.deepEqual(await rejectRequest(manager.actor, row.id), { ok: true });
  const mail = await mailTo('rejected@example.test', /отхвърлена/);
  assert.ok(mail.text.includes(row.id), 'the order number');
  assert.ok(mail.text.includes(STAFF_INBOX), 'where to write');
});

test('business:A5 — the data export says how each order was closed and when its emails went out', async () => {
  const email = 'export-orders@example.test';
  const { c, row: first } = await placeOrder(email, { option: 'm1', buyer: 'consumer' });
  await c.post('/account/plan/request', {
    _csrf: await sessionCsrf(c, '/account/plan'),
    option: 'm3',
    buyer: 'consumer',
  });
  const second = await prisma.upgradeRequest.findFirstOrThrow({
    where: { userId: first.userId, id: { not: first.id } },
  });
  assert.equal((await withdraw(c, second.id)).status, 302);
  const data = (await exportOwnData(first.userId)) as {
    orders: Array<Record<string, unknown>>;
  };
  const replaced = data.orders.find((o) => o.id === first.id);
  const withdrawn = data.orders.find((o) => o.id === second.id);
  assert.equal(replaced?.supersededBy, second.id);
  assert.equal(replaced?.closedBy, 'system');
  assert.ok(replaced?.confirmationSentAt, 'when the confirmation went out');
  assert.equal(withdrawn?.withdrawalOutcome, 'open');
  assert.ok(withdrawn?.withdrawalAckSentAt, 'when the receipt went out');
  assert.ok(!JSON.stringify(data.orders).includes('@superseded'), 'no internal labels');
});

/* ------------------------------------ правни ------------------------------------ */

test('legal:A5 — a ban tells the person by email: the reason, the rules, who decided, how to object', async () => {
  const admin = await staff('ADMIN', 'ban-mail.admin@example.test');
  await customer('ban-mail@example.test');
  const id = await idOf('ban-mail@example.test');
  forgetMailTo('ban-mail@example.test');
  const reason = 'Няколко акаунта за повече тестови периоди';
  assert.deepEqual(await banAccount(admin.actor, id, { reason }), { ok: true });
  const mail = await mailTo('ban-mail@example.test', /блокиран/);
  assert.ok(mail.text.includes(reason), 'the reason');
  assert.match(mail.text, /\/terms/, 'the rules');
  assert.match(mail.text, /човек от екипа/, 'a person decided');
  assert.ok(mail.text.includes(STAFF_INBOX), 'where to object');
  assert.match(mail.text, /kzp\.bg/, 'out-of-court route');

  // an address never confirmed may be someone else’s: it learns nothing
  const stranger = new Browser();
  await stranger.register('Непотвърден', 'ban-unconfirmed@example.test', 'Shelf-Hinge-Groove-42');
  const unconfirmed = await idOf('ban-unconfirmed@example.test');
  assert.deepEqual(await banAccount(admin.actor, unconfirmed, { reason }), { ok: true });
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.ok(
    !outbox.some((m) => m.to === 'ban-unconfirmed@example.test' && /блокиран/.test(m.subject)),
  );
});

test('legal:A8 — the sign-up IP address goes with the sign-up fingerprint after the retention period', async () => {
  await customer('signup-ip@example.test');
  const id = await idOf('signup-ip@example.test');
  await customer('signup-ip-new@example.test');
  const before = await prisma.user.findUniqueOrThrow({ where: { id } });
  assert.ok(before.signupIp, 'the IP is kept at sign-up');
  await prisma.user.update({
    where: { id },
    data: { createdAt: new Date(Date.now() - (LOGIN_RETENTION_DAYS + 1) * DAY) },
  });
  await runMaintenance();
  const old = await prisma.user.findUniqueOrThrow({ where: { id } });
  assert.equal(old.signupIp, null);
  assert.equal(old.signupCountry, before.signupCountry, 'the country stays');
  const recent = await prisma.user.findUniqueOrThrow({
    where: { email: 'signup-ip-new@example.test' },
  });
  assert.ok(recent.signupIp, 'a recent sign-up keeps its IP');
  const policy = await new Browser().get('/privacy');
  assert.match(
    policy.body,
    new RegExp(`IP адресът при регистрацията — ${LOGIN_RETENTION_DAYS} дни`),
  );
});

test('legal:A10 — a confirmation sent after the terms changed carries the terms accepted then', async () => {
  const email = 'old-terms@example.test';
  const { row } = await placeOrder(email, { option: 'm1', buyer: 'consumer' });
  assert.ok(
    await prisma.termsSnapshot.findUnique({
      where: { version_locale: { version: LEGAL_UPDATED.terms, locale: 'bg' } },
    }),
    'the terms in force are kept for later',
  );
  const content = '<!doctype html><p>условията от януари</p>';
  await prisma.termsSnapshot.create({ data: { version: '2026-01-15', locale: 'bg', content } });
  await prisma.upgradeRequest.update({
    where: { id: row.id },
    data: {
      termsVersion: '2026-01-15',
      confirmationSentAt: null,
      createdAt: new Date(Date.now() - 60 * 60_000),
    },
  });
  forgetMailTo(email);
  await resendOrderMail();
  const mail = await mailTo(email, /Потвърждение на поръчката/);
  assert.equal(mail.attachments?.[0]?.filename, 'korpora-terms-2026-01-15-bg.html');
  assert.equal(mail.attachments[0]?.content, content);
  assert.match(mail.text, /\(в сила от 15 януари 2026 г\.\), са приложени към това писмо/);
});

test('legal:A10 — a terms copy that cannot be built holds the confirmation back for the next try', async (t) => {
  const email = 'no-copy@example.test';
  const { row } = await placeOrder(email, { option: 'm1', buyer: 'consumer' });
  await prisma.termsSnapshot.deleteMany({});
  await prisma.upgradeRequest.update({
    where: { id: row.id },
    data: { confirmationSentAt: null, createdAt: new Date(Date.now() - 60 * 60_000) },
  });
  forgetMailTo(email);
  // the copy of the terms cannot be rendered this once (the next try works)
  const broken = t.mock.method(ejs, 'renderFile', () => Promise.reject(new Error('no template')));
  await resendOrderMail();
  broken.mock.restore();
  const held = await prisma.upgradeRequest.findUniqueOrThrow({ where: { id: row.id } });
  assert.equal(held.confirmationSentAt, null, 'not marked as sent');
  assert.ok(!outbox.some((m) => m.to === email), 'no confirmation with a link only');
  await resendOrderMail();
  const mail = await mailTo(email, /Потвърждение на поръчката/);
  assert.equal(mail.attachments?.length, 1);
  assert.ok(
    (await prisma.upgradeRequest.findUniqueOrThrow({ where: { id: row.id } })).confirmationSentAt,
  );
});

/* ------------------------------------- кеш ------------------------------------- */

test('ops:A2 — the manifest icons carry the version of the static files', async () => {
  const manifest = JSON.parse((await new Browser().get('/site.webmanifest')).body) as {
    icons: Array<{ src: string }>;
  };
  assert.ok(manifest.icons.length > 0);
  for (const icon of manifest.icons)
    assert.match(icon.src, /^\/static\/img\/icon-\d+\.png\?v=[0-9a-f]{10}$/);
});
