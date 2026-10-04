import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { totpCode } from '../../src/auth/totp.js';
import {
  BASE,
  Browser,
  CUSTOMER_PASSWORD,
  linkIn,
  mailTo,
  prisma,
  startApp,
  stopApp,
} from './harness.js';
import { graph } from './json-ld.js';
import { customer, newProject, sessionCsrf } from './people.js';
import { enable2fa } from './twofa.js';

before(startApp);
after(stopApp);

const now = () => Math.floor(Date.now() / 1000);

test('two-factor sign-in: the code is required, a used code cannot be replayed, recovery codes work once', async () => {
  const b = await customer('twofa@example.test');
  const { secret, codes } = await enable2fa(b);
  assert.equal(codes.length, 10);
  const stored = await prisma.user.findUniqueOrThrow({ where: { email: 'twofa@example.test' } });
  assert.ok(
    stored.totpSecretEnc && !stored.totpSecretEnc.includes(secret),
    'secret encrypted at rest',
  );
  await mailTo('twofa@example.test', /Двуфакторната защита е включена/);

  const c = new Browser();
  const login = await c.login('twofa@example.test', CUSTOMER_PASSWORD);
  assert.match(login.location, /^\/login\/2fa/);
  assert.equal((await c.get('/app')).status, 302, 'no access before the second factor');
  const page = await c.get(login.location);
  const replay = await c.post('/login/2fa', {
    _csrf: Browser.csrf(page.body),
    next: '/app',
    code: totpCode(secret, now()),
  });
  assert.equal(replay.status, 401, 'the enrolment code cannot be used again');
  const recovery = await c.post('/login/2fa', {
    _csrf: Browser.csrf(page.body),
    next: '/app',
    code: codes[0] ?? '',
  });
  assert.equal(recovery.status, 302);
  assert.equal((await c.get('/app')).status, 200);

  const d = new Browser();
  const again = await d.login('twofa@example.test', CUSTOMER_PASSWORD);
  const page2 = await d.get(again.location);
  assert.equal(
    (
      await d.post('/login/2fa', {
        _csrf: Browser.csrf(page2.body),
        next: '/app',
        code: codes[0] ?? '',
      })
    ).status,
    401,
    'recovery code used up',
  );
});

test('five wrong codes end the half-open session', async () => {
  const b = await customer('mfa-reset@example.test');
  await enable2fa(b);
  const c = new Browser();
  const login = await c.login('mfa-reset@example.test', CUSTOMER_PASSWORD);
  const page = await c.get(login.location);
  const csrf = Browser.csrf(page.body);
  let last = 0;
  for (let i = 0; i < 5; i++)
    last = (await c.post('/login/2fa', { _csrf: csrf, next: '/app', code: '000000' })).status;
  assert.equal(last, 302, 'sent back to the sign-in');
  assert.equal((await c.get('/login/2fa')).location, '/login');
});

test('CSRF: no token, a wrong token or a foreign origin is refused', async () => {
  const b = await customer('csrf@example.test');
  const good = await sessionCsrf(b);
  assert.equal((await b.post('/account/profile', { name: 'Хакер', locale: 'bg' })).status, 403);
  assert.equal(
    (await b.post('/account/profile', { _csrf: 'x'.repeat(43), name: 'Хакер', locale: 'bg' }))
      .status,
    403,
  );
  assert.equal(
    (
      await b.post(
        '/account/profile',
        { _csrf: good, name: 'Хакер', locale: 'bg' },
        { origin: 'https://evil.example' },
      )
    ).status,
    403,
  );
  assert.equal(
    (await prisma.user.findUniqueOrThrow({ where: { email: 'csrf@example.test' } })).name,
    'Тест Клиент',
  );
  assert.equal(
    (await b.post('/account/profile', { _csrf: good, name: 'Ново Име', locale: 'bg' })).status,
    302,
  );
  const anon = new Browser();
  await anon.get('/login');
  assert.equal(
    (await anon.post('/login', { email: 'csrf@example.test', password: 'x' })).status,
    403,
    'pre-login forms need the double-submit token',
  );
});

test('/health names the app: the deploy tells Rendetto apart from another process on the port', async () => {
  const res = await fetch(`${BASE}/health`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await res.json(), { status: 'ok', app: 'rendetto' });
});

