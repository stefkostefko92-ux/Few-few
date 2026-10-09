/**
 * Integration harness: the real app on a real PostgreSQL test database. Set before anything imports the
 * config: the tests run with their own random keys and never touch the development database.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import type { Server } from 'node:http';
import { unzipSync } from 'fflate';

export const PORT = 4399;
export const BASE = `http://127.0.0.1:${PORT}`;
/** The password customer() signs up with and the one staff() signs in with. */
export const CUSTOMER_PASSWORD = 'Shelf-Hinge-Groove-42';
export const STAFF_PASSWORD = 'Oak-Router-Plane-37';
/** The team's inbox for order and withdrawal notices — pinned, whatever the shell exports. */
export const STAFF_INBOX = 'info@carbonstealth.eu';

/**
 * startApp() empties every table, so the database has to say by its name that it is for tests
 * (`korpora_test`, `korpora_ci_…`): a production or development URL in TEST_DATABASE_URL wipes nothing.
 * The message names the database only — the URL carries the password.
 */
export function assertTestDatabase(url: string): void {
  let name = '';
  try {
    name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  } catch {
    throw new Error('refusing to run: TEST_DATABASE_URL is not a valid URL');
  }
  if (!/(^|_)(test|ci)(_|$)/i.test(name))
    throw new Error(
      `refusing to empty the database "${name}": the name of a test database contains _test or _ci`,
    );
}

process.env.NODE_ENV = 'test';
process.env.PUBLIC_BASE_URL = BASE;
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://korpora:korpora_dev@127.0.0.1:5432/korpora_test';
assertTestDatabase(process.env.DATABASE_URL);
process.env.ENC_KEY = randomBytes(32).toString('hex');
process.env.HMAC_KEY = randomBytes(32).toString('hex');
process.env.BREACH_CHECK = 'false';
process.env.KORPORA_DEV_OUTBOX = '0';
process.env.LOG_LEVEL = 'silent';
process.env.CONTACT_EMAIL = STAFF_INBOX;

const { prisma } = await import('../../src/db.js');
const { createServer } = await import('../../src/server.js');
const { loadEngine } = await import('../../src/services/engine.js');
const { loadGeoIp, geoIpReady } = await import('../../src/auth/geoip.js');
const { outbox } = await import('../../src/mail/mailer.js');
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
  // a taken port fails the file here, loudly: otherwise the tests would talk to whatever listens there
  await new Promise<void>((resolve, reject) => {
    const app = createServer().listen(PORT, '127.0.0.1', () => resolve());
    app.once('error', (error) =>
      reject(new Error(`the test app cannot listen on ${PORT}: ${error.message}`)),
    );
    server = app;
  });
}

export async function stopApp(): Promise<void> {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  await prisma.$disconnect();
}

export interface Reply {
  status: number;
  location: string;
  /** The text of the answer; empty for a ZIP (its bytes are in `bytes`). */
  body: string;
  bytes: Buffer;
  headers: Headers;
}

/** A browser: a cookie jar, an IP behind the proxy and a device fingerprint. */
let ipCounter = 0;
/** A fresh public-looking address per browser, so the per-IP rate limits of one test do not hit the next. */
export function nextIp(): string {
  ipCounter += 1;
  return `9.${Math.floor(ipCounter / 250) + 10}.${ipCounter % 250}.7`;
}

export interface RequestInit {
  form?: Record<string, string>;
  json?: unknown;
  /** A JSON body sent as it is — for keys like `__proto__` that JSON.stringify would not send. */
  raw?: string;
  headers?: Record<string, string>;
}

/** Where a browser goes: the app's address and the origin it sends (PUBLIC_BASE_URL of that app). */
export interface Site {
  base: string;
  origin: string;
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
    readonly site: Site = { base: BASE, origin: BASE },
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

  async request(method: string, path: string, init: RequestInit = {}): Promise<Reply> {
    const headers: Record<string, string> = {
      'x-forwarded-for': this.ip,
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0 Safari/537.36',
      cookie: [...this.cookies].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; '),
      ...init.headers,
    };
    let body: string | undefined;
    if (init.form) {
      headers['content-type'] = 'application/x-www-form-urlencoded';
      headers.origin ??= this.site.origin;
      body = new URLSearchParams(init.form).toString();
    } else if (init.json !== undefined || init.raw !== undefined) {
      headers['content-type'] = 'application/json';
      headers.origin ??= this.site.origin;
      body = init.raw ?? JSON.stringify(init.json);
    }
    const res = await fetch(`${this.site.base}${path}`, {
      method,
      headers,
      body,
      redirect: 'manual',
    });
    this.store(res);
    const bytes = Buffer.from(await res.arrayBuffer());
    return {
      status: res.status,
      location: res.headers.get('location') ?? '',
      body: res.headers.get('content-type')?.includes('zip') ? '' : bytes.toString('utf8'),
      bytes,
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

  /** The key of the one-time message the last answer left (the flash cookie), or null. */
  flash(): string | null {
    const raw = this.cookies.get('rd_flash');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { key?: unknown };
    return typeof parsed.key === 'string' ? parsed.key : null;
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

  /** The link from the email only shows a button (GET uses nothing up); the button confirms. */
  async confirmEmail(link: string): Promise<Reply> {
    const page = await this.get(link);
    if (page.status !== 200) return page;
    const token = /name="token" value="([^"]+)"/.exec(page.body)?.[1] ?? '';
    return this.post('/verify-email', { _csrf: Browser.csrf(page.body), token });
  }

  /**
   * The sign-up form. The fingerprint goes along either way, as an old cached script would send it:
   * the server keeps it only when the separate consent box is ticked (`deviceConsent`).
   */
  async register(
    name: string,
    email: string,
    password: string,
    deviceConsent = false,
  ): Promise<Reply> {
    return this.submit('/register', '/register', {
      name,
      email,
      password,
      terms: 'yes',
      ...(deviceConsent ? { deviceConsent: 'yes' } : {}),
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

export type SentMail = (typeof outbox)[number];

/** Mail goes out after the response (fire and forget), so wait for it a little. */
export async function mailTo(email: string, subject: RegExp, timeoutMs = 3000): Promise<SentMail> {
  const start = Date.now();
  for (;;) {
    const found = [...outbox].reverse().find((m) => m.to === email && subject.test(m.subject));
    if (found) return found;
    if (Date.now() - start > timeoutMs) throw new Error(`no mail ${subject} to ${email}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/** Forgets the mail sent so far to the address — so a later mailTo() finds only a new one. */
export function forgetMailTo(email: string): void {
  for (let i = outbox.length - 1; i >= 0; i--) if (outbox[i]?.to === email) outbox.splice(i, 1);
}

export function linkIn(text: string | undefined, path: string): string {
  const match = new RegExp(`https?://[^\\s]+(${path.replace('?', '\\?')}[^\\s]*)`).exec(text ?? '');
  if (!match?.[1]) throw new Error(`no ${path} link in the email`);
  return match[1];
}

/** The files of a ZIP answer by name, as text (README, CSV, SVG, DXF and G-code are all text). */
export function unzip(reply: Reply): Map<string, string> {
  assert.equal(reply.status, 200, 'the ZIP was not served');
  assert.match(reply.headers.get('content-type') ?? '', /zip/);
  const files = unzipSync(new Uint8Array(reply.bytes));
  return new Map(
    Object.entries(files).map(([name, data]) => [name, Buffer.from(data).toString('utf8')]),
  );
}
