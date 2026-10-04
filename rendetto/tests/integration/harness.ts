/**
 * Integration harness: the real app on a real PostgreSQL test database. Set before anything imports the
 * config: the tests run with their own random keys and never touch the development database.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export const PORT = 4399;
export const BASE = `http://127.0.0.1:${PORT}`;

process.env.NODE_ENV = 'test';
process.env.PUBLIC_BASE_URL = BASE;
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://rendetto:rendetto_dev@127.0.0.1:5432/rendetto_test';
process.env.ENC_KEY = randomBytes(32).toString('hex');
process.env.HMAC_KEY = randomBytes(32).toString('hex');
process.env.BREACH_CHECK = 'false';
process.env.RENDETTO_DEV_OUTBOX = '0';
process.env.LOG_LEVEL = 'silent';

const { prisma } = await import('../../src/db.js');
const { createServer } = await import('../../src/server.js');
const { loadEngine } = await import('../../src/services/engine.js');
const { loadGeoIp } = await import('../../src/auth/geoip.js');
const { outbox } = await import('../../src/mail/mailer.js');
const { geoIpReady } = await import('../../src/auth/geoip.js');
export { prisma, outbox };

/** The expected country of 8.8.8.8 — or null when the GeoIP base is not present (then nothing is looked up). */
export function expectedCountry(): string | null {
  return geoIpReady() ? 'US' : null;
}

let server: Server | null = null;

/** Clean schema, engine and GeoIP loaded, server listening. Called once per test file. */
export async function startApp(): Promise<void> {
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], { env: process.env, stdio: 'ignore' });
  const tables = await prisma.$queryRaw<
    Array<{ tablename: string }>
  >`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length)
    await prisma.$executeRawUnsafe(
      `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`,
    );
  await loadEngine();
  await loadGeoIp();
  await new Promise<void>((resolve) => {
    server = createServer().listen(PORT, '127.0.0.1', () => resolve());
  });
  const address = server?.address() as AddressInfo | null;
  if (!address) throw new Error('server did not start');
}

export async function stopApp(): Promise<void> {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  await prisma.$disconnect();
}

export interface Reply {
  status: number;
  location: string;
  body: string;
  headers: Headers;
}

/** A browser: a cookie jar, an IP behind the proxy and a device fingerprint. */
let ipCounter = 0;
/** A fresh public-looking address per browser, so the per-IP rate limits of one test do not hit the next. */
export function nextIp(): string {
  ipCounter += 1;
  return `9.${Math.floor(ipCounter / 250) + 10}.${ipCounter % 250}.7`;
}

export class Browser {
  readonly cookies = new Map<string, string>();
  constructor(
    readonly ip = nextIp(),
    readonly fingerprint = {
      platform: 'Win32',
      cores: 8,
      memory: 8,
      screen: '1920x1080',
      depth: 24,
      gpu: 'ANGLE (Intel)',
    },
  ) {}

  private store(res: Response): void {
    for (const line of res.headers.getSetCookie()) {
      const [pair = ''] = line.split(';');
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq).trim();
      const value = decodeURIComponent(pair.slice(eq + 1).trim());
      if (/max-age=0|expires=thu, 01 jan 1970/i.test(line) || value === '')
        this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  async request(
    method: string,
    path: string,
    init: { form?: Record<string, string>; json?: unknown; headers?: Record<string, string> } = {},
  ): Promise<Reply> {
    const headers: Record<string, string> = {
      'x-forwarded-for': this.ip,
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0 Safari/537.36',
      cookie: [...this.cookies].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; '),
      ...init.headers,
    };
    let body: string | undefined;
    if (init.form) {
      headers['content-type'] = 'application/x-www-form-urlencoded';
      headers.origin ??= BASE;
      body = new URLSearchParams(init.form).toString();
    } else if (init.json !== undefined) {
      headers['content-type'] = 'application/json';
      headers.origin ??= BASE;
      body = JSON.stringify(init.json);
    }
    const res = await fetch(`${BASE}${path}`, { method, headers, body, redirect: 'manual' });
    this.store(res);
    const text = res.headers.get('content-type')?.includes('zip') ? '' : await res.text();
    return {
      status: res.status,
      location: res.headers.get('location') ?? '',
      body: text,
      headers: res.headers,
    };
  }

  get(path: string, headers?: Record<string, string>): Promise<Reply> {
    return this.request('GET', path, { headers });
  }

  post(
    path: string,
    form: Record<string, string>,
    headers?: Record<string, string>,
  ): Promise<Reply> {
    return this.request('POST', path, { form, headers });
  }

  /** The CSRF token of the page: the hidden `_csrf` field (pre-login cookie value or session token). */
  static csrf(html: string): string {
    const match = /name="_csrf" value="([^"]+)"/.exec(html);
    if (!match?.[1]) throw new Error('no _csrf on the page');
    return match[1];
  }

  /** GET the page, then POST the form with its CSRF token. */
  async submit(pagePath: string, action: string, form: Record<string, string>): Promise<Reply> {
    const page = await this.get(pagePath);
    return this.post(action, { _csrf: Browser.csrf(page.body), ...form });
  }

  async register(name: string, email: string, password: string): Promise<Reply> {
    return this.submit('/register', '/register', {
      name,
      email,
      password,
      terms: 'yes',
      fp: JSON.stringify(this.fingerprint),
    });
  }

  async login(email: string, password: string): Promise<Reply> {
    return this.submit('/login', '/login', {
      email,
      password,
      next: '',
      fp: JSON.stringify(this.fingerprint),
    });
  }
}

export function lastMailTo(email: string): { subject: string; text: string } | undefined {
  return [...outbox].reverse().find((m) => m.to === email);
}

/** Mail goes out after the response (fire and forget), so wait for it a little. */
export async function mailTo(
  email: string,
  subject: RegExp,
  timeoutMs = 3000,
): Promise<{ subject: string; text: string }> {
  const start = Date.now();
  for (;;) {
    const found = [...outbox].reverse().find((m) => m.to === email && subject.test(m.subject));
    if (found) return found;
    if (Date.now() - start > timeoutMs) throw new Error(`no mail ${subject} to ${email}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

