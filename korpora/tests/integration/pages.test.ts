import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { totpCode } from '../../src/auth/totp.js';
import { BASE, Browser, CUSTOMER_PASSWORD, linkIn, mailTo, startApp, stopApp } from './harness.js';
import { startChildApp } from './child.js';
import { customer, sessionCsrf } from './people.js';

before(startApp);
after(stopApp);

const get = (path: string, headers: Record<string, string> = {}) =>
  fetch(`${BASE}${path}`, { redirect: 'manual', headers });
const LANGS = '<nav class="langs"';

test('a landing or legal address in another spelling moves to the canonical one with its query', async () => {
  for (const [from, to] of [
    ['/en?utm_source=x&gclid=1', '/en/?utm_source=x&gclid=1'],
    ['/EN/?utm_source=x', '/en/?utm_source=x'],
    ['/privacy/?utm_medium=mail', '/privacy?utm_medium=mail'],
    ['/it', '/it/'],
  ] as const) {
    const res = await get(from);
    assert.equal(res.status, 301, from);
    assert.equal(res.headers.get('location'), to, from);
  }
  assert.equal((await get('/en/?utm_source=x')).status, 200, 'the canonical address itself');
});

test('robots.txt opens the touch icon that the /app rule would otherwise hide', async () => {
  const robots = await (await get('/robots.txt')).text();
  const lines = robots.split('\n');
  assert.ok(lines.includes('Allow: /apple-touch-icon.png'));
  assert.ok(lines.includes('Disallow: /app'));
});

test('an unknown address is a 404 in the language of the browser, with the footer and a way home', async () => {
  const res = await get('/en/nope', { 'accept-language': 'en-GB,en;q=0.9' });
  assert.equal(res.status, 404);
  const page = await res.text();
  assert.match(page, /<meta name="robots" content="noindex/);
  assert.ok(page.includes('<a href="/en/">'), 'a link to the English home page');
  const foot = /<footer class="foot">([\s\S]*?)<\/footer>/.exec(page)?.[1] ?? '';
  assert.ok(foot.includes('href="/en/privacy"') && foot.includes('href="/en/terms"'), foot);
  assert.match(
    foot,
    /Created and Designed by <a href="https:\/\/carbonstealth\.eu"[^>]*>Carbon Stealth VCC<\/a>/,
  );
});

test('the privacy policy states the audit retention the maintenance deletes by', async () => {
  const kept = (page: string) =>
    /Записите се пазят ([^,]+?), след което се изтриват/.exec(page)?.[1];
  assert.equal(kept(await (await get('/privacy')).text()), '5 години', 'the default, 1825 days');
  assert.match(await (await get('/en/privacy')).text(), /Entries are kept for 5 years/);
  const other = await startChildApp({ AUDIT_RETENTION_DAYS: '1000' });
  try {
    const page = await (await fetch(`${other.site.base}/privacy`)).text();
    assert.equal(kept(page), '1000 дни', 'a period that is not whole years is said in days');
  } finally {
    await other.stop();
  }
});

test('one-time pages (QR, recovery codes, a used confirmation link) have no language switcher', async () => {
  const b = await customer('langs@example.test');
  assert.ok((await b.get('/account/security')).body.includes(LANGS), 'a normal page has one');
  const start = await b.post('/account/security/2fa/start', {
    _csrf: await sessionCsrf(b, '/account/security'),
    password: CUSTOMER_PASSWORD,
  });
  assert.equal(start.status, 200);
  assert.ok(!start.body.includes(LANGS), 'the QR page');
  const secret =
    /<p class="secret">([A-Z2-7 ]+)<\/p>/.exec(start.body)?.[1]?.replace(/\s+/g, '') ?? '';
  const codes = await b.post('/account/security/2fa/confirm', {
    _csrf: Browser.csrf(start.body),
    code: totpCode(secret, Math.floor(Date.now() / 1000)),
  });
  assert.equal(codes.status, 200);
  assert.match(codes.body, /<li>[A-Za-z0-9-]{8,}<\/li>/);
  assert.ok(!codes.body.includes(LANGS), 'the recovery codes page');

  const fresh = new Browser();
  await fresh.register('Нов', 'langs-verify@example.test', CUSTOMER_PASSWORD);
  const link = linkIn(
    (await mailTo('langs-verify@example.test', /Потвърдете имейла/)).text,
    '/verify-email?token=',
  );
  const button = await fresh.get(link);
  assert.ok(button.body.includes(LANGS), 'the button page can be opened again');
  const done = await fresh.confirmEmail(link);
  assert.equal(done.status, 200);
  assert.ok(!done.body.includes(LANGS), 'the page after the link is used');
});
