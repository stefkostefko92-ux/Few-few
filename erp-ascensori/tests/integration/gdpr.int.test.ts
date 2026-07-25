// Правата на субекта през реалните маршрути.
//
// Смисълът на този слой: че анонимизацията НАИСТИНА оставя записа без лице —
// и че точно това, което законът пази, оцелява.

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { comeRuolo, Sessione, BASE, PASSWORD, unico } from "./_client";

let admin: Sessione;
let master: Sessione;

before(async () => {
  admin = await comeRuolo("ADMIN");
  master = await comeRuolo("MASTER");
});

async function nuovoUtente() {
  const email = `${unico("gdpr").toLowerCase()}@test.local`;
  const r = await master.post<{ id: string }>("/api/utenti", {
    email,
    password: PASSWORD,
    nome: "Giovanni",
    cognome: "Verdi",
    ruolo: "OPERATORE",
  });
  assert.equal(r.status, 201, JSON.stringify(r.dati));
  const sessione = new Sessione();
  assert.equal(await sessione.entra(email), 200);
  return { id: r.dati.id, email, sessione };
}

async function scarica(s: Sessione, percorso: string) {
  const res = await fetch(BASE + percorso, { headers: { Cookie: s.cookieHeader() } });
  return { status: res.status, testo: await res.text(), headers: res.headers };
}

