// Съдържание: текстов формат без суров HTML, валидиране, публикуване с атомарна смяна (спецификация т. 13–16).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readlinkSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mdInline, mdBlocco, htmlToMd } from "../dist/content/mdlite.js";
import { leggiForm } from "../dist/content/campi.js";
import { setup, client, csrfDa, creaUtente, entra } from "./helpers.mjs";

test("текстов формат: HTML се екранира, опасни адреси не стават връзки", () => {
  assert.equal(mdInline("<script>alert(1)</script>"), "&lt;script&gt;alert(1)&lt;/script&gt;");
  const js = mdInline("[clic](javascript:alert(1))");
  assert.doesNotMatch(js, /<a|href|javascript:/i, js);
  assert.doesNotMatch(mdInline("[x](data:text/html,<script>)"), /<a|href/);
  assert.equal(mdInline('[x](/guide/" onmouseover="a)'), '[x](/guide/&quot; onmouseover=&quot;a)');
  assert.equal(mdInline("**DPR 162/1999** e [guida](/guide/libretto-ascensore-targa-cabina/)"), '<strong>DPR 162/1999</strong> e <a href="/guide/libretto-ascensore-targa-cabina/">guida</a>');
  assert.equal(mdInline("[Normattiva](https://www.normattiva.it/x)"), '<a href="https://www.normattiva.it/x" target="_blank" rel="noopener">Normattiva</a>');
  assert.equal(mdBlocco("Risposta.\n\n- uno\n- due\n\nAltro.", { primaRisposta: true }), '<p class="answer">Risposta.</p><ul><li>uno</li><li>due</li></ul><p>Altro.</p>');
});

test("текстов формат: HTML от репото → текст → същият HTML", () => {
  const html = '<p class="answer">Ogni <strong>due</strong> anni.</p><ul><li>uno;</li><li>vedi <a href="/guide/x/">guida</a></li></ul><p>Fine.</p>';
  assert.equal(mdBlocco(htmlToMd(html), { primaRisposta: true }), html);
});

test("формата: ограниченията на сайта и „Carbon Stealth“ автоматично", () => {
  const { valori, errori } = leggiForm("servizio", { f_title: "x".repeat(61), f_description: "breve", f_keywords: "a, b, c, d", f_h1: "Titolo valido qui", f_nome: "Nome", f_menu: "Descrizione del menu", f_lead: "x".repeat(50) });
  assert.match(errori.title, /Massimo 60/);
  assert.match(errori.description, /Almeno 70/);
  assert.equal(valori.keywords, "a, b, c, d, Carbon Stealth");
  assert.equal(errori.keywords, undefined);
  assert.match(errori.perChi, /almeno una voce/);
  const f = leggiForm("guida", { f_fonti_0: ["Normattiva"], f_fonti_1: ["http://insicuro.it"] });
  assert.match(f.errori.fonti, /https/);
});

test("публикуване: промяната от панела стига до сайта; връзката current се сменя атомарно; лош билд не пипа живия сайт", async () => {
  const s = await setup();
  try {
    const cred = await creaUtente(s.store, { sig: s.sig });
    const c = client(s.base);
    await entra(c, s.clock, { email: cred.u.email, ...cred });
    const form = await c.req(`/admin/contenuti/e/${encodeURIComponent("servizio:sopralluogo")}`);
    assert.equal(form.status, 200);
    assert.match(form.text, /Sopralluogo tecnico dell&#39;ascensore/);
    const t = csrfDa(form.text);
    const campi = Object.fromEntries([...form.text.matchAll(/<input id="(f_[a-z]+)" name="(f_[a-zA-Z]+)" value="([^"]*)"/g)].map((m) => [m[2], m[3].replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"')]));
    const body = new URLSearchParams({ _csrf: t, ...campi, f_h1: "Sopralluogo tecnico <b>nuovo</b>" });
    for (const [k, v] of [...form.text.matchAll(/<textarea id="[^"]+" name="(f_[a-zA-Z_0-9]+)"[^>]*>([^<]*)<\/textarea>/g)].map((m) => [m[1], m[2]])) body.append(k, v.replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
    for (const [k, v] of [...form.text.matchAll(/<div class="riga"><label for="[^"]+">[^<]*<\/label><input id="[^"]+" name="(f_[a-zA-Z]+_0)" value="([^"]*)">/g)].map((m) => [m[1], m[2]])) body.append(k, v.replace(/&#39;/g, "'").replace(/&amp;/g, "&"));
    const salva = await fetch(`${s.base}/admin/contenuti/e/${encodeURIComponent("servizio:sopralluogo")}`, { method: "POST", redirect: "manual", headers: { cookie: c.cookie, "content-type": "application/x-www-form-urlencoded", origin: "https://liftcon.it" }, body });
    assert.equal(salva.status, 303, await salva.text());
    const lista = await c.req("/admin/contenuti");
    const pub = await c.req("/admin/contenuti/pubblica", { method: "POST", form: { _csrf: csrfDa(lista.text) } });
    assert.equal(pub.location, "/admin/contenuti?pubblicato=1");
    const attiva = readlinkSync(join(s.siteDir, "current"));
    const html = readFileSync(join(s.siteDir, "current", "servizi", "sopralluogo-tecnico-ascensore", "index.html"), "utf8");
    assert.match(html, /<h1>Sopralluogo tecnico &lt;b&gt;nuovo&lt;\/b&gt;<\/h1>/, "HTML от формата е екраниран");
    assert.ok(existsSync(join(s.siteDir, "current", "assets", "fonts", "saira-cond.woff2")));
    // Лош билд: генераторът пада → current сочи старата версия, публикуването е ERRORE.
    const rotto = mkdtempSync(join(tmpdir(), "liftcon-rotto-"));
    writeFileSync(join(rotto, "build.mjs"), "process.exit(3)");
    s.admin.pubblicatore = (await import("../dist/content/pubblica.js")).pubblicatore({ store: s.store, catalogo: s.admin.catalogo, siteSrc: rotto, siteDir: s.siteDir, siteUrl: "https://liftcon.it" });
    const r2 = await c.req("/admin/contenuti/pubblica", { method: "POST", form: { _csrf: csrfDa(lista.text) } });
    assert.equal(r2.location, "/admin/contenuti?errore=1");
    assert.equal(readlinkSync(join(s.siteDir, "current")), attiva);
    assert.equal((await s.store.pubblicazioni.ultime(1))[0].esito, "ERRORE");
  } finally {
    await s.close();
  }
});

test("преглед: само в папката на прегледа (без ../)", async () => {
  const s = await setup();
  try {
    const cred = await creaUtente(s.store, { sig: s.sig });
    const c = client(s.base);
    await entra(c, s.clock, { email: cred.u.email, ...cred });
    const r = await c.req("/admin/anteprima/abcdefghij/..%2F..%2F..%2Fetc%2Fpasswd");
    assert.ok([400, 404].includes(r.status));
    assert.doesNotMatch(r.text, /root:/);
  } finally {
    await s.close();
  }
});
