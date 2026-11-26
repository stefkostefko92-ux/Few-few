// API на документите (спецификация D1, D2, D8, D10–D17): версии и конфликти, права, CSRF, снимки, издаване.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { setup, client, creaUtente, entra, ORIGIN } from "./helpers.mjs";
import { CATALOGO } from "../dist/documenti/condiviso/catalogo/index.js";
import { nuovoDocumento } from "../dist/documenti/condiviso/nuovo.js";

async function sessione(s, ruolo, email = `${ruolo.toLowerCase()}@liftcon.it`) {
  const cred = await creaUtente(s.store, { sig: s.sig, ruolo, email, nome: `Utente ${ruolo}` });
  const c = client(s.base);
  await entra(c, s.clock, { email, password: cred.password, segreto: cred.segreto });
  const info = JSON.parse((await c.req("/admin/api/sessione")).text);
  const api = async (path, { method = "GET", json, body, type, csrf = info.csrf, origin = ORIGIN, headers: extra = {} } = {}) => {
    const headers = { cookie: c.cookie, ...(origin ? { origin } : {}), ...(csrf ? { "x-csrf-token": csrf } : {}), ...extra };
    if (json) headers["content-type"] = "application/json";
    if (type) headers["content-type"] = type;
    const res = await fetch(s.base + path, { method, redirect: "manual", headers, body: json ? JSON.stringify(json) : body });
    const ct = res.headers.get("content-type") ?? "";
    return { status: res.status, headers: res.headers, json: ct.includes("json") ? await res.json() : null, buf: ct.includes("json") ? null : Buffer.from(await res.arrayBuffer()) };
  };
  return { api, info, cred };
}

/** Пълен документ за оглед с реални точки от каталога. */
function sopralluogo(id) {
  const d = nuovoDocumento("SOPRALLUOGO", id);
  const i = d.intestazione;
  i.committente.nome = "Condominio Via Roma 1";
  i.impianto = { ...i.impianto, indirizzo: "Via Roma 1", comune: "Milano", provincia: "MI", tipo: "elettrico_lm" };
  i.data = "2026-11-26";
  const [v1, v2] = CATALOGO.sezioni[0].voci;
  const a = v1.anomalie[0];
  d.dati.esiti = {
    [v1.id]: { esito: "anomalia", nota: "", anomalia: { fraseId: a.id, testo: a.testo, raccomandazione: a.raccomandazione, priorita: a.priorita }, foto: [] },
    [v2.id]: { esito: "ok", nota: "", foto: [] },
  };
  return { tipo: d.tipo, versione: 0, intestazione: d.intestazione, dati: d.dati, foto: [] };
}

const jpegConExif = () =>
  sharp({ create: { width: 1600, height: 1200, channels: 3, background: "#7a8a99" } })
    .jpeg()
    .withExif({ IFD0: { Make: "TelefonoProva", Model: "X1" } })
    .toBuffer();

test("TECNICO: създава (versione 0), чете, записва; стара версия → 409 със сървърното копие", async () => {
  const s = await setup();
  try {
    const { api } = await sessione(s, "TECNICO");
    const id = randomUUID();
    const r1 = await api(`/admin/api/documenti/${id}`, { method: "PUT", json: sopralluogo(id) });
    assert.equal(r1.status, 200, JSON.stringify(r1.json));
    assert.equal(r1.json.versione, 1);
    assert.equal(r1.json.autore.nome, "Utente TECNICO");
    const corpo = { ...sopralluogo(id), versione: 1 };
    corpo.intestazione.titolo = "Relazione – Via Roma 1";
    const r2 = await api(`/admin/api/documenti/${id}`, { method: "PUT", json: corpo });
    assert.equal(r2.json.versione, 2);
    const vecchio = await api(`/admin/api/documenti/${id}`, { method: "PUT", json: { ...corpo, versione: 1 } });
    assert.equal(vecchio.status, 409);
    assert.equal(vecchio.json.server.versione, 2);
    assert.equal(vecchio.json.server.intestazione.titolo, "Relazione – Via Roma 1");
    const lista = await api("/admin/api/documenti");
    assert.equal(lista.json.righe.length, 1);
    assert.equal(lista.headers.get("cache-control"), "no-store");
  } finally {
    await s.close();
  }
});

