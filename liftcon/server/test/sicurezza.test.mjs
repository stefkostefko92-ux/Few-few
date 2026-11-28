// Регресионни тестове по ревюто на Кодаджията (26.11.2026) — първо падат, после поправката.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { setup, client, csrfDa, creaUtente, codice, entra, ORIGIN } from "./helpers.mjs";
import { leggiForm } from "../dist/content/campi.js";
import { urlSicuro } from "../dist/content/mdlite.js";
import { fixedWindowLimiter } from "../dist/rate-limit.js";
import { EMAIL_RE } from "../dist/email/configurazione.js";

const avanza = (clock, ms) => (clock.t += ms);

test("#1 имейл със знаци за HTML се отказва (данни на сайта и настройки на Brevo)", () => {
  const lo = 'x"><meta/http-equiv=refresh/content=0;url=//evil.example>@a.it';
  const { errori } = leggiForm("site", { f_telefono: "+39 379 296 9699", f_email: lo, f_orari_0: ["Lun"], f_orari_1: ["lun"], f_orari_2: ["09:00"], f_orari_3: ["18:00"] });
  assert.ok(errori.email, "имейлът с HTML не минава");
  assert.equal(EMAIL_RE.test(lo), false);
  assert.equal(EMAIL_RE.test("info@liftcon.it"), true);
});

test("#2 повторен вход с парола НЕ нулира грешните 2FA опити: 5 общо заключват акаунта", async () => {
  const s = await setup();
  try {
    const cred = await creaUtente(s.store, { sig: s.sig });
    const опит = async (n) => {
      const c = client(s.base); // нов браузър всеки път — както би правил нападател
      await c.req("/admin/login", { method: "POST", form: { email: cred.u.email, password: cred.password } });
      const f = await c.req("/admin/2fa");
      for (let i = 0; i < n; i++) await c.req("/admin/2fa", { method: "POST", form: { _csrf: csrfDa(f.text), codice: "000000" } });
    };
    await опит(4);
    await опит(1);
    const u = await s.store.utenti.perId(cred.u.id);
    assert.ok(u.bloccatoFino && u.bloccatoFino.getTime() > s.clock.t, "след 5 грешни 2FA кода акаунтът е заключен");
    const c = client(s.base);
    const r = await c.req("/admin/login", { method: "POST", form: { email: cred.u.email, password: cred.password } });
    assert.equal(r.status, 401, "по време на заключването и вярната парола не минава");
  } finally {
    await s.close();
  }
});

test("#3 грешка след активиране на новата версия не трие живия сайт; версиите са уникални", async () => {
  const s = await setup();
  try {
    const orig = s.store.pubblicazioni.chiudi;
    s.store.pubblicazioni.chiudi = async () => {
      throw new Error("db giù");
    };
    const e = await s.admin.pubblicatore.pubblica(null).catch((x) => ({ ok: false, errore: String(x) }));
    s.store.pubblicazioni.chiudi = orig;
    const attiva = readlinkSync(join(s.siteDir, "current"));
    assert.ok(existsSync(join(s.siteDir, attiva, "index.html")), `живата версия е на мястото си (${JSON.stringify(e)})`);
    const a = await s.admin.pubblicatore.pubblica(null);
    const b = await s.admin.pubblicatore.pubblica(null);
    assert.ok(a.ok && b.ok && a.versione !== b.versione);
  } finally {
    await s.close();
  }
});

test("#4 заключен акаунт дава същия отговор като грешен имейл (без изброяване)", async () => {
  const s = await setup();
  try {
    const cred = await creaUtente(s.store, { sig: s.sig });
    const c = client(s.base);
    for (let i = 0; i < 5; i++) await c.req("/admin/login", { method: "POST", form: { email: cred.u.email, password: "sbagliata davvero" } });
    const bloccato = await c.req("/admin/login", { method: "POST", form: { email: cred.u.email, password: "sbagliata davvero" } });
    const ignoto = await c.req("/admin/login", { method: "POST", form: { email: "nessuno@liftcon.it", password: "sbagliata davvero" } });
    assert.equal(bloccato.status, ignoto.status);
    assert.doesNotMatch(bloccato.text, /bloccato/i);
  } finally {
    await s.close();
  }
});

