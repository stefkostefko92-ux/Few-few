// Интеграционни тестове на /admin върху Store в паметта (спецификация т. 1–12).
import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, client, csrfDa, creaUtente, codice, entra, ORIGIN } from "./helpers.mjs";
import { pulizia } from "../dist/manutenzione.js";
import pino from "pino";

const avanza = (clock, ms) => (clock.t += ms);

test("вход: грешна парола и непознат имейл дават един и същ отговор; 5 грешки заключват акаунта", async () => {
  const s = await setup();
  try {
    const { password } = await creaUtente(s.store, { sig: s.sig });
    const c = client(s.base);
    const a = await c.req("/admin/login", { method: "POST", form: { email: "master@liftcon.it", password: "sbagliata davvero" } });
    const b = await c.req("/admin/login", { method: "POST", form: { email: "nessuno@liftcon.it", password: "sbagliata davvero" } });
    assert.equal(a.status, 401);
    assert.equal(b.status, 401);
    assert.match(a.text, /Email o password non corretti/);
    assert.match(b.text, /Email o password non corretti/);
    for (let i = 0; i < 4; i++) await c.req("/admin/login", { method: "POST", form: { email: "master@liftcon.it", password: "sbagliata davvero" } });
    const bloccato = await c.req("/admin/login", { method: "POST", form: { email: "master@liftcon.it", password } });
    assert.equal(bloccato.status, 429, "дори вярната парола не минава по време на заключването");
    avanza(s.clock, 16 * 60_000);
    assert.equal((await c.req("/admin/login", { method: "POST", form: { email: "master@liftcon.it", password } })).status, 303);
  } finally {
    await s.close();
  }
});

test("2FA е задължителна: без нея се отваря само настройката; с грешен код — 401; с верен — пълна сесия", async () => {
  const s = await setup();
  try {
    const { password, segreto } = await creaUtente(s.store, { sig: s.sig });
    const c = client(s.base);
    const r = await c.req("/admin/login", { method: "POST", form: { email: "master@liftcon.it", password } });
    assert.match(r.location, /^\/admin\/2fa/);
    assert.equal((await c.req("/admin/richieste")).status, 303, "сесия само с парола не стига до заявките");
    const f = await c.req("/admin/2fa");
    assert.equal((await c.req("/admin/2fa", { method: "POST", form: { _csrf: csrfDa(f.text), codice: "000000" } })).status, 401);
    const ok = await c.req("/admin/2fa", { method: "POST", form: { _csrf: csrfDa(f.text), codice: codice(segreto, s.clock) } });
    assert.equal(ok.status, 303);
    const dash = await c.req("/admin");
    assert.equal(dash.status, 200);
    assert.match(dash.text, /Panoramica/);
    assert.equal(dash.headers.get("x-robots-tag"), "noindex, nofollow");
  } finally {
    await s.close();
  }
});

