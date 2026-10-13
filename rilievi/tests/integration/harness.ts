/**
 * Integration harness: the real app on a real PostgreSQL test database. Set before anything imports the
 * config: the tests run with their own random JWT secret and never touch the development database.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import type { Server } from 'node:http';
import type { Role } from '@prisma/client';

export const PORT = 4398;
export const BASE = `http://127.0.0.1:${PORT}`;
export const PASSWORD = 'Fune-Trefolo-Tenditore-7';

/** startApp() empties every table, so the database name has to say it is for tests (`…_test`, `…_ci`). */
export function assertTestDatabase(url: string): void {
  let name = '';
  try {
    name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  } catch {
    throw new Error('refusing to run: TEST_DATABASE_URL is not a valid URL');
  }
  if (!/(^|_)(test|ci)(_|$)/i.test(name)) {
    throw new Error(
      `refusing to empty the database "${name}": a test database name contains _test or _ci`,
    );
  }
}

process.env.NODE_ENV = 'test';
process.env.PUBLIC_BASE_URL = BASE;
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://rilievi:rilievi@127.0.0.1:55432/rilievi_test';
assertTestDatabase(process.env.DATABASE_URL);
process.env.JWT_SECRET = randomBytes(32).toString('hex');
process.env.LOG_LEVEL = 'silent';
process.env.PDF_FONT_DIR ??= '/usr/share/fonts/truetype/dejavu';
delete process.env.SMTP_HOST;

const { prisma } = await import('../../src/db.js');
const { createServer } = await import('../../src/server.js');
const { hashPassword } = await import('../../src/auth/password.js');
const { outbox } = await import('../../src/mail/mailer.js');
export { prisma, outbox };

let server: Server | null = null;

/** Clean schema and a listening server. Called once per test file. */
export async function startApp(): Promise<void> {
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], { env: process.env, stdio: 'ignore' });
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) {
    await prisma.$executeRawUnsafe(
      `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`,
    );
  }
  defaultAzienda = null;
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

let hashed: Promise<string> | null = null;
let userCounter = 0;
let aziendaCounter = 0;
let defaultAzienda: Promise<string> | null = null;

/** A company straight in the database (the companies page has its own tests). */
export async function makeAzienda(
  name = `Azienda ${++aziendaCounter} ${randomBytes(2).toString('hex')}`,
) {
  return prisma.azienda.create({ data: { name } });
}

/** The company every account of a test file lands in unless the test says otherwise. */
function defaultAziendaId(): Promise<string> {
  defaultAzienda ??= makeAzienda('Ascensori Prova').then((azienda) => azienda.id);
  return defaultAzienda;
}

/**
 * An account straight in the database (the invite flow has its own tests). MASTER is the portal owner
 * with no company; everyone else gets one membership with `role` in `aziendaId` or in the file's
 * default company. The returned object also carries that role and company, as the tests read them.
 */
export async function makeUser(role: Role, name = `${role} ${++userCounter}`, aziendaId?: string) {
  hashed ??= hashPassword(PASSWORD);
  const email = `${role.toLowerCase()}.${userCounter}.${randomBytes(3).toString('hex')}@rilievi.test`;
  const azienda = role === 'MASTER' ? null : (aziendaId ?? (await defaultAziendaId()));
  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash: await hashed,
      master: role === 'MASTER',
      ...(azienda ? { memberships: { create: { aziendaId: azienda, role } } } : {}),
    },
  });
  return { ...user, role, aziendaId: azienda };
}

export interface Reply {
  status: number;
  location: string;
  body: string;
  bytes: Buffer;
  headers: Headers;
}

let ipCounter = 0;

/** A browser: its own cookie jar and its own IP behind the proxy (per-IP limits stay per test). */
export class Browser {
  readonly cookies = new Map<string, string>();
  readonly ip: string;

  constructor() {
    ipCounter += 1;
    this.ip = `9.${Math.floor(ipCounter / 250) + 10}.${ipCounter % 250}.7`;
  }

