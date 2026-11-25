// The updates of the portal against a real database: the public page /novita and its feed, the link in
// the footer of the site, and the popup of the portal — shown on the first page after an update with
// what was published since the person's last reading, read with "Ho capito" (and with no JavaScript:
// back to the same page), never again until the next update; never to a new account for older updates.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { vociAttive } from '../../src/novita/attive.js';
import { MAX_POPUP } from '../../src/novita/voci.js';
import { translatorFor } from '../../src/i18n.js';
import { Browser, prisma, signedIn, startApp, stopApp } from './harness.js';

const t = translatorFor('it');
// What this portal announces: without an application registered with Microsoft or Google (as in the tests) the
// entry about that sign-in is not among them (tests/novita.test.ts).
const VOCI = vociAttive();
const HTML = { accept: 'text/html,application/xhtml+xml' };
const POPUP = /<dialog class="novita"[^>]*data-novita/;
/** The newest entry: published at the start of this file — the update; the others on their own day. */
const NUOVA = VOCI[0]!;
const AGGIORNAMENTO = new Date(Date.now() - 1000);
/** An account that last read the updates just before the update. */
const primaDellAggiornamento = (id: string) =>
  prisma.user.update({
    where: { id },
    data: { novitaLetteAt: new Date(AGGIORNAMENTO.getTime() - 60_000) },
  });
