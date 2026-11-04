// The app on the home screen (owner, 4 November 2026: "add to home screen for PC, iOS and Android … a
// schermo intero"): the manifest asks for what browsers need to install it, the icons are there at
// their sizes, and the service worker keeps nothing — it only answers a page the device cannot load.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import vm from 'node:vm';
import sharp from 'sharp';
import { translatorFor } from '../src/i18n.js';
import { ICONE, manifestDi, START_URL } from '../src/pwa/manifest.js';

const PUBLIC = join(import.meta.dirname, '..', 'public');
const t = translatorFor('it');

describe('the manifest of the installed app', () => {
  const manifest = manifestDi(t, 'abc123');

  it('asks what Chrome, Edge and Safari need to install it, full screen', () => {
    assert.equal(manifest.name, 'Rilievi Impianti');
    // The name under the icon: short enough not to be cut on a phone.
    assert.ok(manifest.short_name.length <= 12, manifest.short_name);
    assert.equal(manifest.display, 'fullscreen');
    assert.equal(manifest.start_url, START_URL);
    assert.ok(manifest.start_url.startsWith(manifest.scope));
    assert.equal(manifest.prefer_related_applications, false);
    for (const sizes of ['192x192', '512x512'])
      for (const purpose of ['any', 'maskable'])
        assert.ok(
          manifest.icons.some((i) => i.sizes === sizes && i.purpose === purpose),
          `${sizes} ${purpose}`,
        );
    // The icons carry the version of the static files: a new icon reaches the installed app.
    for (const icon of manifest.icons)
      assert.match(icon.src, /^\/static\/img\/[\w-]+\.png\?v=abc123$/);
  });

  it('opens the shortcuts on pages of the portal, named in Italian', () => {
    for (const shortcut of manifest.shortcuts) {
      assert.ok(shortcut.url.startsWith('/') && !shortcut.url.startsWith('//'), shortcut.url);
      assert.ok(!/^[a-z]+\.[a-zA-Z.]+$/.test(shortcut.name), `untranslated ${shortcut.name}`);
    }
  });

  it('points at icons that are there at their size, on black', async () => {
    for (const { file, size } of ICONE) {
      const path = join(PUBLIC, 'img', `${file}.png`);
      const { data, info } = await sharp(path)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      assert.deepEqual([info.width, info.height], [size, size], file);
      // Opaque in every pixel: an icon with transparency gets a white plate on Android.
      for (let i = 3; i < data.length; i += 4) assert.equal(data[i], 255, `${file}: transparent`);
      assert.deepEqual([...data.subarray(0, 3)], [0, 0, 0], `${file}: corner not black`);
    }
  });

  it('keeps the mark of the maskable icons inside the circle every Android mask keeps', async () => {
    for (const { file, size } of ICONE.filter((i) => i.purpose === 'maskable')) {
      const { data } = await sharp(join(PUBLIC, 'img', `${file}.png`))
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const radius = size * 0.4;
      let outside = 0;
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          if (Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) <= radius) continue;
          const i = (y * size + x) * 3;
          if (Math.max(data[i]!, data[i + 1]!, data[i + 2]!) > 24) outside += 1;
        }
      }
      assert.equal(outside, 0, `${file}: ${outside} lit pixels outside the safe circle`);
    }
  });
});

describe('the service worker', () => {
  const source = readFileSync(join(PUBLIC, 'js', 'sw.js'), 'utf8');
  type Handler = (event: unknown) => void;

  function load(fetch: () => Promise<unknown>): Record<string, Handler> {
    const listeners: Record<string, Handler> = {};
    const self = {
      addEventListener: (type: string, handler: Handler) => (listeners[type] = handler),
      skipWaiting: () => undefined,
      clients: { claim: async () => undefined },
    };
    vm.runInNewContext(source, { self, fetch, Response });
    return listeners;
  }

  function fetchEvent(request: { mode: string; method: string }) {
    const event = {
      request,
      answer: null as Promise<Response> | null,
      respondWith: (p: Promise<Response>) => (event.answer = p),
    };
    return event;
  }

  it('lets everything but opening a page go as it would without it', () => {
    const { fetch: onFetch } = load(() => Promise.reject(new Error('no network')));
    for (const request of [
      { mode: 'cors', method: 'GET' },
      { mode: 'no-cors', method: 'GET' },
      // A form that is sent: never answered by the worker, it goes to the server or fails as before.
      { mode: 'navigate', method: 'POST' },
    ]) {
      const event = fetchEvent(request);
      onFetch!(event);
      assert.equal(event.answer, null, JSON.stringify(request));
    }
  });

  it('gives the page from the network as it comes', async () => {
    const page = new Response('scheda');
    const { fetch: onFetch } = load(() => Promise.resolve(page));
    const event = fetchEvent({ mode: 'navigate', method: 'GET' });
    onFetch!(event);
    assert.equal(await event.answer, page);
  });

  it('answers a page that cannot load with its notice in Italian, never kept', async () => {
    const { fetch: onFetch } = load(() => Promise.reject(new TypeError('Failed to fetch')));
    const event = fetchEvent({ mode: 'navigate', method: 'GET' });
    onFetch!(event);
    const answer = await event.answer!;
    assert.equal(answer.status, 503);
    assert.equal(answer.headers.get('cache-control'), 'no-store');
    const body = await answer.text();
    assert.match(body, /<h1>Nessuna connessione<\/h1>/);
    assert.doesNotMatch(body, /<script/);
  });

  it('keeps nothing on the device', () => {
    assert.doesNotMatch(source, /caches\.|indexedDB|localStorage/);
  });
});
