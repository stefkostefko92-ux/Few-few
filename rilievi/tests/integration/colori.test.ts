// The "Personalizzato" theme against the real app (the owner, 30 October 2026): a person saves their
// colours on the profile page, the portal switches to them with a versioned stylesheet of its own, an
// unreadable pair is refused, and going back to the portal colours drops the theme.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Browser, prisma, signedIn, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

const NAVY = {
  sfondo: '#0f1b2d',
  testo: '#f2f2f2',
  menu: '#1b2a41',
  menuTesto: '#ffffff',
  accento: '#ffb000',
  linee: '#3a4a63',
};

describe('the custom colours of a person', () => {
  it('are saved, switch the theme and come as a stylesheet of their own', async () => {
    const { browser, user } = await signedIn('TECNICO');
    const saved = await browser.submit('/account', '/account/colori', NAVY);
    assert.equal(saved.status, 303);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.deepEqual(row.colori, NAVY);
    assert.equal(row.theme, 'CUSTOM');
    const page = (await browser.get('/schede')).body;
    assert.match(page, /<html lang="it" class="tema-personale" data-theme="dark">/);
    const href = /<link rel="stylesheet" href="(\/account\/colori\.css\?v=[0-9a-f]{12})">/.exec(
      page,
    )?.[1];
    assert.ok(href, 'the page links the stylesheet');
    assert.match(page, /href="[^"]*tema=personale"[^>]*aria-current="true"/, 'the switch shows it');
    const css = await browser.get(href);
    assert.equal(css.status, 200);
    assert.match(css.headers.get('content-type') ?? '', /^text\/css/);
    assert.match(css.headers.get('cache-control') ?? '', /immutable/);
    // Under another version (an old page, colours changed meanwhile) the sheet is never cached.
    const stale = await browser.get('/account/colori.css?v=000000000000');
    assert.equal(stale.status, 200);
    assert.equal(stale.headers.get('cache-control'), 'no-store');
    assert.match(css.body, /--bg: #0f1b2d;/);
    assert.match(css.body, /--primary-bg: #ffb000;/);
    // Someone else's stylesheet is never served: the sheet is the one of the session.
    const { browser: altro } = await signedIn('TECNICO');
    assert.equal((await altro.get(href)).status, 404);
    assert.equal((await new Browser().get(href)).status, 302);
  });

  it('refuse an unreadable pair and a forged value, keeping the old ones', async () => {
    const { browser, user } = await signedIn('OPERATORE');
    const bad = await browser.submit('/account', '/account/colori', {
      ...NAVY,
      testo: '#13203a',
    });
    assert.equal(bad.status, 422);
    assert.match(bad.body, /Il testo non si legge su questo sfondo/);
    const forged = await browser.submit('/account', '/account/colori', {
      ...NAVY,
      sfondo: 'red;}html{background:url(//x)',
    });
    assert.equal(forged.status, 422);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(row.colori, null);
    assert.equal(row.theme, 'AUTO');
    // Without colours of one's own the theme cannot be asked for.
    const page = await browser.get('/schede?tema=personale');
    const after = await browser.get(page.location || '/schede');
    assert.doesNotMatch(after.body, /tema-personale/);
  });

  it('go back to the portal colours, and the theme with them', async () => {
    const { browser, user } = await signedIn('CLIENTE');
    await browser.submit('/account', '/account/colori', NAVY);
    const reset = await browser.submit('/account', '/account/colori/ripristina', {});
    assert.equal(reset.status, 303);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(row.colori, null);
    assert.equal(row.theme, 'AUTO');
    assert.doesNotMatch((await browser.get('/schede')).body, /tema-personale|colori\.css/);
  });
});
