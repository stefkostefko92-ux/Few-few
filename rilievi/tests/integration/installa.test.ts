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

  it('comes with the steps of the device already open, so nothing moves once it loads', async () => {
    const android = await new Browser().request('GET', '/app', {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
      },
    });
    assert.equal(android.status, 200);
    assert.match(android.headers.get('vary') ?? '', /User-Agent/i);
    const open = [...android.body.matchAll(/<details class="installa__os" data-os="(\w+)" open>/g)];
    assert.deepEqual(
      open.map((m) => m[1]),
      ['android'],
    );
    const badges = [...android.body.matchAll(/<span class="installa__tuo"( hidden)?>/g)];
    assert.deepEqual(
      badges.map((m) => m[1] ?? ''),
      ['', ' hidden', ' hidden', ' hidden'],
    );
    assert.match(android.body, /data-installa-ios hidden>/, 'no iPhone note on Android');
    assert.doesNotMatch(android.body, /data-installa-samsung/, 'Chrome is not sent to Chrome');
  });

  it('tells the iPhone that Apple installs only from "Condividi", with a button to the steps', async () => {
    // The owner, 5 November 2026: "Su iPhone non funziona il pulsante installa" — iOS has no install call.
    const iphone = await new Browser().request('GET', '/app', {
      headers: {
        'user-agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
      },
    });
    assert.equal(iphone.status, 200);
    assert.match(iphone.body, /data-installa-ios>/, 'the note is visible from the first paint');
    assert.match(iphone.body, /Apple lo permette solo dal menu Condividi/);
    assert.match(iphone.body, /data-installa-ios-passi/);
    assert.match(iphone.body, /<details class="installa__os" data-os="ios" open>/);
  });

  it('sends Samsung Internet to Chrome: the app it installs, Android marks as unsafe', async () => {
    // The owner, 5 November 2026: "Проблема с несигурно приложение идва от Самсунг браузър".
    const samsung = await new Browser().request('GET', '/app', {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
      },
    });
    assert.equal(samsung.status, 200);
    assert.match(samsung.body, /data-installa-samsung>/);
    assert.match(samsung.body, /Android segnala come «non sicura»/);
    assert.match(
      samsung.body,
      /href="intent:\/\/[^"\/]+\/app#Intent;scheme=https?;package=com\.android\.chrome;end"/,
    );
    assert.match(samsung.body, /<details class="installa__os" data-os="android" open>/);
  });

  it('marks every PDF link for the iPhone app, which cannot close a PDF (WebKit bug 290847)', async () => {
    const { browser } = await signedIn('TECNICO');
    const page = await browser.get('/schede');
    assert.match(page.body, /<script src="\/static\/js\/pdf-app\.js\?v=[^"]+" defer>/);
    assert.match(page.body, /data-pdf-attesa="Preparo il PDF…"/);
    assert.match(page.body, /data-pdf-non-supportato="[^"]+"/);
    // The script is served, and it only acts in the home-screen app (navigator.standalone).
    const script = await browser.get('/static/js/pdf-app.js');
    assert.equal(script.status, 200);
    assert.match(script.body, /navigator\.standalone !== true/);
    assert.match(script.body, /navigator\.share\(\{ files: \[file\] \}\)/);
  });
});