describe("права на субекта (GDPR)", () => {
  test("търсенето намира лицето и по трите категории ключове", async () => {
    const u = await nuovoUtente();
    const r = await admin.get<{ righe: { id: string; tipo: string }[] }>(
      `/api/gdpr?q=${encodeURIComponent(u.email.split("@")[0])}`,
    );
    assert.equal(r.status, 200);
    assert.ok(r.dati.righe.some((x) => x.id === u.id && x.tipo === "utente"));
  });

  test("къс низ не помита базата", async () => {
    const r = await admin.get<{ righe: unknown[] }>("/api/gdpr?q=a");
    assert.equal(r.status, 200);
    assert.deepEqual(r.dati.righe, []);
  });

  test("износът е машинно четим и БЕЗ удостоверения", async () => {
    const u = await nuovoUtente();
    const r = await scarica(admin, `/api/gdpr/utente/${u.id}/esporta`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type") ?? "", /application\/json/);
    assert.match(r.headers.get("content-disposition") ?? "", /attachment; filename="gdpr-utente-/);

    const dati = JSON.parse(r.testo) as {
      soggetto: Record<string, unknown>;
      collegati: Record<string, unknown[]>;
    };
    assert.equal(dati.soggetto.nome, "Giovanni");
    // Правото на достъп е върху личните данни, НЕ върху удостоверенията.
    assert.equal("password" in dati.soggetto, false, "хешът на паролата излиза навън");
    assert.equal("totpSegreto" in dati.soggetto, false, "тайната на втория фактор излиза навън");
    assert.equal("refreshToken" in dati.soggetto, false);
    // Влизането на лицето е негово данно и трябва да е в износа.
    assert.ok(Array.isArray(dati.collegati.sessioni));
    assert.ok(Array.isArray(dati.collegati.operazioni));
  });

  test("непознат вид субект дава 400, не 500", async () => {
    const u = await nuovoUtente();
    const r = await admin.get(`/api/gdpr/pippo/${u.id}/esporta`);
    assert.equal(r.status, 400);
  });

  test("планът обявява и какво пада, и какво остава — с разпоредба", async () => {
    const u = await nuovoUtente();
    const r = await admin.get<{
      piano: { campi: { campo: string }[]; conservati: { base: string }[] };
    }>(`/api/gdpr/utente/${u.id}/anonimizza`);
    assert.equal(r.status, 200);
    assert.ok(r.dati.piano.campi.some((c) => c.campo === "nome"));
    assert.ok(r.dati.piano.conservati.length > 0);
    for (const c of r.dati.piano.conservati) assert.ok(c.base.length > 10);
  });

  test("анонимизацията иска ИЗРИЧНО потвърждение", async () => {
    const u = await nuovoUtente();
    assert.equal((await admin.post(`/api/gdpr/utente/${u.id}/anonimizza`, {})).status, 400);
    assert.equal(
      (await admin.post(`/api/gdpr/utente/${u.id}/anonimizza`, { conferma: false })).status,
      400,
    );
  });

  test("след анонимизация лицето го няма, а следата остава", async () => {
    const u = await nuovoUtente();
    // Едно действие, за да има какво да оцелее.
    assert.equal(
      (
        await master.post("/api/condomini", {
          nome: unico("CondGdpr"),
          indirizzo: "Via X 1",
          citta: "Milano",
        })
      ).status,
      201,
    );

    const r = await admin.post<{ residui: string[]; sessioniRevocate: number }>(
      `/api/gdpr/utente/${u.id}/anonimizza`,
      { conferma: true },
    );
    assert.equal(r.status, 200, JSON.stringify(r.dati));
    assert.deepEqual(r.dati.residui, [], "останало е лично поле");
    assert.ok(r.dati.sessioniRevocate >= 1, "сесиите на лицето не паднаха");

    // Акаунтът вече не работи — иначе анонимизираният продължава да влиза.
    assert.equal((await u.sessione.richiesta("POST", "/api/auth/refresh")).status, 401);

    const dopo = await scarica(admin, `/api/gdpr/utente/${u.id}/esporta`);
    const dati = JSON.parse(dopo.testo) as { soggetto: Record<string, unknown> };
    assert.equal(dati.soggetto.nome, "Anonimizzato");
    // RFC 2606: подмененият адрес не може да стигне до чуждо истинско лице.
    assert.match(String(dati.soggetto.email), /@anonimizzato\.invalid$/);
    assert.equal(dati.soggetto.attivo, false);

    // Регистърът остава ЦЯЛ: анонимизацията не бива да чупи веригата на подписа.
    const v = await admin.post<{ integro: boolean }>("/api/audit/verifica", { limite: 300 });
    assert.equal(v.status, 200);
    assert.equal(v.dati.integro, true, "анонимизацията счупи веригата на одита");
  });

  test("самата операция влиза в регистъра", async () => {
    const u = await nuovoUtente();
    assert.equal(
      (await admin.post(`/api/gdpr/utente/${u.id}/anonimizza`, { conferma: true })).status,
      200,
    );
    const reg = await admin.get<{ righe: { entita: string; entitaId: string }[] }>(
      "/api/audit?entita=gdpr:utente&size=50",
    );
    assert.ok(reg.dati.righe.some((r) => r.entitaId === u.id));
  });

  test("под нивото на ADMIN правата не се упражняват", async () => {
    const u = await nuovoUtente();
    const operatore = await comeRuolo("OPERATORE");
    assert.equal((await operatore.get("/api/gdpr?q=verdi")).status, 403);
    assert.equal((await operatore.get(`/api/gdpr/utente/${u.id}/esporta`)).status, 403);
    assert.equal(
      (await operatore.post(`/api/gdpr/utente/${u.id}/anonimizza`, { conferma: true })).status,
      403,
    );
  });

  test("чуждо лице не се изнася с познат идентификатор", async () => {
    const u = await nuovoUtente();
    const slug = unico("gdpr-t").toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const t = await master.post<{ id: string }>("/api/tenants", {
      slug,
      ragioneSociale: "Altra GDPR",
      email: `${slug}@test.local`,
    });
    assert.equal(t.status, 201);
    const email = `${slug}-admin@test.local`;
    assert.equal(
      (
        await master.post("/api/utenti", {
          email,
          password: PASSWORD,
          nome: "Admin",
          cognome: "Altra",
          ruolo: "ADMIN",
          tenantId: t.dati.id,
        })
      ).status,
      201,
    );
    const altra = new Sessione();
    assert.equal(await altra.entra(email), 200);

    assert.equal((await altra.get(`/api/gdpr/utente/${u.id}/esporta`)).status, 404);
    assert.equal(
      (await altra.post(`/api/gdpr/utente/${u.id}/anonimizza`, { conferma: true })).status,
      404,
    );
  });
});