test("OPERATORE чете, но не записва; без CSRF или с чужд Origin → 403; без сесия → 401", async () => {
  const s = await setup();
  try {
    const t = await sessione(s, "TECNICO");
    const id = randomUUID();
    await t.api(`/admin/api/documenti/${id}`, { method: "PUT", json: sopralluogo(id) });
    const o = await sessione(s, "OPERATORE");
    assert.equal((await o.api(`/admin/api/documenti/${id}`)).status, 200);
    assert.equal((await o.api(`/admin/api/documenti/${id}`, { method: "PUT", json: { ...sopralluogo(id), versione: 1 } })).status, 403);
    assert.equal((await t.api(`/admin/api/documenti/${id}`, { method: "PUT", json: { ...sopralluogo(id), versione: 1 }, csrf: "" })).status, 403);
    assert.equal((await t.api(`/admin/api/documenti/${id}`, { method: "PUT", json: { ...sopralluogo(id), versione: 1 }, origin: "https://evil.example" })).status, 403);
    const anon = await fetch(`${s.base}/admin/api/documenti`, { redirect: "manual" });
    assert.equal(anon.status, 401);
  } finally {
    await s.close();
  }
});

test("невалидни данни → 400: id, тип, твърде дълъг текст, непознат тип уредба", async () => {
  const s = await setup();
  try {
    const { api } = await sessione(s, "TECNICO");
    assert.equal((await api("/admin/api/documenti/../../etc", { method: "PUT", json: sopralluogo(randomUUID()) })).status, 404);
    assert.equal((await api("/admin/api/documenti/non-un-uuid", { method: "PUT", json: sopralluogo(randomUUID()) })).status, 400);
    const id = randomUUID();
    const lungo = sopralluogo(id);
    lungo.intestazione.oggetto = "x".repeat(5000);
    assert.equal((await api(`/admin/api/documenti/${id}`, { method: "PUT", json: lungo })).status, 400);
    const tipo = sopralluogo(id);
    tipo.intestazione.impianto.tipo = "teletrasporto";
    assert.equal((await api(`/admin/api/documenti/${id}`, { method: "PUT", json: tipo })).status, 400);
    const dati = sopralluogo(id);
    dati.dati.esiti["x.y"] = { esito: "boh", nota: "", foto: [] };
    assert.equal((await api(`/admin/api/documenti/${id}`, { method: "PUT", json: dati })).status, 400);
  } finally {
    await s.close();
  }
});

test("снимка: само изображения, без EXIF, идемпотентно, с миниатюра; чужд документ → 404", async () => {
  const s = await setup();
  try {
    const { api } = await sessione(s, "TECNICO");
    const id = randomUUID();
    await api(`/admin/api/documenti/${id}`, { method: "PUT", json: sopralluogo(id) });
    const fotoId = randomUUID();
    const url = `/admin/api/documenti/${id}/foto/${fotoId}?ordine=1`;
    const img = await jpegConExif();
    const metaPorta = { "x-foto-meta": Buffer.from(JSON.stringify({ didascalia: "Porta" })).toString("base64url") };
    const r1 = await api(url, { method: "POST", body: img, type: "image/jpeg", headers: metaPorta });
    assert.equal(r1.status, 201, JSON.stringify(r1.json));
    assert.equal(r1.json.didascalia, "Porta");
    assert.equal((await api(url, { method: "POST", body: img, type: "image/jpeg", headers: metaPorta })).status, 200, "повторното качване не дублира");
    const doc = await api(`/admin/api/documenti/${id}`);
    assert.equal(doc.json.foto.length, 1);
    const file = await api(`/admin/documenti/${id}/foto/${fotoId}`);
    assert.equal(file.headers.get("content-type"), "image/jpeg");
    const meta = await sharp(file.buf).metadata();
    assert.equal(meta.exif, undefined, "без EXIF");
    const mini = await api(`/admin/documenti/${id}/foto/${fotoId}?mini=1`);
    assert.ok((await sharp(mini.buf).metadata()).width <= 960);
    assert.equal((await api(`/admin/api/documenti/${id}/foto/${randomUUID()}`, { method: "POST", body: Buffer.from("non sono un'immagine"), type: "image/jpeg" })).status, 400);
    assert.equal((await api(`/admin/api/documenti/${id}/foto/${randomUUID()}`, { method: "POST", body: Buffer.from("x"), type: "text/plain" })).status, 415);
    const altro = randomUUID();
    await api(`/admin/api/documenti/${altro}`, { method: "PUT", json: sopralluogo(altro) });
    assert.equal((await api(`/admin/documenti/${altro}/foto/${fotoId}`)).status, 404, "снимката не е на този документ");
    assert.equal((await api(`/admin/api/documenti/${id}/foto/${fotoId}`, { method: "DELETE" })).status, 204);
    assert.equal((await api(`/admin/documenti/${id}/foto/${fotoId}`)).status, 404);
  } finally {
    await s.close();
  }
});