test("първа настройка на 2FA: QR като PNG (без SVG), след потвърждение — 10 резервни кода, които после влизат", async () => {
  const s = await setup();
  try {
    const { u, password } = await creaUtente(s.store, { sig: s.sig, conTotp: false });
    const c = client(s.base);
    const r = await c.req("/admin/login", { method: "POST", form: { email: u.email, password } });
    assert.equal(r.location, "/admin/2fa/configura");
    const pag = await c.req("/admin/2fa/configura");
    assert.match(pag.text, /src="data:image\/png;base64,/);
    assert.doesNotMatch(pag.text, /<svg/i);
    const salvato = await s.store.utenti.perId(u.id);
    const segreto = s.sig.decifra("totp-v1", salvato.totpSecretEnc);
    const fine = await c.req("/admin/2fa/configura", { method: "POST", form: { _csrf: csrfDa(pag.text), codice: codice(segreto, s.clock) } });
    const codici = [...fine.text.matchAll(/<li><code>([a-z0-9-]{11})<\/code><\/li>/g)].map((m) => m[1]);
    assert.equal(codici.length, 10);
    assert.equal((await s.store.utenti.perId(u.id)).codiciRecupero.length, 10);
    // Изход и вход с резервен код; кодът е еднократен.
    const d = await c.req("/admin");
    await c.req("/admin/logout", { method: "POST", form: { _csrf: csrfDa(d.text) } });
    avanza(s.clock, 60_000);
    await c.req("/admin/login", { method: "POST", form: { email: u.email, password } });
    const f = await c.req("/admin/2fa");
    assert.equal((await c.req("/admin/2fa", { method: "POST", form: { _csrf: csrfDa(f.text), codice: codici[0] } })).status, 303);
    assert.equal((await s.store.utenti.perId(u.id)).codiciRecupero.length, 9);
  } finally {
    await s.close();
  }
});

test("CSRF: POST без токен или от чужд Origin → 403", async () => {
  const s = await setup();
  try {
    const cred = await creaUtente(s.store, { sig: s.sig });
    const c = client(s.base);
    await entra(c, s.clock, { email: cred.u.email, ...cred });
    assert.equal((await c.req("/admin/logout", { method: "POST", form: { x: "1" } })).status, 403);
    const d = await c.req("/admin");
    assert.equal((await c.req("/admin/logout", { method: "POST", form: { _csrf: csrfDa(d.text) }, headers: { origin: "https://evil.example" } })).status, 403);
  } finally {
    await s.close();
  }
});

test("сесия: 2 ч без действие → изход", async () => {
  const s = await setup();
  try {
    const cred = await creaUtente(s.store, { sig: s.sig });
    const c = client(s.base);
    await entra(c, s.clock, { email: cred.u.email, ...cred });
    assert.equal((await c.req("/admin")).status, 200);
    avanza(s.clock, 2 * 60 * 60_000 + 1000);
    const r = await c.req("/admin");
    assert.equal(r.status, 303);
    assert.match(r.location, /^\/admin\/login/);
  } finally {
    await s.close();
  }
});

test("роли: OPERATORE вижда заявките, но не съдържанието, потребителите и регистъра", async () => {
  const s = await setup();
  try {
    const cred = await creaUtente(s.store, { sig: s.sig, email: "op@liftcon.it", ruolo: "OPERATORE" });
    const c = client(s.base);
    await entra(c, s.clock, { email: "op@liftcon.it", ...cred });
    assert.equal((await c.req("/admin/richieste")).status, 200);
    for (const p of ["/admin/contenuti", "/admin/utenti", "/admin/registro", "/admin/richieste.csv"]) assert.equal((await c.req(p)).status, 403, p);
  } finally {
    await s.close();
  }
});

test("потребители: ADMIN не създава MASTER; временната парола не е в адреса; нов човек сменя паролата при първия вход", async () => {
  const s = await setup();
  try {
    const cred = await creaUtente(s.store, { sig: s.sig, email: "admin@liftcon.it", ruolo: "ADMIN" });
    const c = client(s.base);
    await entra(c, s.clock, { email: "admin@liftcon.it", ...cred });
    const pag = await c.req("/admin/utenti");
    const t = csrfDa(pag.text);
    const no = await c.req("/admin/utenti", { method: "POST", form: { _csrf: t, nome: "Capo", email: "capo@liftcon.it", ruolo: "MASTER" } });
    assert.equal(no.status, 303);
    assert.equal(await s.store.utenti.perEmail("capo@liftcon.it"), null);
    const si = await c.req("/admin/utenti", { method: "POST", form: { _csrf: t, nome: "Luca Verdi", email: "luca@liftcon.it", ruolo: "OPERATORE" } });
    assert.equal(si.status, 200);
    const pw = si.text.match(/Password temporanea \(mostrata una sola volta\): ([A-Za-z0-9]{16})/)?.[1];
    assert.ok(pw, "паролата се показва в страницата");
    assert.equal(si.location, null, "без пренасочване с паролата в адреса");
    const luca = await s.store.utenti.perEmail("luca@liftcon.it");
    assert.equal(luca.cambiarePassword, true);
  } finally {
    await s.close();
  }
});

test("заявки: формата записва в базата и праща известие; статус INCARICO спира автоматичното изтриване", async () => {
  const s = await setup();
  try {
    const form = { nome: "Anna Neri", email: "anna@example.com", ruolo: "amministratore", comune: "Milano", servizio: "preventivi", messaggio: "Tre preventivi per l'ammodernamento.", privacy: "si", t: "60000" };
    const res = await fetch(`${s.base}/api/richiesta`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json", origin: ORIGIN }, body: JSON.stringify(form) });
    assert.equal(res.status, 200);
    const { righe } = await s.store.richieste.cerca({ limite: 10, offset: 0 });
    assert.equal(righe.length, 1);
    assert.ok(righe[0].eliminareDopo > new Date(s.clock.t + 150 * 86_400_000));
    assert.match(s.sent[0].text, /Pannello: https:\/\/liftcon\.it\/admin\/richieste\//);
    const cred = await creaUtente(s.store, { sig: s.sig });
    const c = client(s.base);
    await entra(c, s.clock, { email: cred.u.email, ...cred });
    const det = await c.req(`/admin/richieste/${righe[0].id}`);
    assert.match(det.text, /Anna Neri/);
    await c.req(`/admin/richieste/${righe[0].id}`, { method: "POST", form: { _csrf: csrfDa(det.text), stato: "INCARICO", note: "Lettera inviata" } });
    const dopo = await s.store.richieste.perId(righe[0].id);
    assert.equal(dopo.stato, "INCARICO");
    assert.equal(dopo.eliminareDopo, null);
  } finally {
    await s.close();
  }
});

test("заявки: CSV без CSV injection; изтриване с потвърждение; изтеклите се чистят автоматично", async () => {
  const s = await setup();
  try {
    const r = await s.store.richieste.crea({ nome: "=HYPERLINK(\"http://x\")", email: "x@example.com", telefono: "", ruolo: "altro", comune: "Rho", servizio: "altro", messaggio: "+SUM(1)", eliminareDopo: new Date(s.clock.t - 1000) });
    await s.store.richieste.crea({ nome: "Vecchia", email: "v@example.com", telefono: "", ruolo: "altro", comune: "Rho", servizio: "altro", messaggio: "x".repeat(20), eliminareDopo: new Date(s.clock.t + 1e9) });
    const cred = await creaUtente(s.store, { sig: s.sig });
    const c = client(s.base);
    await entra(c, s.clock, { email: cred.u.email, ...cred });
    const csv = await c.req("/admin/richieste.csv");
    assert.equal(csv.headers.get("content-type"), "text/csv; charset=utf-8");
    assert.match(csv.text, /"'=HYPERLINK/);
    assert.match(csv.text, /"'\+SUM\(1\)"/);
    await pulizia(s.store, pino({ level: "silent" }), new Date(s.clock.t));
    assert.equal(await s.store.richieste.perId(r.id), null);
    const { righe } = await s.store.richieste.cerca({ limite: 10, offset: 0 });
    const det = await c.req(`/admin/richieste/${righe[0].id}`);
    await c.req(`/admin/richieste/${righe[0].id}/elimina`, { method: "POST", form: { _csrf: csrfDa(det.text) } });
    assert.ok(await s.store.richieste.perId(righe[0].id), "без отметката не се трие");
    await c.req(`/admin/richieste/${righe[0].id}/elimina`, { method: "POST", form: { _csrf: csrfDa(det.text), conferma: "si" } });
    assert.equal(await s.store.richieste.perId(righe[0].id), null);
    const ev = await s.store.eventi.ultimi(50, 0);
    assert.ok(ev.some((e) => e.azione === "richiesta.eliminata"));
    assert.ok(ev.every((e) => !JSON.stringify(e).includes("v@example.com")), "регистърът е без лични данни");
  } finally {
    await s.close();
  }
});

test("пренасочването след вход не излиза извън /admin", async () => {
  const s = await setup();
  try {
    const cred = await creaUtente(s.store, { sig: s.sig });
    const c = client(s.base);
    await c.req("/admin/login", { method: "POST", form: { email: cred.u.email, password: cred.password, dopo: "https://evil.example/" } });
    const f = await c.req("/admin/2fa?dopo=//evil.example");
    const r = await c.req("/admin/2fa?dopo=//evil.example", { method: "POST", form: { _csrf: csrfDa(f.text), codice: codice(cred.segreto, s.clock) } });
    assert.equal(r.location, "/admin");
  } finally {
    await s.close();
  }
});
