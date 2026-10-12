import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Browser, BASE, prisma, signedIn, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

const REQUEST = {
  lang: 'en',
  name: 'Giulia Verdi',
  company: 'Ascensori Verdi Srl',
  email: 'Giulia.Verdi@Example.IT',
  phone: '+39 02 1234 5678',
  city: 'Milano',
  teamSize: 'S6_20',
  message: 'We maintain 140 lifts.',
  privacy: 'si',
};

/** Submits the access request form of the page `from`, as a browser would (pre-sign-in CSRF). */
async function sendRequest(browser: Browser, form: Record<string, string>, from = '/en/') {
  const _csrf = await browser.csrf(from);
  return browser.post('/richiesta-accesso', { _csrf, website: '', ...form });
}

describe('the public pages', () => {
  it('are indexable, canonical, in three languages, with the full SEO set and no app links', async () => {
    const browser = new Browser();
    for (const [path, lang] of [
      ['/', 'it'],
      ['/bg/', 'bg'],
      ['/en/', 'en'],
    ] as const) {
      const page = await browser.get(path);
      assert.equal(page.status, 200, path);
      assert.match(page.body, new RegExp(`<html lang="${lang}"`));
      assert.match(page.body, /<meta name="robots" content="index, follow">/);
      assert.match(page.body, new RegExp(`<link rel="canonical" href="${BASE}${path}">`));
      assert.match(page.body, new RegExp(`hreflang="x-default" href="${BASE}/"`));
      assert.match(page.body, /<meta property="og:image" content="[^"]+\/static\/img\/og\.png">/);
      assert.match(page.body, /<meta name="twitter:card" content="summary_large_image">/);
      assert.match(page.body, /<meta name="geo\.region" content="BG-10">/);
      assert.match(page.body, /<script type="application\/ld\+json" nonce="[^"]+">/);
      assert.match(page.body, /"@type":"FAQPage"/);
      assert.equal(page.body.match(/<h1[ >]/g)?.length, 1, `${path}: one h1`);
      assert.match(page.body, /<meta name="keywords" content="Carbon Stealth, /);
      assert.match(
        page.body,
        /Created and Designed by <a href="https:\/\/carbonstealth.eu" target="_blank" rel="noopener">Carbon Stealth VCC<\/a>/,
      );
      assert.match(page.body, new RegExp(`href="/accesso\\?lang=${lang}"`));
    }
    const noSlash = await browser.get('/bg');
    assert.equal(noSlash.status, 301);
    assert.equal(noSlash.location, '/bg/');
  });

  it('send a signed-in person from the root straight to the sheets, as before', async () => {
    const { browser } = await signedIn('TECNICO');
    const root = await browser.get('/');
    assert.equal(root.status, 302);
    assert.equal(root.location, '/schede');
    const en = await browser.get('/en/');
    assert.equal(en.status, 200);
    assert.match(en.body, /href="\/schede"/);
  });

  it('publish the privacy policy with the controller and the real retention times', async () => {
    const page = await new Browser().get('/privacy');
    assert.equal(page.status, 200);
    assert.match(page.body, /<meta name="robots" content="index, follow">/);
    assert.match(page.body, /208725180/);
    assert.match(page.body, /180 giorni dall(&#39;|')ultima modifica/);
    assert.match(page.body, /__Host-rilievi_pre/);
    assert.match(page.body, /mailto:privacy@carbonstealth\.eu/);
  });

  it('serve robots.txt, sitemap.xml, llms.txt and the IndexNow key', async () => {
    const browser = new Browser();
    const robots = await browser.get('/robots.txt');
    assert.match(robots.body, /^User-agent: \*\nAllow: \/\$\n/);
    assert.match(robots.body, /\nDisallow: \/\n/);
    const sitemap = await browser.get('/sitemap.xml');
    assert.equal(sitemap.headers.get('content-type'), 'application/xml; charset=utf-8');
    assert.match(sitemap.body, new RegExp(`<loc>${BASE}/en/</loc>`));
    const llms = await browser.get('/llms.txt');
    assert.match(llms.body, /^# Rilievi Impianti by Carbon Stealth/);
    const key = (await browser.get('/indexnow-key.txt')).body;
    assert.match(key, /^[a-f0-9]{32}$/);
    assert.equal((await browser.get(`/${key}.txt`)).body, key);
  });

  it('keep the portal itself out of the index', async () => {
    const page = await new Browser().get('/accesso');
    assert.match(page.body, /<meta name="robots" content="noindex, nofollow">/);
    const sent = await new Browser().get('/richiesta-inviata');
    assert.match(sent.body, /<meta name="robots" content="noindex, nofollow">/);
  });
});

describe('the access request', () => {
  it('is saved once per waiting email, with the page language, and the visitor sees "sent"', async () => {
    const browser = new Browser();
    const reply = await sendRequest(browser, REQUEST);
    assert.equal(reply.status, 303);
    assert.equal(reply.location, '/en/richiesta-inviata');
    const again = await sendRequest(new Browser(), { ...REQUEST, message: 'Second try.' }, '/');
    assert.equal(again.status, 303);
    const rows = await prisma.accessRequest.findMany({
      where: { email: 'giulia.verdi@example.it' },
    });
    assert.equal(rows.length, 1, 'the second request updates the waiting one');
    assert.equal(rows[0]?.status, 'NEW');
    assert.equal(rows[0]?.message, 'Second try.');
    assert.equal(rows[0]?.teamSize, 'S6_20');
    assert.equal(rows[0]?.locale, 'en');
    const audit = await prisma.auditLog.findMany({ where: { targetId: rows[0]?.id } });
    assert.deepEqual(audit.map((entry) => entry.action).sort(), [
      'ACCESS_REQUEST',
      'ACCESS_REQUEST_UPDATE',
    ]);
    assert.ok(audit.every((entry) => entry.actorId === null && entry.aziendaId === null));
  });

  it('keeps one waiting request when the same email is sent twice at once (double click)', async () => {
    const browser = new Browser();
    const _csrf = await browser.csrf('/en/');
    const form = { _csrf, website: '', ...REQUEST, email: 'double.click@example.it' };
    const replies = await Promise.all([
      browser.post('/richiesta-accesso', form),
      browser.post('/richiesta-accesso', form),
    ]);
    assert.deepEqual(
      replies.map((r) => r.status),
      [303, 303],
    );
    assert.equal(
      await prisma.accessRequest.count({ where: { email: 'double.click@example.it' } }),
      1,
    );
  });

  it('comes back on the same page with every error and what was typed', async () => {
    const browser = new Browser();
    const reply = await sendRequest(browser, {
      lang: 'it',
      name: 'Giulia',
      company: '',
      email: 'not-an-email',
      message: '<script>alert(1)</script>',
    });
    assert.equal(reply.status, 422);
    assert.match(reply.body, /<html lang="it"/);
    assert.match(reply.body, /Controlla 3 campi/);
    assert.match(reply.body, /href="#r-company">Azienda: Compila questo campo\./);
    assert.match(reply.body, /name="name"[^>]*value="Giulia"/);
    assert.match(reply.body, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.doesNotMatch(reply.body, /<script>alert\(1\)<\/script>/);
  });

  it('needs the page token: a cross-site post is refused and nothing is saved', async () => {
    const before = await prisma.accessRequest.count();
    const forged = await new Browser().post(
      '/richiesta-accesso',
      { ...REQUEST, email: 'forged@example.it' },
      { origin: 'https://evil.example' },
    );
    assert.equal(forged.status, 403);
    assert.equal(await prisma.accessRequest.count(), before);
  });

  it('answers a bot that fills the trap as if it worked, and keeps nothing', async () => {
    const before = await prisma.accessRequest.count();
    const browser = new Browser();
    const _csrf = await browser.csrf('/en/');
    const reply = await browser.post('/richiesta-accesso', {
      _csrf,
      ...REQUEST,
      email: 'bot@example.it',
      website: 'https://spam.example',
    });
    assert.equal(reply.status, 303);
    assert.equal(reply.location, '/en/richiesta-inviata');
    assert.equal(await prisma.accessRequest.count(), before);
  });

  it('stops at five posts an hour from one network', async () => {
    const browser = new Browser();
    let last = 0;
    for (let i = 0; i < 6; i += 1) {
      last = (await sendRequest(browser, { ...REQUEST, email: `limit${i}@example.it` })).status;
    }
    assert.equal(last, 429);
  });

  it('closes for the day after too many requests from everywhere, keeping what was typed', async () => {
    await prisma.accessRequest.createMany({
      data: Array.from({ length: 100 }, (_, i) => ({
        name: 'Spam',
        company: `Spam ${i}`,
        email: `spam${i}@example.it`,
      })),
    });
    const reply = await sendRequest(new Browser(), { ...REQUEST, email: 'late@example.it' });
    assert.equal(reply.status, 429);
    assert.match(reply.body, /too many requests today/);
    assert.match(reply.body, /name="email"[^>]*value="late@example.it"/);
    await prisma.accessRequest.deleteMany({ where: { name: 'Spam' } });
  });
});