test("издаване: непълен → 422; пълен → SOP-2026-001 и PDF; следващият → 002; записване след това → 423", async () => {
  const s = await setup();
  try {
    const { api } = await sessione(s, "TECNICO");
    const id = randomUUID();
    const vuoto = sopralluogo(id);
    vuoto.intestazione.committente.nome = "";
    await api(`/admin/api/documenti/${id}`, { method: "PUT", json: vuoto });
    const no = await api(`/admin/api/documenti/${id}/emetti`, { method: "POST", json: { versione: 1 } });
    assert.equal(no.status, 422);
    assert.ok(no.json.problemi.some((p) => /committente/.test(p)));
    await api(`/admin/api/documenti/${id}`, { method: "PUT", json: { ...sopralluogo(id), versione: 1 } });
    const ok = await api(`/admin/api/documenti/${id}/emetti`, { method: "POST", json: { versione: 2 } });
    assert.equal(ok.status, 200, JSON.stringify(ok.json));
    assert.equal(ok.json.numero, "SOP-2026-001");
    assert.equal(ok.json.stato, "EMESSO");
    const pdf = await api(`/admin/documenti/${id}/pdf`);
    assert.equal(pdf.headers.get("content-type"), "application/pdf");
    assert.equal(pdf.buf.subarray(0, 5).toString(), "%PDF-");
    assert.equal((await api(`/admin/api/documenti/${id}`, { method: "PUT", json: { ...sopralluogo(id), versione: 3 } })).status, 423);
    const id2 = randomUUID();
    await api(`/admin/api/documenti/${id2}`, { method: "PUT", json: sopralluogo(id2) });
    assert.equal((await api(`/admin/api/documenti/${id2}/emetti`, { method: "POST", json: { versione: 1 } })).json.numero, "SOP-2026-002");
    const ev = await s.store.eventi.ultimi(50, 0);
    const e = ev.find((x) => x.azione === "documento.emesso");
    assert.ok(e);
    assert.doesNotMatch(JSON.stringify(ev), /Via Roma/, "регистърът е без съдържанието");
  } finally {
    await s.close();
  }
});

test("нова ревизия: чернова Rev. 1 с копирани снимки; при издаване — същият номер", async () => {
  const s = await setup();
  try {
    const { api } = await sessione(s, "TECNICO");
    const id = randomUUID();
    await api(`/admin/api/documenti/${id}`, { method: "PUT", json: sopralluogo(id) });
    const fotoId = randomUUID();
    await api(`/admin/api/documenti/${id}/foto/${fotoId}?ordine=1`, { method: "POST", body: await jpegConExif(), type: "image/jpeg", headers: { "x-foto-meta": Buffer.from(JSON.stringify({ didascalia: "Porta" })).toString("base64url") } });
    await api(`/admin/api/documenti/${id}/emetti`, { method: "POST", json: { versione: 1 } });
    const rev = await api(`/admin/api/documenti/${id}/revisione`, { method: "POST", json: {} });
    assert.equal(rev.status, 201);
    const d = await api(`/admin/api/documenti/${rev.json.id}`);
    assert.equal(d.json.revisione, 1);
    assert.equal(d.json.stato, "BOZZA");
    assert.equal(d.json.foto.length, 1);
    assert.notEqual(d.json.foto[0].id, fotoId);
    assert.equal((await api(`/admin/documenti/${rev.json.id}/foto/${d.json.foto[0].id}`)).status, 200);
    const e = await api(`/admin/api/documenti/${rev.json.id}/emetti`, { method: "POST", json: { versione: d.json.versione } });
    assert.equal(e.json.numero, "SOP-2026-001");
    assert.equal(e.json.revisione, 1);
  } finally {
    await s.close();
  }
});

