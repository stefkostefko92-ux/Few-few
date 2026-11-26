// Настройките на Brevo от панела (спецификация т. 20–23). Brevo е двойник — нищо не излиза навън.
import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, client, csrfDa, creaUtente, entra, brevoFinto, ORIGIN } from "./helpers.mjs";

const KEY = "xkeysib-0123456789abcdef0123456789abcdef-AbCd";

async function master(s, ruolo = "MASTER") {
  const cred = await creaUtente(s.store, { sig: s.sig, email: `${ruolo.toLowerCase()}@liftcon.it`, ruolo });
  const c = client(s.base);
  await entra(c, s.clock, { email: cred.u.email, ...cred });
  return c;
}

test("ключът се пази шифрован и не се показва отново (само последните 4 знака); празно поле не го сменя", async () => {
  const s = await setup();
  try {
    const c = await master(s);
    const pag = await c.req("/admin/impostazioni");
    assert.equal(pag.status, 200);
    const t = csrfDa(pag.text);
    const r = await c.req("/admin/impostazioni", { method: "POST", form: { _csrf: t, apiKey: KEY, mittente: "noreply@liftcon.it", nomeMittente: "LiftCon", destinatario: "info@liftcon.it" } });
    assert.equal(r.status, 303);
    const salvato = await s.store.impostazioni.leggi("email");
    assert.doesNotMatch(JSON.stringify(salvato), new RegExp(KEY.slice(8, 30)), "в базата няма ключ в чист вид");
    const dopo = await c.req("/admin/impostazioni");
    assert.match(dopo.text, /termina con <code>…AbCd<\/code>/);
    assert.doesNotMatch(dopo.text, new RegExp(KEY.slice(0, 20)), "ключът не се връща в страницата");
    await c.req("/admin/impostazioni", { method: "POST", form: { _csrf: t, apiKey: "", mittente: "noreply@liftcon.it", nomeMittente: "LiftCon Avvisi", destinatario: "info@liftcon.it" } });
    assert.equal((await s.admin.email.leggi()).apiKey, KEY, "празно поле = ключът остава");
    const ev = await s.store.eventi.ultimi(20, 0);
    assert.ok(ev.some((e) => e.azione === "impostazioni.email_salvate"));
    assert.ok(ev.every((e) => !JSON.stringify(e).includes(KEY.slice(8, 30))), "ключът не е в регистъра");
  } finally {
    await s.close();
  }
});

test("само MASTER и ADMIN: DIREZIONE получава 403", async () => {
  const s = await setup();
  try {
    const c = await master(s, "DIREZIONE");
    assert.equal((await c.req("/admin/impostazioni")).status, 403);
  } finally {
    await s.close();
  }
});

test("проверка на връзката: GET /v3/account и /v3/senders с api-key; предупреждение, ако подателят не е активен", async () => {
  const brevo = brevoFinto({
    "/v3/account": { status: 200, body: { email: "owner@carbonstealth.eu", companyName: "Carbon Stealth VCC" } },
    "/v3/senders": { status: 200, body: { senders: [{ email: "info@liftcon.it", active: true }, { email: "noreply@liftcon.it", active: false }] } },
  });
  const s = await setup({ brevo });
  try {
    const c = await master(s);
    let p = await c.req("/admin/impostazioni");
    await c.req("/admin/impostazioni", { method: "POST", form: { _csrf: csrfDa(p.text), apiKey: KEY, mittente: "noreply@liftcon.it", nomeMittente: "LiftCon", destinatario: "info@liftcon.it" } });
    p = await c.req("/admin/impostazioni");
    const v = await c.req("/admin/impostazioni/verifica", { method: "POST", form: { _csrf: csrfDa(p.text) } });
    assert.match(v.text, /Connessione riuscita \(account: Carbon Stealth VCC · owner@carbonstealth\.eu\)/);
    assert.match(v.text, /non è tra quelli attivi/);
    const acc = brevo.chiamate.find((x) => x.url === "https://api.brevo.com/v3/account");
    assert.equal(acc.init.headers["api-key"], KEY);
    assert.equal(acc.init.method, "GET");
  } finally {
    await s.close();
  }
});

test("ключ, отказан от Brevo (401) → ясна грешка", async () => {
  const s = await setup({ brevo: brevoFinto({ "/v3/account": { status: 401, body: {} } }) });
  try {
    const c = await master(s);
    let p = await c.req("/admin/impostazioni");
    await c.req("/admin/impostazioni", { method: "POST", form: { _csrf: csrfDa(p.text), apiKey: KEY, mittente: "info@liftcon.it", nomeMittente: "LiftCon", destinatario: "info@liftcon.it" } });
    p = await c.req("/admin/impostazioni");
    const v = await c.req("/admin/impostazioni/verifica", { method: "POST", form: { _csrf: csrfDa(p.text) } });
    assert.match(v.text, /Chiave API non valida o revocata/);
  } finally {
    await s.close();
  }
});

test("тестово писмо и известията от формата тръгват с настройките от панела", async () => {
  const s = await setup({ mailerDaPannello: true });
  try {
    const c = await master(s);
    let p = await c.req("/admin/impostazioni");
    await c.req("/admin/impostazioni", { method: "POST", form: { _csrf: csrfDa(p.text), apiKey: KEY, mittente: "noreply@liftcon.it", nomeMittente: "LiftCon", destinatario: "info@liftcon.it" } });
    p = await c.req("/admin/impostazioni");
    const prova = await c.req("/admin/impostazioni/prova", { method: "POST", form: { _csrf: csrfDa(p.text) } });
    assert.match(prova.text, /Email di prova inviata a info@liftcon\.it/);
    const form = { nome: "Paolo Riva", email: "paolo@example.com", ruolo: "proprietario", comune: "Monza", servizio: "sopralluogo", messaggio: "Vorrei un sopralluogo descrittivo.", privacy: "si", t: "60000" };
    const r = await fetch(`${s.base}/api/richiesta`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json", origin: ORIGIN }, body: JSON.stringify(form) });
    assert.equal(r.status, 200);
    const invii = s.brevo.chiamate.filter((x) => x.url.endsWith("/smtp/email")).map((x) => JSON.parse(x.init.body));
    assert.equal(invii.length, 2);
    assert.deepEqual(invii[1].sender, { email: "noreply@liftcon.it", name: "LiftCon" });
    assert.deepEqual(invii[1].to, [{ email: "info@liftcon.it" }]);
    assert.equal(invii[1].replyTo.email, "paolo@example.com");
  } finally {
    await s.close();
  }
});

test("без ключ никъде: заявката се записва, отговорът е успех, известието не тръгва", async () => {
  const s = await setup({ mailerDaPannello: true });
  try {
    const form = { nome: "Sara Galli", email: "sara@example.com", ruolo: "gestore", comune: "Bergamo", servizio: "relazioni", messaggio: "Serve una relazione per l'assemblea.", privacy: "si", t: "60000" };
    const r = await fetch(`${s.base}/api/richiesta`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json", origin: ORIGIN }, body: JSON.stringify(form) });
    assert.equal(r.status, 200);
    assert.equal((await s.store.richieste.cerca({ limite: 5, offset: 0 })).totale, 1);
    assert.equal(s.brevo.chiamate.length, 0);
  } finally {
    await s.close();
  }
});