test('security headers on every kind of page', async () => {
  for (const path of ['/', '/login', '/health']) {
    const res = await fetch(`${BASE}${path}`);
    const csp = res.headers.get('content-security-policy') ?? '';
    assert.match(csp, /default-src 'self'/, path);
    assert.match(csp, /script-src 'self' 'nonce-/, path);
    assert.match(csp, /frame-ancestors 'none'/, path);
    assert.match(csp, /style-src-attr 'none'/, path);
    assert.equal(res.headers.get('x-frame-options'), 'DENY', path);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff', path);
    assert.match(res.headers.get('permissions-policy') ?? '', /camera=\(\)/, path);
    assert.equal(res.headers.get('x-powered-by'), null, path);
  }
  const page = await (await fetch(`${BASE}/`)).text();
  assert.doesNotMatch(
    page,
    /<script(?![^>]*nonce=)(?![^>]*type="application\/(ld\+)?json")[^>]*>/,
    'every inline script carries the nonce',
  );
  assert.doesNotMatch(page, / style="/, 'no inline style attributes under style-src-attr none');
});

test('session and device cookies are HttpOnly and SameSite', async () => {
  const b = new Browser();
  const login = await b.get('/login');
  const cookies = login.headers.getSetCookie().join('\n');
  assert.match(cookies, /rd_dev=[^;]+;[^\n]*HttpOnly[^\n]*SameSite=Lax/i);
  assert.match(cookies, /rd_pre=[^;]+;[^\n]*HttpOnly[^\n]*SameSite=Strict/i);
  await customer('cookies@example.test');
  const c = new Browser();
  const signed = await c.login('cookies@example.test', CUSTOMER_PASSWORD);
  assert.match(
    signed.headers.getSetCookie().join('\n'),
    /rd_sid=[^;]+;[^\n]*HttpOnly[^\n]*SameSite=Strict/i,
  );
});

test('the personal data export has everything about the person and no secrets', async () => {
  const b = await customer('export@example.test');
  await enable2fa(b);
  const res = await b.post('/account/data/export', {
    _csrf: await sessionCsrf(b, '/account/data'),
  });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /application\/json/);
  const data = JSON.parse(res.body) as Record<string, unknown>;
  assert.ok(data.account && data.projects && data.devices && data.logins);
  assert.doesNotMatch(res.body, /argon2|passwordHash|totpSecret|csrfToken|tokenHash|codeHash/i);
});

test('email change: the old address is told, the new one confirms', async () => {
  const b = await customer('old@example.test');
  const csrf = await sessionCsrf(b);
  const sent = await b.post('/account/email', {
    _csrf: csrf,
    email: 'new@example.test',
    password: CUSTOMER_PASSWORD,
  });
  assert.equal(sent.status, 302);
  assert.match((await mailTo('old@example.test', /смяна на имейла/)).text, /new@example\.test/);
  const link = linkIn(
    (await mailTo('new@example.test', /Потвърдете новия/)).text,
    '/verify-email?token=',
  );
  assert.equal(
    (await prisma.user.findUniqueOrThrow({ where: { email: 'old@example.test' } })).email,
    'old@example.test',
    'nothing changes before the confirmation',
  );
  assert.equal((await b.confirmEmail(link)).status, 200);
  assert.ok(await prisma.user.findUnique({ where: { email: 'new@example.test' } }));
});

test('deleting your own account needs the password and the tick, and removes the projects', async () => {
  const b = await customer('gone@example.test');
  await newProject(b, 'base', 'X');
  const csrf = await sessionCsrf(b, '/account/data');
  assert.equal(
    (
      await b.post('/account/data/delete', {
        _csrf: csrf,
        password: 'Wrong-Password-000',
        confirm: 'yes',
      })
    ).status,
    302,
  );
  assert.ok(
    await prisma.user.findUnique({ where: { email: 'gone@example.test' } }),
    'wrong password keeps the account',
  );
  const done = await b.post('/account/data/delete', {
    _csrf: csrf,
    password: CUSTOMER_PASSWORD,
    confirm: 'yes',
  });
  assert.equal(done.location, '/login');
  assert.equal(await prisma.user.findUnique({ where: { email: 'gone@example.test' } }), null);
  assert.equal(
    await prisma.project.count({ where: { name: 'X', user: { email: 'gone@example.test' } } }),
    0,
  );
});

test('a forged flash cookie cannot break or fake the page', async () => {
  for (const key of ['constructor', '__proto__', 'toString', 'no.such.key']) {
    const res = await fetch(`${BASE}/login`, {
      headers: {
        cookie: `rd_flash=${encodeURIComponent(JSON.stringify({ kind: 'ok', key, params: {} }))}`,
      },
    });
    assert.equal(res.status, 200, key);
    assert.doesNotMatch(await res.text(), /class="flash flash-ok"/, key);
  }
});

test('public SEO files', async () => {
  const robots = await (await fetch(`${BASE}/robots.txt`)).text();
  assert.match(robots, /Disallow: \/admin/);
  assert.match(robots, /Sitemap: http:\/\/127\.0\.0\.1:4399\/sitemap\.xml/);
  const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text();
  for (const path of ['/', '/en/', '/it/', '/privacy', '/en/terms'])
    assert.ok(sitemap.includes(`<loc>${BASE}${path}</loc>`), path);
  assert.match(sitemap, /hreflang="x-default"/);
  const llms = await (await fetch(`${BASE}/llms.txt`)).text();
  assert.match(llms, /30-day trial/);
  const home = await (await fetch(`${BASE}/en/`)).text();
  const types = graph(home).flatMap((node) => node['@type']);
  for (const type of [
    'Organization',
    'LocalBusiness',
    'WebSite',
    'WebPage',
    'BreadcrumbList',
    'SoftwareApplication',
    'HowTo',
    'FAQPage',
  ])
    assert.ok(types.includes(type), type);
  assert.match(
    home,
    /<link rel="alternate" hreflang="it" href="http:\/\/127\.0\.0\.1:4399\/it\/">/,
  );
  assert.match(
    home,
    /Created and Designed by <a href="https:\/\/carbonstealth\.eu" target="_blank" rel="noopener">Carbon Stealth VCC<\/a>/,
  );
});