export function linkIn(text: string | undefined, path: string): string {
  const match = new RegExp(`https?://[^\\s]+(${path.replace('?', '\\?')}[^\\s]*)`).exec(text ?? '');
  if (!match?.[1]) throw new Error(`no ${path} link in the email`);
  return match[1];
}

/** A verified customer with a signed-in browser. */
export async function customer(
  email: string,
  password = 'Shelf-Hinge-Groove-42',
  ip = nextIp(),
): Promise<Browser> {
  const browser = new Browser(ip);
  await browser.register('Тест Клиент', email, password);
  await browser.get(
    linkIn((await mailTo(email, /Потвърдете имейла/)).text, '/verify-email?token='),
  );
  const login = await browser.login(email, password);
  if (login.status !== 302) throw new Error(`login failed with ${login.status}`);
  return browser;
}

/** A team member with two-factor protection already on, signed in through the real login and 2FA forms. */
export async function staff(
  role: 'VIEWER' | 'ANALYST' | 'SUPPORT' | 'MANAGER' | 'ADMIN' | 'OWNER',
  email: string,
  password = 'Oak-Router-Plane-37',
): Promise<{ browser: Browser; id: string; secret: string }> {
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
  const browser = new Browser('1.1.1.1');
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
  return { browser, id: user.id, secret };
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

/** The session CSRF token from any signed-in page. */
export async function sessionCsrf(browser: Browser, path = '/account'): Promise<string> {
  return Browser.csrf((await browser.get(path)).body);
}

/** Turns two-factor protection on through the real forms; returns the secret and the recovery codes. */
export async function enable2fa(
  b: Browser,
  password = 'Shelf-Hinge-Groove-42',
): Promise<{ secret: string; codes: string[] }> {
  const { totpCode } = await import('../../src/auth/totp.js');
  const csrf = await sessionCsrf(b, '/account/security');
  const page = await b.post('/account/security/2fa/start', { _csrf: csrf, password });
  assert.equal(
    page.status,
    200,
    'the setup is shown in the answer, never stored in a page you can reload',
  );
  const secret =
    /<p class="secret">([A-Z2-7 ]+)<\/p>/.exec(page.body)?.[1]?.replace(/\s+/g, '') ?? '';
  assert.ok(secret.length >= 32, 'secret shown once for manual entry');
  const confirm = await b.post('/account/security/2fa/confirm', {
    _csrf: Browser.csrf(page.body),
    code: totpCode(secret, Math.floor(Date.now() / 1000)),
  });
  assert.equal(confirm.status, 200);
  const codes = [...confirm.body.matchAll(/<li>([A-Za-z0-9-]{8,})<\/li>/g)].map((m) => m[1] ?? '');
  return { secret, codes };
}
