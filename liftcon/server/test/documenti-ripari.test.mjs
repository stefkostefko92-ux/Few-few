// Регресионни тестове по ревюто на Кодаджията за документите (26.11.2026) — първо падат, после поправката.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { setup, client, creaUtente, entra, ORIGIN, csrfDa } from "./helpers.mjs";
import { CATALOGO } from "../dist/documenti/condiviso/catalogo/index.js";
import { nuovoDocumento } from "../dist/documenti/condiviso/nuovo.js";

async function sessione(s, ruolo, email = `${ruolo.toLowerCase()}@liftcon.it`) {
  const cred = await creaUtente(s.store, { sig: s.sig, ruolo, email, nome: `Utente ${ruolo}` });
  const c = client(s.base);
  await entra(c, s.clock, { email, password: cred.password, segreto: cred.segreto });
  const info = JSON.parse((await c.req("/admin/api/sessione")).text);
  const api = async (path, { method = "GET", json, body, type, headers = {} } = {}) => {
    const h = { cookie: c.cookie, origin: ORIGIN, "x-csrf-token": info.csrf, ...headers };
    if (json) h["content-type"] = "application/json";
    if (type) h["content-type"] = type;
    const res = await fetch(s.base + path, { method, redirect: "manual", headers: h, body: json ? JSON.stringify(json) : body });
    const ct = res.headers.get("content-type") ?? "";
    return { status: res.status, headers: res.headers, json: ct.includes("json") ? await res.json() : null };
  };
  return { api, info, c, utente: await s.store.utenti.perEmail(email) };
}

function sopralluogo(id) {
  const d = nuovoDocumento("SOPRALLUOGO", id);
  d.intestazione.committente.nome = "Condominio Via Roma 1";
  d.intestazione.impianto = { ...d.intestazione.impianto, indirizzo: "Via Roma 1", comune: "Milano", tipo: "elettrico_lm" };
  d.intestazione.data = "2026-11-26";
  d.dati.esiti = { [CATALOGO.sezioni[0].voci[0].id]: { esito: "ok", nota: "", foto: [] } };
  return { tipo: d.tipo, versione: 0, intestazione: d.intestazione, dati: d.dati, foto: [] };
}
const jpeg = () => sharp({ create: { width: 800, height: 600, channels: 3, background: "#888" } }).jpeg().toBuffer();
const meta = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");

test("изтрит документ не се възкресява: PUT със същия id → 410", async () => {
  const s = await setup();
  try {
    const { api } = await sessione(s, "DIREZIONE");
    const id = randomUUID();
    await api(`/admin/api/documenti/${id}`, { method: "PUT", json: sopralluogo(id) });
    assert.equal((await api(`/admin/api/documenti/${id}`, { method: "DELETE" })).status, 204);
    const r = await api(`/admin/api/documenti/${id}`, { method: "PUT", json: sopralluogo(id) });
    assert.equal(r.status, 410);
    assert.equal(await s.store.documenti.perId(id), null);
  } finally {
    await s.close();
  }
});

test("двойно „Emetti“ едновременно: един номер, без дупка в номерацията", async () => {
  const s = await setup();
  try {
    const { api } = await sessione(s, "TECNICO");
    const id = randomUUID();
    await api(`/admin/api/documenti/${id}`, { method: "PUT", json: sopralluogo(id) });
    const [a, b] = await Promise.all([1, 2].map(() => api(`/admin/api/documenti/${id}/emetti`, { method: "POST", json: { versione: 1 } })));
    assert.deepEqual([a.status, b.status].sort(), [200, 409]);
    const id2 = randomUUID();
    await api(`/admin/api/documenti/${id2}`, { method: "PUT", json: sopralluogo(id2) });
    assert.equal((await api(`/admin/api/documenti/${id2}/emetti`, { method: "POST", json: { versione: 1 } })).json.numero, "SOP-2026-002");
  } finally {
    await s.close();
  }
});

