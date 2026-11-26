// PWA (приложението на началния екран): манифест, икони, service worker с версия, тагове в <head>.
import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, client } from "./helpers.mjs";

test("манифест: обхват /admin/, старт в документите, икони any + maskable (PNG), преки пътища", async () => {
  const s = await setup();
  try {
    const r = await fetch(`${s.base}/admin/manifest.webmanifest`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type"), /application\/manifest\+json/);
    const m = await r.json();
    assert.equal(m.start_url, "/admin/documenti/");
    assert.equal(m.scope, "/admin/");
    assert.ok(m.start_url.startsWith(m.scope));
    assert.equal(m.display, "standalone");
    assert.equal(m.lang, "it");
    for (const size of ["192x192", "512x512"]) {
      assert.ok(m.icons.some((i) => i.sizes === size && i.purpose === "any"), `any ${size}`);
      assert.ok(m.icons.some((i) => i.sizes === size && i.purpose === "maskable"), `maskable ${size}`);
    }
    for (const i of m.icons) {
      assert.equal(i.type, "image/png", "никога SVG");
      const img = await fetch(s.base + i.src);
      assert.equal(img.status, 200, i.src);
      assert.equal(img.headers.get("content-type"), "image/png");
    }
    assert.ok(m.shortcuts.some((x) => x.url === "/admin/documenti/#/nuovo/SOPRALLUOGO"));
    for (const x of m.shortcuts) assert.ok(x.url.startsWith(m.scope));
  } finally {
    await s.close();
  }
});

test("service worker: /admin/sw.js с версия (отпечатък), без вход; страниците на панела имат манифеста и iOS таговете", async () => {
  const s = await setup();
  try {
    const sw = await fetch(`${s.base}/admin/sw.js`);
    assert.equal(sw.status, 200);
    assert.match(sw.headers.get("content-type"), /javascript/);
    assert.equal(sw.headers.get("cache-control"), "no-cache");
    const testo = await sw.text();
    assert.doesNotMatch(testo, /__VERSIONE__/);
    assert.match(testo, /const VERSIONE = "[0-9a-f]{12}"/);
    assert.match(testo, /addEventListener\("fetch"/, "Chromium иска fetch handler, за да предложи инсталиране");
    const login = await client(s.base).req("/admin/login");
    assert.match(login.text, /rel="manifest"/);
    assert.match(login.text, /apple-mobile-web-app-capable/);
    assert.match(login.text, /rel="apple-touch-icon" href="\/admin\/static\/pwa\/apple-touch-icon.png/);
  } finally {
    await s.close();
  }
});
