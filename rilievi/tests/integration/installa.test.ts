// The app on the home screen against the real app: the manifest and the service worker are served at the
// root with the right types, every page of the portal and of the landing links them, and "Installa
// l'app" is reachable from the menu and from the sign-in page — public, never indexed.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Browser, signedIn, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

describe('the installed app', () => {
  it('serves its manifest, with icons that are there', async () => {
    const browser = new Browser();
    const reply = await browser.get('/manifest.webmanifest');
    assert.equal(reply.status, 200);
    assert.match(reply.headers.get('content-type') ?? '', /^application\/manifest\+json/);
    assert.equal(reply.headers.get('cache-control'), 'no-cache');
    const manifest = JSON.parse(reply.body) as {
      display: string;
      start_url: string;
      icons: Array<{ src: string; sizes: string }>;
    };
    assert.equal(manifest.display, 'fullscreen');
    assert.equal(manifest.start_url, '/schede');
    for (const icon of manifest.icons) {
      const file = await browser.get(icon.src);
      assert.equal(file.status, 200, icon.src);
      assert.equal(file.headers.get('content-type'), 'image/png');
    }
  });

  it('serves the service worker from the root, asked again at every start', async () => {
    const reply = await new Browser().get('/sw.js');
    assert.equal(reply.status, 200);
    assert.match(reply.headers.get('content-type') ?? '', /^text\/javascript/);
    assert.equal(reply.headers.get('cache-control'), 'no-cache');
    assert.match(reply.body, /addEventListener\('fetch'/);
  });

  it('is linked from the portal and the landing, with the iPhone icon and title', async () => {
    const { browser } = await signedIn('TECNICO');
    for (const path of ['/schede', '/accesso', '/']) {
      // Signed in, the landing sends to the sheets: it is read as anyone reads it.
      const page = path === '/schede' ? await browser.get(path) : await new Browser().get(path);
      assert.equal(page.status, 200, path);
      assert.match(page.body, /<link rel="manifest" href="\/manifest\.webmanifest">/, path);
      assert.match(page.body, /<meta name="apple-mobile-web-app-capable" content="yes">/, path);
      assert.match(page.body, /<meta name="apple-mobile-web-app-title" content="Rilievi">/, path);
      assert.match(
        page.body,
        /<link rel="apple-touch-icon" href="\/static\/img\/apple-touch-icon\.png/,
        path,
      );
    }
  });

  it('is offered in the menu and on the sign-in page, and explains itself to anyone', async () => {
    const { browser } = await signedIn('OPERATORE');
    const schede = await browser.get('/schede');
    assert.match(
      schede.body,
      /<ul class="sidenav__app" data-installa-link>\s*<li><a href="\/app">/,
    );
    const mine = await browser.get('/app');
    assert.match(mine.body, /<a href="\/app" aria-current="page">/);

    const anonymous = new Browser();
    const login = await anonymous.get('/accesso');
    assert.match(
      login.body,
      /<a href="\/app" data-installa-link>Installa l&#39;app sul telefono o sul computer<\/a>/,
    );
    const page = await anonymous.get('/app');
    assert.equal(page.status, 200);
    assert.match(page.body, /<meta name="robots" content="noindex, nofollow">/);
    for (const os of ['android', 'ios', 'pc', 'mac'])
      assert.match(page.body, new RegExp(`<details class="installa__os" data-os="${os}" open>`));
    assert.match(page.body, /<a href="\/accesso">Torna all&#39;accesso<\/a>/);
    assert.match(page.body, /\/static\/js\/installa\.js/);
    assert.doesNotMatch(page.body, /\p{Script=Cyrillic}/u, 'no Cyrillic on the page');
  });
});
