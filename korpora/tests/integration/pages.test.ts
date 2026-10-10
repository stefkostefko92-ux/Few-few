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

test('llms.txt is English throughout, the notes on the language versions too', async () => {
  const llms = await (await get('/llms.txt')).text();
  const notes = [...llms.matchAll(/^- \[Korpora \([^)]+\)\]\([^)]+\): (.+)$/gm)].map((m) => m[1]);
  assert.equal(notes.length, 3, 'one line per language version');
  assert.deepEqual([...new Set(notes)], ['product, prices, questions']);
});

test('the Bulgarian label „наш избор“ is marked as Bulgarian on the English and Italian landing', async () => {
  for (const path of ['/en/', '/it/']) {
    const page = await (await get(path)).text();
    assert.equal(page.split('наш избор').length - 1, 1, `${path}: the label once`);
    assert.match(page, /<span lang="bg">наш избор<\/span>/, path);
  }
  assert.match(await (await get('/')).text(), /„<span lang="bg">наш избор<\/span>“/);
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
    /<p class="secret"[^>]*>([A-Z2-7 ]+)<\/p>/.exec(start.body)?.[1]?.replace(/\s+/g, '') ?? '';
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

test('the read-out beside the story carries the example’s numbers from the engine, in every language', async () => {
  const { engine } = await import('../../src/services/engine.js');
  const { EXAMPLE } = await import('../../src/services/landing-assets.js');
  const api = engine();
  const model = api.buildModel(EXAMPLE);
  const nesting = api.nest(model) as unknown as {
    sheets: Array<{ w: number; h: number; yield: number; placements: unknown[] }>;
  };
  const sheet1 = nesting.sheets[0]!;
  const program = api.toGcode(model, sheet1 as never, {
    product: 'Korpora',
    hash: '',
    owner: '',
    date: '',
  }) as unknown as { moves: Array<{ type: string; at?: unknown }> };
  const size = api.typeDims(EXAMPLE.type, model.spec);
  const boards = model.parts as unknown as Array<{ stock: string; decor: string }>;
  const yieldPct = Math.round(
    (nesting.sheets.reduce((sum, sh) => sum + sh.yield, 0) / nesting.sheets.length) * 100,
  );
  const modules = api.kitchenModules(model.spec);
  const expected = [
    [
      modules.filter((m) => !m.drawers).length,
      EXAMPLE.moduleWidth,
      modules.filter((m) => m.drawers).length,
      EXAMPLE.drawerModuleWidth,
    ],
    [size.W, size.H, size.D],
    [model.parts.length],
    [new Set(boards.map((b) => `${b.stock}|${b.decor}`)).size],
    [nesting.sheets.length, sheet1.w, sheet1.h],
    [yieldPct],
    [sheet1.placements.length],
    [program.moves.filter((m) => m.type === 'drill' && m.at).length],
  ];
  // the numbers of a cell, whatever the language groups its thousands with
  const numbers = (text: string) =>
    (text.replace(/(\d)[,.   ](?=\d{3}(\D|$))/g, '$1').match(/\d+/g) ?? []).map(Number);
  for (const path of ['/', '/en/', '/it/']) {
    const page = await (await get(path)).text();
    const hud = /<div class="stage-hud" data-story-hud>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/.exec(
      page,
    )?.[1];
    assert.ok(hud, `${path}: the read-out`);
    const cells = [...hud.matchAll(/<dd[^>]*>([^<]*)<\/dd>/g)].map((m) => m[1]!.trim());
    assert.equal(cells.length, 9, path);
    assert.deepEqual(cells.slice(0, 8).map(numbers), expected, path);
    // the program's first move: the line the live scene starts from
    assert.match(cells[8]!, /^G[0-3]\b/, path);
  }
});

test('every landing image has a src, the page is cached only privately (it carries the CSP nonce) and the section menu opens without script', async () => {
  for (const path of ['/', '/en/', '/it/']) {
    const res = await get(path);
    assert.match(res.headers.get('cache-control') ?? '', /^private,/, path);
    // the body carries this response's nonce: an ETag of it would never match again
    assert.equal(res.headers.get('etag'), null, path);
    const page = await res.text();
    const imgs = page.match(/<img\b[^>]*>/g) ?? [];
    assert.ok(imgs.length > 0, path);
    for (const tag of imgs) assert.match(tag, /\ssrc="[^"]+"/, `${path}: ${tag.slice(0, 80)}`);
    assert.match(page, /<details class="site-menu">\s*<summary>[^<]+<\/summary>\s*<nav /, path);
  }
});

test('the generated files without a nonce keep their ETag and answer a conditional request with 304', async () => {
  for (const path of [
    '/sitemap.xml',
    '/robots.txt',
    '/llms.txt',
    '/site.webmanifest',
    '/media/door-elevation.svg',
  ]) {
    const first = await get(path);
    assert.equal(first.status, 200, path);
    const etag = first.headers.get('etag');
    assert.match(etag ?? '', /^W\/"/, path);
    // a browser revalidating an expired copy; without its own Cache-Control, fetch would add `no-cache` to a
    // conditional request (the Fetch standard), and a server must not answer that with 304
    const again = await get(path, { 'if-none-match': etag!, 'cache-control': 'max-age=0' });
    assert.equal(again.status, 304, path);
    assert.equal(await again.text(), '', path);
  }
  // a page with a nonce has none: a conditional request for it is a full page again
  const page = await get('/', { 'if-none-match': 'W/"0-x"', 'cache-control': 'max-age=0' });
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('etag'), null);
});