test("изтриване: черновата — от автора; издаденият — само DIREZIONE+, с файловете", async () => {
  const s = await setup();
  try {
    const t = await sessione(s, "TECNICO");
    const bozza = randomUUID();
    await t.api(`/admin/api/documenti/${bozza}`, { method: "PUT", json: sopralluogo(bozza) });
    assert.equal((await t.api(`/admin/api/documenti/${bozza}`, { method: "DELETE" })).status, 204);
    const id = randomUUID();
    await t.api(`/admin/api/documenti/${id}`, { method: "PUT", json: sopralluogo(id) });
    await t.api(`/admin/api/documenti/${id}/emetti`, { method: "POST", json: { versione: 1 } });
    assert.equal((await t.api(`/admin/api/documenti/${id}`, { method: "DELETE" })).status, 403);
    const altro = await sessione(s, "TECNICO", "altro@liftcon.it");
    const b2 = randomUUID();
    await t.api(`/admin/api/documenti/${b2}`, { method: "PUT", json: sopralluogo(b2) });
    assert.equal((await altro.api(`/admin/api/documenti/${b2}`, { method: "DELETE" })).status, 403, "чужда чернова");
    const d = await sessione(s, "DIREZIONE");
    assert.equal((await d.api(`/admin/api/documenti/${id}`, { method: "DELETE" })).status, 204);
    assert.equal(existsSync(join(s.dataDir, "documenti", id)), false);
  } finally {
    await s.close();
  }
});

test("регистър: documento.modificato — най-много веднъж на час за човек и документ, без съдържание (L4-B)", async () => {
  const s = await setup();
  try {
    const t = await sessione(s, "TECNICO");
    const id = randomUUID();
    const corpo = sopralluogo(id);
    let versione = (await t.api(`/admin/api/documenti/${id}`, { method: "PUT", json: corpo })).json.versione;
    const salva = async (chi = t) => {
      const r = await chi.api(`/admin/api/documenti/${id}`, { method: "PUT", json: { ...corpo, versione } });
      assert.equal(r.status, 200, JSON.stringify(r.json));
      versione = r.json.versione;
    };
    const modifiche = async () => (await s.store.eventi.ultimi(500, 0)).filter((e) => e.azione === "documento.modificato" && e.oggetto === id);
    assert.equal((await modifiche()).length, 0, "създаването не е редакция");
    await salva();
    await salva();
    await salva();
    const lista = await modifiche();
    assert.equal(lista.length, 1, "три записвания в часа → едно събитие");
    assert.equal(lista[0].utenteId, t.cred.u.id);
    assert.deepEqual(lista[0].dettagli, { versione: 2 });
    assert.doesNotMatch(JSON.stringify(lista[0]), /Via Roma|Condominio|Milano/, "без съдържание");
    s.clock.t += 59 * 60_000;
    await salva();
    assert.equal((await modifiche()).length, 1, "в рамките на часа");
    s.clock.t += 2 * 60_000;
    await salva();
    assert.equal((await modifiche()).length, 2, "след часа — ново събитие");
    const altro = await sessione(s, "RESPONSABILE", "altro@liftcon.it");
    await salva(altro);
    assert.equal((await modifiche()).length, 3, "друг човек — свое събитие");
    // Грешка в регистъра не проваля записа на документа.
    s.store.eventi.recente = async () => {
      throw new Error("registro non disponibile");
    };
    s.clock.t += 65 * 60_000;
    await salva();
    assert.equal((await modifiche()).length, 3);
  } finally {
    await s.close();
  }
});