test("#5 лимитерът при пълен речник изхвърля най-стария ключ вместо да отказва на всички", () => {
  const l = fixedWindowLimiter(5, 60_000, 2);
  assert.equal(l.hit("a", 0), true);
  assert.equal(l.hit("b", 0), true);
  assert.equal(l.hit("c", 0), true, "нов посетител не е блокиран");
  for (let i = 0; i < 5; i++) l.hit("c", 1);
  assert.equal(l.hit("c", 2), false, "лимитът за самия ключ остава");
});

test("#7 резервен код и TOTP код не минават два пъти", async () => {
  const s = await setup();
  try {
    const cred = await creaUtente(s.store, { sig: s.sig });
    const { codici, hmac } = (await import("../dist/auth/recupero.js")).nuoviCodici(s.sig);
    await s.store.utenti.aggiorna(cred.u.id, { codiciRecupero: hmac });
    assert.equal(await s.store.utenti.consumaCodice(cred.u.id, hmac[0]), true);
    assert.equal(await s.store.utenti.consumaCodice(cred.u.id, hmac[0]), false);
    assert.equal(await s.store.utenti.consumaPassoTotp(cred.u.id, 100), true);
    assert.equal(await s.store.utenti.consumaPassoTotp(cred.u.id, 100), false);
    assert.equal(await s.store.utenti.consumaPassoTotp(cred.u.id, 101), true);
    void codici;
  } finally {
    await s.close();
  }
});

test("#8 POST в /admin без Origin (и без Sec-Fetch-Site: same-origin) → 403", async () => {
  const s = await setup();
  try {
    const cred = await creaUtente(s.store, { sig: s.sig });
    const r = await fetch(`${s.base}/admin/login`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ email: cred.u.email, password: cred.password }) });
    assert.equal(r.status, 403);
    const r2 = await fetch(`${s.base}/admin/login`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", "sec-fetch-site": "same-origin" }, body: new URLSearchParams({ email: cred.u.email, password: cred.password }) });
    assert.equal(r2.status, 303);
  } finally {
    await s.close();
  }
});

test("#9 вход при съществуваща непълна сесия работи; dopo се пази през 2FA", async () => {
  const s = await setup();
  try {
    const cred = await creaUtente(s.store, { sig: s.sig });
    const c = client(s.base);
    await c.req("/admin/login", { method: "POST", form: { email: cred.u.email, password: cred.password } });
    const f = await c.req("/admin/login");
    const r = await c.req("/admin/login", { method: "POST", form: { _csrf: csrfDa(f.text), email: cred.u.email, password: cred.password, dopo: "/admin/richieste" } });
    assert.equal(r.status, 303);
    const g = await c.req(r.location);
    const done = await c.req(g.text.match(/action="(\/admin\/2fa[^"]*)"/)[1].replace(/&amp;/g, "&"), { method: "POST", form: { _csrf: csrfDa(g.text), codice: codice(cred.segreto, s.clock) } });
    assert.equal(done.location, "/admin/richieste");
  } finally {
    await s.close();
  }
});

test("#11 протокол-относителен адрес (//evil) не е вътрешен път", () => {
  assert.equal(urlSicuro("//evil.example/x"), false);
  assert.equal(urlSicuro("/guide/x/"), true);
});

test("#12 „Ripristina“ не трие историята на версиите", async () => {
  const s = await setup();
  try {
    await s.store.contenuti.salva("faq-home", "faq-home", { valori: {} }, null);
    await s.store.contenuti.elimina("faq-home");
    assert.equal((await s.store.contenuti.revisioni("faq-home", 10)).length, 1);
  } finally {
    await s.close();
  }
});

void avanza;
void ORIGIN;