test("снимка в процес на качване спира издаването (409); след издаването качване → 423", async () => {
  const s = await setup();
  try {
    const { api, utente } = await sessione(s, "TECNICO");
    const id = randomUUID();
    await api(`/admin/api/documenti/${id}`, { method: "PUT", json: sopralluogo(id) });
    const caricamento = s.admin.documenti.caricaFoto(id, randomUUID(), await jpeg(), { ordine: 1, didascalia: "Porta", ubicazione: "", riferimento: "" });
    const e = await s.admin.documenti.emetti(utente, id, 1);
    assert.equal(e.esito, "occupato");
    await caricamento;
    const d = await s.admin.documenti.carica(id);
    assert.equal((await s.admin.documenti.emetti(utente, id, d.versione)).esito, "ok");
    assert.equal((await s.admin.documenti.caricaFoto(id, randomUUID(), await jpeg(), { ordine: 2, didascalia: "x", ubicazione: "", riferimento: "" })).esito, "emesso");
  } finally {
    await s.close();
  }
});

test("„Nuova revisione“ два пъти → същата чернова (без втора Rev. 1)", async () => {
  const s = await setup();
  try {
    const { api } = await sessione(s, "TECNICO");
    const id = randomUUID();
    await api(`/admin/api/documenti/${id}`, { method: "PUT", json: sopralluogo(id) });
    await api(`/admin/api/documenti/${id}/emetti`, { method: "POST", json: { versione: 1 } });
    const a = await api(`/admin/api/documenti/${id}/revisione`, { method: "POST", json: {} });
    const b = await api(`/admin/api/documenti/${id}/revisione`, { method: "POST", json: {} });
    assert.equal(a.status, 201);
    assert.equal(b.status, 200);
    assert.equal(a.json.id, b.json.id);
  } finally {
    await s.close();
  }
});

test("PATCH на фраза (деактивиране) не трие препоръката и приоритета; влиза в регистъра", async () => {
  const s = await setup();
  try {
    const { api } = await sessione(s, "RESPONSABILE");
    const f = await api("/admin/api/frasi", { method: "POST", json: { voceId: CATALOGO.sezioni[0].voci[0].id, tipo: "anomalia", testo: "Cartello mancante", raccomandazione: "Chiedere il cartello", priorita: "bassa" } });
    assert.equal((await api(`/admin/api/frasi/${f.json.id}`, { method: "PATCH", json: { attiva: false } })).status, 204);
    const dopo = await s.store.frasi.perId(f.json.id);
    assert.equal(dopo.attiva, false);
    assert.equal(dopo.raccomandazione, "Chiedere il cartello");
    assert.equal(dopo.priorita, "bassa");
    assert.ok((await s.store.eventi.ultimi(20, 0)).some((e) => e.azione === "frase.aggiornata"));
  } finally {
    await s.close();
  }
});

test("надписът на снимката идва в заглавие (не в адреса, който влиза в лога на Nginx)", async () => {
  const s = await setup();
  try {
    const { api } = await sessione(s, "TECNICO");
    const id = randomUUID();
    await api(`/admin/api/documenti/${id}`, { method: "PUT", json: sopralluogo(id) });
    const r = await api(`/admin/api/documenti/${id}/foto/${randomUUID()}?ordine=3`, { method: "POST", body: await jpeg(), type: "image/jpeg", headers: { "x-foto-meta": meta({ didascalia: "Int. 5, porta di piano", ubicazione: "Piano 2", riferimento: "" }) } });
    assert.equal(r.status, 201);
    assert.equal(r.json.didascalia, "Int. 5, porta di piano");
    assert.equal(r.json.ubicazione, "Piano 2");
    assert.equal(r.json.ordine, 3);
    const brutto = await api(`/admin/api/documenti/${id}/foto/${randomUUID()}`, { method: "POST", body: await jpeg(), type: "image/jpeg", headers: { "x-foto-meta": "non-json" } });
    assert.equal(brutto.status, 400);
  } finally {
    await s.close();
  }
});