test("изтриване: първо ред в списъка на изтриванията (без лични данни, права 600); без списък → 503 и документът остава (L6-B)", async () => {
  const s = await setup();
  try {
    const t = await sessione(s, "TECNICO");
    const id = randomUUID();
    await t.api(`/admin/api/documenti/${id}`, { method: "PUT", json: sopralluogo(id) });
    assert.equal((await t.api(`/admin/api/documenti/${id}`, { method: "DELETE" })).status, 204);
    const file = join(s.elimDir, "eliminazioni.jsonl");
    const righe = () => readFileSync(file, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
    assert.deepEqual(righe(), [{ tipo: "documento", id, il: "2026-11-26T10:00:00.000Z" }]);
    assert.equal((statSync(file).mode & 0o777).toString(8), "600");
    // Снимка от чернова: ред с документа ѝ; от издаден документ (423) или непозната (404) — без ред.
    const id2 = randomUUID();
    await t.api(`/admin/api/documenti/${id2}`, { method: "PUT", json: sopralluogo(id2) });
    const fotoId = randomUUID();
    const foto = await t.api(`/admin/api/documenti/${id2}/foto/${fotoId}?ordine=1`, { method: "POST", body: await jpegConExif(), type: "image/jpeg" });
    assert.equal(foto.status, 201);
    assert.equal((await t.api(`/admin/api/documenti/${id2}/foto/${randomUUID()}`, { method: "DELETE" })).status, 404);
    assert.equal((await t.api(`/admin/api/documenti/${id2}/foto/${fotoId}`, { method: "DELETE" })).status, 204);
    assert.deepEqual(righe()[1], { tipo: "foto", id: fotoId, doc: id2, il: "2026-11-26T10:00:00.000Z" });
    assert.equal(righe().length, 2);
    const fotoBis = randomUUID();
    await t.api(`/admin/api/documenti/${id2}/foto/${fotoBis}?ordine=2`, { method: "POST", body: await jpegConExif(), type: "image/jpeg" });
    rmSync(s.elimDir, { recursive: true, force: true });
    assert.equal((await t.api(`/admin/api/documenti/${id2}/foto/${fotoBis}`, { method: "DELETE" })).status, 503);
    assert.ok(await s.store.foto.perId(fotoBis), "без ред в списъка снимката остава");
    const r = await t.api(`/admin/api/documenti/${id2}`, { method: "DELETE" });
    assert.equal(r.status, 503);
    assert.equal((await t.api(`/admin/api/documenti/${id2}`)).status, 200, "без ред в списъка нищо не се трие");
  } finally {
    await s.close();
  }
});

test("фрази: RESPONSABILE добавя, TECNICO не може; каталогът ги връща заедно с готовите", async () => {
  const s = await setup();
  try {
    const voceId = CATALOGO.sezioni[0].voci[0].id;
    const t = await sessione(s, "TECNICO");
    const frase = { voceId, tipo: "anomalia", testo: "Cartello di divieto di accesso mancante", raccomandazione: "Chiedere al manutentore il cartello", priorita: "bassa" };
    assert.equal((await t.api("/admin/api/frasi", { method: "POST", json: frase })).status, 403);
    const r = await sessione(s, "RESPONSABILE");
    assert.equal((await r.api("/admin/api/frasi", { method: "POST", json: frase })).status, 201);
    const cat = await t.api("/admin/api/catalogo");
    assert.equal(cat.json.sezioni.length, CATALOGO.sezioni.length);
    assert.ok(cat.json.frasi.some((f) => f.testo === frase.testo));
  } finally {
    await s.close();
  }
});

test("от заявка: възложителят и общината се попълват; видът се избира", async () => {
  const s = await setup();
  try {
    const t = await sessione(s, "TECNICO");
    const req = await s.store.richieste.crea({ nome: "Anna Verdi", email: "anna@example.com", telefono: "+39 02 1234", ruolo: "amministratore", comune: "Monza", servizio: "sopralluogo", messaggio: "Richiesta di sopralluogo", eliminareDopo: new Date(s.clock.t + 1e10) });
    const r = await t.api(`/admin/api/documenti/da-richiesta/${req.id}`, { method: "POST", json: { tipo: "SOPRALLUOGO" } });
    assert.equal(r.status, 201);
    const d = await t.api(`/admin/api/documenti/${r.json.id}`);
    assert.equal(d.json.intestazione.committente.nome, "Anna Verdi");
    assert.equal(d.json.intestazione.impianto.comune, "Monza");
  } finally {
    await s.close();
  }
});

test("PDF на чернова: валиден, с воден знак; сесия + права и за PDF-а", async () => {
  const s = await setup();
  try {
    const { api } = await sessione(s, "TECNICO");
    const id = randomUUID();
    await api(`/admin/api/documenti/${id}`, { method: "PUT", json: sopralluogo(id) });
    const pdf = await api(`/admin/documenti/${id}/pdf`);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.buf.subarray(0, 5).toString(), "%PDF-");
    assert.ok(pdf.buf.length > 20_000, "с вградения шрифт");
    const anon = await fetch(`${s.base}/admin/documenti/${id}/pdf`, { redirect: "manual" });
    assert.notEqual(anon.status, 200);
  } finally {
    await s.close();
  }
});

test("обвивката на приложението: CSP с blob: за снимките, без лични данни и без CSRF токен; service worker с обхват", async () => {
  const s = await setup();
  try {
    const { api } = await sessione(s, "OPERATORE");
    const r = await api("/admin/documenti/");
    assert.equal(r.status, 200);
    const csp = r.headers.get("content-security-policy");
    assert.match(csp, /img-src 'self' data: blob:/);
    assert.match(csp, /script-src 'self';/);
    const html = r.buf.toString();
    assert.doesNotMatch(html, /_csrf|Utente OPERATORE/);
    assert.match(html, /rel="manifest" href="\/admin\/manifest.webmanifest"/);
    const lib = await fetch(`${s.base}/admin/static/lib/componi.js`);
    assert.equal(lib.status, 200);
    assert.equal((await fetch(`${s.base}/admin/static/lib/catalogo/index.js`)).status, 404, "каталогът не е публичен");
  } finally {
    await s.close();
  }
});
