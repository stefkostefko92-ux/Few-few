// The smoke test's public part, before any sign-in: the health check, the public page (CSP with a nonce, in Italian —
// the only language —, its header on a phone), the former languages sent for good to the same page in Italian without a
// language cookie, and an unknown address drawn as the Italian 404. Returns the page (and its console errors) the rest
// of the test goes on with.
import assert from 'node:assert/strict';
import { step } from './smoke-kit.mjs';

export async function publicPages({ BASE, browser, newPage }) {
  step('health');
  const health = await (await fetch(`${BASE}/api/health`)).json();
  assert.equal(health.status, 'ok');
  assert.equal(health.app, 'liftpilot');

  step('public page');
  const { page, errors } = await newPage(browser);
  const res = await page.goto(`${BASE}/it`);
  assert.equal(res.status(), 200);
  assert.ok((res.headers()['content-security-policy'] ?? '').includes("'nonce-"), 'CSP with nonce');
  assert.equal(await page.locator('h1').count(), 1);
  // Italian only: the page's language, no language switch, no alternates in other languages, the Italian preview
  assert.equal(await page.getAttribute('html', 'lang'), 'it');
  assert.equal(await page.locator('.langs, a[hreflang], link[rel="alternate"][hreflang]').count(), 0, 'no other language');
  assert.equal(await page.getAttribute('meta[property="og:locale"]', 'content'), 'it_IT');
  assert.match(await page.getAttribute('meta[property="og:image"]', 'content') ?? '', /\/img\/og-it\.png$/);
  // the sign-in family's header keeps its sign-up button on a phone
  {
    const size = page.viewportSize();
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ['/it/login', '/it/register']) {
      await page.goto(`${BASE}${path}`);
      const over = await page.evaluate(() => globalThis.document.documentElement.scrollWidth - globalThis.innerWidth);
      assert.ok(over <= 0, `${path} at 390 px scrolls sideways by ${over} px`);
      assert.ok(await page.locator('.nav-drawer > summary').isVisible(), `${path} at 390 px: the menu button`);
    }
    if (size) await page.setViewportSize(size);
  }

  step('the former languages: a permanent redirect to the same page in Italian, the query kept; no language cookie');
  for (const [from, to] of [['/en', '/it'], ['/bg', '/it'], ['/en/login', '/it/login'], ['/bg/pricing?x=1', '/it/pricing?x=1'],
    ['/bg/app/projects/abc', '/it/app/projects/abc'], ['/en/privacy?y=2#terms', '/it/privacy?y=2'], ['/EN/pricing', '/it/pricing']]) {
    const r = await fetch(`${BASE}${from}`, { redirect: 'manual' });
    assert.equal(r.status, 301, `${from}: ${r.status}`);
    const at = new URL(r.headers.get('location') ?? '', BASE);
    assert.equal(`${at.pathname}${at.search}`, to, `${from} → ${at.href}`);
  }
  // and the page it leads to is there (one hop)
  assert.equal((await fetch(`${BASE}/bg/pricing?x=1`)).status, 200);
  // no language cookie any more: none set, with or without a language asked, and the one a browser kept from the time
  // with three languages removed
  for (const al of ['', 'bg-BG,bg;q=0.9', 'it-IT']) {
    const r = await fetch(`${BASE}/it`, { headers: { 'accept-language': al }, redirect: 'manual' });
    assert.ok(!/NEXT_LOCALE=[^;]/.test(r.headers.get('set-cookie') ?? ''), `no language cookie (accept-language «${al}»)`);
  }
  const kept = (await fetch(`${BASE}/it`, { headers: { cookie: 'NEXT_LOCALE=en' }, redirect: 'manual' })).headers.get('set-cookie') ?? '';
  assert.match(kept, /NEXT_LOCALE=;[^,]*Expires=Thu, 01 Jan 1970/i, `the old language cookie removed: ${kept}`);
  // and the terms in force say so: one cookie (the session's), Italian only, the colleagues' four roles; the DSA point of
  // contact for the authorities keeps Bulgarian and English
  {
    const terms = await (await fetch(`${BASE}/it/privacy`)).text();
    assert.ok(!terms.includes('NEXT_LOCALE') && !/inglese (?:e|o) bulgaro/.test(terms), 'the terms speak of no other language');
    assert.ok(terms.includes('Capotecnico, Progettista, Tecnico o Commerciale'), 'the terms name the four roles');
    assert.ok(terms.includes('in bulgaro, in inglese o in italiano'), 'DSA art. 11: the authorities’ languages');
    assert.ok(!terms.includes('/api/terms/'), 'the version in force links no other language');
  }
  // an earlier version, accepted also in English or Bulgarian: its page links those texts, served as plain-text records
  {
    const v4 = await (await fetch(`${BASE}/it/privacy/4`)).text();
    assert.ok(v4.includes('/api/terms/4/en') && v4.includes('/api/terms/4/bg'), 'version 4 links its English and Bulgarian texts');
    const en = await fetch(`${BASE}/api/terms/4/en`);
    assert.equal(en.status, 200, '/api/terms/4/en');
    assert.match(en.headers.get('content-type') ?? '', /^text\/plain; charset=utf-8/);
    assert.match(en.headers.get('x-robots-tag') ?? '', /noindex/);
    assert.ok((await en.text()).startsWith('Privacy and terms of use\nVersion 4 of'), 'the English text as kept');
    for (const bad of ['/api/terms/5/en', '/api/terms/4/it', '/api/terms/9/bg', '/api/terms/4/de']) assert.equal((await fetch(`${BASE}${bad}`)).status, 404, bad);
  }
  step('an unknown address: the 404 drawn in Italian, also from a former-language address');
  // Next 15 sends its error shell for a notFound() (no lang, noindex) and the browser draws the localized page — in
  // Italian, with the page's language (docs/rules.md)
  {
    const { page: lost } = await newPage(browser);
    for (const path of ['/it/pagina-inesistente', '/en/pagina-inesistente']) {
      assert.equal((await lost.goto(`${BASE}${path}`)).status(), 404, path);
      assert.equal(new URL(lost.url()).pathname, '/it/pagina-inesistente', `${path}: the address in Italian`);
      await lost.waitForSelector('main h1');
      assert.equal(await lost.getAttribute('html', 'lang'), 'it', `${path}: the 404 drawn in Italian`);
      assert.equal((await lost.textContent('main h1'))?.trim(), 'Pagina non trovata', path);
      const robots = await lost.locator('meta[name="robots"]').evaluateAll((ms) => ms.map((m) => m.getAttribute('content') ?? ''));
      assert.ok(robots.some((r) => /noindex/.test(r)), `${path}: noindex (${robots.join(' | ')})`);
    }
    await lost.close();
  }
  return { page, errors };
}