/** The title as EJS writes it in the page. */
const titolo = (id: string) =>
  t(`novita.voci.${id}.titolo`)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&#34;')
    .replace(/'/g, '&#39;');

before(async () => {
  await startApp();
  // The portal registers the entries at its first page; here they are already there.
  await prisma.novita.createMany({
    data: VOCI.map((v) => ({
      id: v.id,
      pubblicataAt: v.id === NUOVA.id ? AGGIORNAMENTO : new Date(`${v.data}T00:00:00Z`),
    })),
  });
});
after(stopApp);

describe('the page of the updates', () => {
  it('is public, indexed, with every entry under its day and a feed', async () => {
    const page = await new Browser().get('/novita', HTML);
    assert.equal(page.status, 200);
    assert.match(page.body, /<meta name="robots" content="index, follow">/);
    assert.match(page.body, /<link rel="canonical" href="[^"]+\/novita">/);
    assert.equal(page.body.match(/<h1[\s>]/g)?.length, 1);
    assert.match(
      page.body,
      /<link rel="alternate" type="application\/rss\+xml"[^>]+href="\/novita\.xml">/,
    );
    assert.match(page.body, /<meta name="keywords" content="Carbon Stealth,/);
    for (const voce of VOCI) {
      assert.match(page.body, new RegExp(`<article class="novita-voce" id="${voce.id}"`), voce.id);
      assert.ok(page.body.includes(titolo(voce.id)), voce.id);
    }
    assert.match(page.body, /<time datetime="\d{4}-\d{2}-\d{2}">/);
    const ld = /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/.exec(
      page.body,
    )![1]!;
    assert.ok(JSON.parse(ld));
    assert.match(page.body, /Created and Designed by <a href="https:\/\/carbonstealth\.eu"/);

    const feed = await new Browser().get('/novita.xml');
    assert.equal(feed.status, 200);
    assert.match(feed.headers.get('content-type') ?? '', /application\/rss\+xml/);
    assert.equal(feed.body.match(/<item>/g)?.length, VOCI.length);

    const home = await new Browser().get('/', HTML);
    assert.match(home.body, /<a href="\/novita">/);
  });
});

describe('the popup of the updates', () => {
  it('shows what came after the last reading, only on a whole page of the portal', async () => {
    const { browser, user } = await signedIn('TECNICO');
    await primaDellAggiornamento(user.id);
    const page = await browser.get('/schede', HTML);
    assert.match(page.body, POPUP);
    const dialog = /<dialog class="novita"[\s\S]*?<\/dialog>/.exec(page.body)![0];
    assert.deepEqual(
      [...dialog.matchAll(/<li class="novita__voce" data-voce="([^"]+)"/g)].map((m) => m[1]),
      [NUOVA.id],
    );
    assert.ok(dialog.includes(titolo(NUOVA.id)));
    assert.match(dialog, /<a [^>]*href="\/novita#[^"]+"/);
    // Not on a fragment, a file or a request that does not ask for a page.
    assert.doesNotMatch((await browser.get('/schede')).body, POPUP);
    assert.doesNotMatch((await browser.get('/schede', { ...HTML, 'x-partial': '1' })).body, POPUP);
  });

  it('waits for a password that must be changed first', async () => {
    const { browser, user } = await signedIn('TECNICO');
    await primaDellAggiornamento(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { mustChangePassword: true } });
    assert.doesNotMatch((await browser.get('/account', HTML)).body, POPUP);
    await prisma.user.update({ where: { id: user.id }, data: { mustChangePassword: false } });
    assert.match((await browser.get('/account', HTML)).body, POPUP);
  });

  it('never shows a new account an update from before it existed', async () => {
    const { browser } = await signedIn('TECNICO');
    assert.doesNotMatch((await browser.get('/schede', HTML)).body, POPUP);
  });

  it('after a long absence shows the latest ones and how many more there are', async () => {
    const { browser, user } = await signedIn('TECNICO');
    await prisma.user.update({
      where: { id: user.id },
      data: { novitaLetteAt: new Date('2026-11-01T00:00:00Z') },
    });
    const dialog = /<dialog class="novita"[\s\S]*?<\/dialog>/.exec(
      (await browser.get('/schede', HTML)).body,
    )![0];
    const shown = [...dialog.matchAll(/<li class="novita__voce" data-voce="([^"]+)"/g)].map(
      (m) => m[1],
    );
    assert.deepEqual(
      shown,
      VOCI.slice(0, MAX_POPUP).map((v) => v.id),
    );
    if (VOCI.length > MAX_POPUP)
      assert.ok(dialog.includes(t('novita.popup.altre', { n: VOCI.length - MAX_POPUP })));
  });

  it('once read stays read: "Ho capito" goes back to the page, the account keeps its version', async () => {
    const { browser, user } = await signedIn('TECNICO');
    await primaDellAggiornamento(user.id);
    const page = (await browser.get('/schede?q=verdi', HTML)).body;
    const form = /<form method="post" action="\/novita\/lette"[\s\S]*?<\/form>/.exec(page)![0];
    const _csrf = /name="_csrf" value="([^"]+)"/.exec(form)![1]!;
    const torna = /name="torna" value="([^"]+)"/.exec(form)![1]!;
    assert.equal(torna.replace(/&amp;/g, '&'), '/schede?q=verdi');
    const before = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });

    assert.equal((await browser.post('/novita/lette', { torna: '/schede' })).status, 403);
    const read = await browser.post('/novita/lette', { _csrf, torna: '/schede?q=verdi' });
    assert.equal(read.status, 303);
    assert.equal(read.location, '/schede?q=verdi');
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.ok(after.novitaLetteAt.getTime() >= AGGIORNAMENTO.getTime());
    assert.equal(
      after.updatedAt.getTime(),
      before.updatedAt.getTime(),
      'not an edit of the account',
    );
    assert.doesNotMatch((await browser.get('/schede', HTML)).body, POPUP);
  });

  it('from the page script answers without a page, and never sends anyone away from the site', async () => {
    const { browser } = await signedIn('TECNICO');
    const _csrf = await browser.csrf('/account');
    const quiet = await browser.post(
      '/novita/lette',
      { _csrf, torna: '/schede' },
      { 'x-partial': '1' },
    );
    assert.equal(quiet.status, 204);
    const away = await browser.post('/novita/lette', { _csrf, torna: '//evil.example/x' });
    assert.equal(away.status, 303);
    assert.equal(away.location, '/schede');
    // Signed out: to the sign-in page, nothing written.
    assert.equal((await new Browser().post('/novita/lette', { torna: '/schede' })).status, 302);
  });
});