test("изход: Clear-Site-Data трие данните на устройството; снимките не остават в HTTP кеша", async () => {
  const s = await setup();
  try {
    const { api, c } = await sessione(s, "TECNICO");
    const id = randomUUID();
    await api(`/admin/api/documenti/${id}`, { method: "PUT", json: sopralluogo(id) });
    const fotoId = randomUUID();
    await api(`/admin/api/documenti/${id}/foto/${fotoId}`, { method: "POST", body: await jpeg(), type: "image/jpeg" });
    const img = await fetch(`${s.base}/admin/documenti/${id}/foto/${fotoId}?mini=1`, { headers: { cookie: c.cookie } });
    assert.match(img.headers.get("cache-control"), /no-store/);
    const pagina = await c.req("/admin");
    const out = await c.req("/admin/logout", { method: "POST", form: { _csrf: csrfDa(pagina.text) } });
    assert.equal(out.status, 303);
    assert.match(out.headers.get("clear-site-data") ?? "", /"storage"/);
  } finally {
    await s.close();
  }
});

test("service worker-ът не кешира сесията (CSRF токена); само каталога", () => {
  const sw = readFileSync(join(import.meta.dirname, "..", "admin-static", "documenti", "sw.js"), "utf8");
  assert.doesNotMatch(sw, /\/admin\/api\/sessione/);
  assert.match(sw, /\/admin\/api\/catalogo/);
});

test("richiestaId към несъществуваща заявка не се записва; пълният списък (sintesi=1) не се реже на 50", async () => {
  const s = await setup();
  try {
    const { api } = await sessione(s, "TECNICO");
    const id = randomUUID();
    await api(`/admin/api/documenti/${id}`, { method: "PUT", json: { ...sopralluogo(id), richiestaId: "inventata" } });
    assert.equal((await s.store.documenti.perId(id)).richiestaId, null);
    for (let i = 0; i < 55; i++) {
      const x = randomUUID();
      await api(`/admin/api/documenti/${x}`, { method: "PUT", json: sopralluogo(x) });
    }
    const tutti = await api("/admin/api/documenti?sintesi=1");
    assert.equal(tutti.json.righe.length, 56);
  } finally {
    await s.close();
  }
});

test("страницата /admin/frasi: RESPONSABILE добавя и изключва; TECNICO — 403", async () => {
  const s = await setup();
  try {
    const t = await sessione(s, "TECNICO");
    assert.equal((await t.c.req("/admin/frasi")).status, 403);
    const r = await sessione(s, "RESPONSABILE");
    const pag = await r.c.req("/admin/frasi");
    assert.equal(pag.status, 200);
    const voceId = CATALOGO.sezioni[1].voci[0].id;
    const ok = await r.c.req("/admin/frasi", { method: "POST", form: { _csrf: csrfDa(pag.text), voceId, tipo: "chiarimento", testo: "Chiedere da quando è presente il rumore", raccomandazione: "ignorata", priorita: "alta" } });
    assert.equal(ok.location, "/admin/frasi?ok=1");
    const [f] = await s.store.frasi.tutte();
    assert.equal(f.raccomandazione, "", "въпросът няма препоръка");
    const no = await r.c.req("/admin/frasi", { method: "POST", form: { _csrf: csrfDa(pag.text), voceId: "inventata.voce", tipo: "anomalia", testo: "Testo", priorita: "media" } });
    assert.equal(no.location, "/admin/frasi?errore=1", "непозната точка");
    await r.c.req(`/admin/frasi/${f.id}/attiva`, { method: "POST", form: { _csrf: csrfDa(pag.text) } });
    assert.equal((await s.store.frasi.perId(f.id)).attiva, false);
  } finally {
    await s.close();
  }
});