  private cookieHeader(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  private remember(headers: Headers): void {
    for (const line of headers.getSetCookie()) {
      const [pair = ''] = line.split(';');
      const index = pair.indexOf('=');
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      if (!value || /max-age=0|expires=thu, 01 jan 1970/i.test(line)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  async request(
    method: string,
    path: string,
    options: { form?: Record<string, string | string[]>; headers?: Record<string, string> } = {},
  ): Promise<Reply> {
    const headers: Record<string, string> = {
      'x-forwarded-for': this.ip,
      cookie: this.cookieHeader(),
      ...options.headers,
    };
    let body: string | undefined;
    if (options.form) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(options.form)) {
        for (const item of Array.isArray(value) ? value : [value]) params.append(key, item);
      }
      body = params.toString();
      headers['content-type'] = 'application/x-www-form-urlencoded';
      headers.origin ??= BASE;
    }
    const response = await fetch(BASE + path, { method, headers, body, redirect: 'manual' });
    this.remember(response.headers);
    const bytes = Buffer.from(await response.arrayBuffer());
    return {
      status: response.status,
      location: response.headers.get('location') ?? '',
      body: response.headers.get('content-type')?.includes('pdf') ? '' : bytes.toString('utf8'),
      bytes,
      headers: response.headers,
    };
  }

  /** POST a multipart form (a file upload), with the session's CSRF token taken from `formPage`. */
  async upload(
    formPage: string,
    action: string,
    fields: Record<string, string>,
    file?: { field: string; name: string; type: string; bytes: Uint8Array },
  ): Promise<Reply> {
    const _csrf = await this.csrf(formPage);
    const form = new FormData();
    form.append('_csrf', _csrf);
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    if (file) form.append(file.field, new Blob([file.bytes], { type: file.type }), file.name);
    const response = await fetch(BASE + action, {
      method: 'POST',
      headers: { 'x-forwarded-for': this.ip, cookie: this.cookieHeader(), origin: BASE },
      body: form,
      redirect: 'manual',
    });
    this.remember(response.headers);
    const bytes = Buffer.from(await response.arrayBuffer());
    return {
      status: response.status,
      location: response.headers.get('location') ?? '',
      body: bytes.toString('utf8'),
      bytes,
      headers: response.headers,
    };
  }

  get(path: string, headers?: Record<string, string>): Promise<Reply> {
    return this.request('GET', path, { headers });
  }

  post(path: string, form: Record<string, string | string[]>, headers?: Record<string, string>) {
    return this.request('POST', path, { form, headers });
  }

  /** The CSRF token of the form on a page (session-bound or the pre-sign-in cookie). */
  async csrf(path: string): Promise<string> {
    const page = await this.get(path);
    const token = /name="_csrf" value="([^"]+)"/.exec(page.body)?.[1];
    assert.ok(token, `no CSRF token on ${path} (status ${page.status})`);
    return token;
  }

  async login(email: string, password = PASSWORD): Promise<Reply> {
    const _csrf = await this.csrf('/accesso');
    return this.post('/accesso', { _csrf, email, password, next: '/schede' });
  }

  /** POST a form with the session's CSRF token taken from `formPage`. */
  async submit(formPage: string, action: string, form: Record<string, string | string[]>) {
    const _csrf = await this.csrf(formPage);
    return this.post(action, { _csrf, ...form });
  }
}

/** A signed-in browser for a fresh account of the role (in `aziendaId` or the default company). */
export async function signedIn(role: Role, aziendaId?: string) {
  const user = await makeUser(role, undefined, aziendaId);
  const browser = new Browser();
  const reply = await browser.login(user.email);
  assert.equal(reply.status, 302, `login of ${role} failed with ${reply.status}`);
  return { user, browser };
}

/** The one-time link shown after an invite or a reset — as a path on the test server. */
export function linkFrom(body: string): string {
  const value = /<input class="input" id="link" type="text" readonly value="([^"]+)"/.exec(
    body,
  )?.[1];
  assert.ok(value, 'the page shows the link once');
  return new URL(value).pathname;
}
