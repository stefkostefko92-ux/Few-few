/**
 * The people of the integration tests: a verified customer, a team member with 2FA, an order and a
 * project made through the real forms — one helper each, so a failed step fails here and not later.
 */
import assert from 'node:assert/strict';
import type { Role } from '@prisma/client';
import type { StaffActor } from '../../src/services/admin-common.js';
import {
  Browser,
  CUSTOMER_PASSWORD,
  STAFF_PASSWORD,
  linkIn,
  mailTo,
  nextIp,
  prisma,
  type Reply,
} from './harness.js';

/** A verified customer with a signed-in browser. */
export async function customer(
  email: string,
  password = CUSTOMER_PASSWORD,
  ip = nextIp(),
): Promise<Browser> {
  const browser = new Browser(ip);
  await browser.register('Тест Клиент', email, password);
  await browser.confirmEmail(
    linkIn((await mailTo(email, /Потвърдете имейла/)).text, '/verify-email?token='),
  );
  const login = await browser.login(email, password);
  if (login.status !== 302) throw new Error(`login failed with ${login.status}`);
  return browser;
}

export type StaffRole = Exclude<Role, 'CUSTOMER'>;

export interface StaffMember {
  browser: Browser;
  id: string;
  secret: string;
  /** The same actor the admin routes build (routes/admin/common.ts) — for calling the services. */
  actor: StaffActor;
}

/** A team member with two-factor protection already on, signed in through the real login and 2FA forms. */
export async function staff(
  role: StaffRole,
  email: string,
  password = STAFF_PASSWORD,
): Promise<StaffMember> {
  const { hashPassword } = await import('../../src/auth/password.js');
  const { encryptSecret } = await import('../../src/crypto.js');
  const { generateTotpSecret, totpCode } = await import('../../src/auth/totp.js');
  const { config } = await import('../../src/config.js');
  const secret = generateTotpSecret();
  const user = await prisma.user.create({
    data: {
      email,
      name: `Екип ${role}`,
      role,
      passwordHash: await hashPassword(password),
      emailVerifiedAt: new Date(),
      plan: 'LIFETIME',
      totpSecretEnc: encryptSecret(secret, config().ENC_KEY),
      totpEnabledAt: new Date(),
    },
  });
  // an address of its own, as for a customer: the sign-in and code limits (10 a minute) do not add up
  // every team member of a test file
  const browser = new Browser();
  const login = await browser.login(email, password);
  if (!login.location.startsWith('/login/2fa'))
    throw new Error(`staff login: ${login.status} ${login.location}`);
  const page = await browser.get(login.location);
  const done = await browser.post('/login/2fa', {
    _csrf: Browser.csrf(page.body),
    next: '/admin',
    code: totpCode(secret, Math.floor(Date.now() / 1000)),
  });
  if (done.status !== 302) throw new Error(`staff 2FA: ${done.status}`);
  const actor: StaffActor = { type: 'HUMAN', id: user.id, role, label: user.name };
  return { browser, id: user.id, secret, actor };
}

/** The session CSRF token from any signed-in page. */
export async function sessionCsrf(browser: Browser, path = '/account'): Promise<string> {
  return Browser.csrf((await browser.get(path)).body);
}

/** A verified customer who places a plan order through the real form; returns the browser and the order row. */
export async function placeOrder(email: string, form: Record<string, string>) {
  const c = await customer(email);
  const reply = await c.post('/account/plan/request', {
    _csrf: await sessionCsrf(c, '/account/plan'),
    ...form,
  });
  assert.equal(reply.status, 302);
  const row = await prisma.upgradeRequest.findFirstOrThrow({
    where: { user: { email } },
    orderBy: { createdAt: 'desc' },
  });
  return { c, row };
}

/** The withdrawal through its confirmation page, with the token of that page. */
export async function withdraw(c: Browser, orderId: string): Promise<Reply> {
  return c.post(`/account/plan/withdraw/${orderId}`, {
    _csrf: await sessionCsrf(c, `/account/plan/withdraw/${orderId}`),
  });
}

/** A new project through the form on /app; returns its id. */
export async function newProject(b: Browser, type = 'base', name = 'Шкаф'): Promise<string> {
  const reply = await b.post('/app/projects', { _csrf: await sessionCsrf(b, '/app'), type, name });
  assert.equal(reply.status, 302, `project not created: ${reply.status}`);
  const id = /^\/app\/p\/([a-z0-9]+)$/.exec(reply.location)?.[1];
  assert.ok(id, `project not created: ${reply.location} (${b.flash() ?? 'no message'})`);
  return id;
}

/** What the editor page gives the save: its CSRF token and the version it opened (`base`). */
export async function openEditor(
  b: Browser,
  id: string,
): Promise<{ csrf: string; base: string; body: string }> {
  const page = await b.get(`/app/p/${id}`);
  assert.equal(page.status, 200, `editor of ${id}`);
  const csrf = /data-csrf="([^"]+)"/.exec(page.body)?.[1];
  assert.ok(csrf, 'the editor carries the CSRF token');
  const base =
    /&#34;updatedAt&#34;:&#34;([^&]+)&#34;|"updatedAt":"([^"]+)"/
      .exec(page.body)
      ?.slice(1)
      .find(Boolean) ?? '';
  return { csrf, base, body: page.body };
}

/** PUT of the editor's JSON save with the editor's token. */
export function saveProject(b: Browser, id: string, csrf: string, json: unknown): Promise<Reply> {
  return b.request('PUT', `/app/api/projects/${id}`, {
    json,
    headers: { 'x-csrf-token': csrf },
  });
}
