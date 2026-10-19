// „Area cliente" през реална база: клиентът вижда САМО своето.
//
// Изолацията е смисълът на тази страница: един администратор на кондоминиуми
// не бива да види импиантите, ордините и фактурите на друг, нито черновите
// и вътрешните модули на фирмата.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { comeRuolo, Sessione, PASSWORD, BASE, unico } from "./_client";
import { prisma } from "../../src/lib/prisma";

let master: Sessione;
let direzione: Sessione;
let bianchiId: string;
let altroId: string;

after(() => prisma.$disconnect());

async function nuovoCliente(amministratoreId: string | null) {
  const email = `${unico("cli").toLowerCase()}@test.local`;
  const r = await master.post<{ id: string; amministratoreId: string | null }>(
    "/api/utenti",
    {
      email,
      password: PASSWORD,
      nome: "Cliente",
      cognome: "Prova",
      ruolo: "CLIENTE",
      amministratoreId,
    },
  );
  assert.equal(r.status, 201, JSON.stringify(r.dati));
  const s = new Sessione();
  assert.equal(await s.entra(email), 200);
  return { id: r.dati.id, sessione: s, collegato: r.dati.amministratoreId };
}

/** Издадена фактура към даден администратор. */
async function fatturaPer(amministratoreId: string, emetti = true) {
  const f = await direzione.post<{ id: string }>("/api/fatture", {
    oggetto: unico("FattCli"),
    tipo: "EMESSA",
    amministratoreId,
  });
  assert.equal(f.status, 201);
  await direzione.post(`/api/fatture/${f.dati.id}/voci`, {
    descrizione: "Canone",
    quantita: "1",
    prezzoUnitario: "100",
    aliquotaIva: "22",
  });
  if (emetti)
    assert.equal(
      (
        await direzione.patch(`/api/fatture/${f.dati.id}/stato`, {
          stato: "EMESSA",
        })
      ).status,
      200,
    );
  return f.dati.id;
}

before(async () => {
  master = await comeRuolo("MASTER");
  direzione = await comeRuolo("DIREZIONE");
  const lista = await master.get<{
    righe: { id: string; ragioneSociale: string | null; nome: string }[];
  }>("/api/amministratori?size=50");
  const bianchi = lista.dati.righe.find((r) =>
    r.ragioneSociale?.includes("Bianchi"),
  );
  const altro = lista.dati.righe.find(
    (r) => !r.ragioneSociale?.includes("Bianchi"),
  );
  assert.ok(bianchi && altro, "сийдът създава поне два администратора");
  bianchiId = bianchi.id;
  altroId = altro.id;
});

describe("Area cliente: обхват", () => {
  test("вижда само импиантите и фактурите на своя администратор", async () => {
    const mia = await fatturaPer(bianchiId);
    const altrui = await fatturaPer(altroId);
    const bozza = await fatturaPer(bianchiId, false);
    const { sessione } = await nuovoCliente(bianchiId);
    const r = await sessione.get<{
      collegato: boolean;
      impianti: { matricola: string }[];
      fatture: { id: string }[];
    }>("/api/cliente/riepilogo");
    assert.equal(r.status, 200, JSON.stringify(r.dati));
    assert.equal(r.dati.collegato, true);
    const matricole = r.dati.impianti.map((i) => i.matricola);
    assert.ok(matricole.includes("MI-2024-0158"), "импиант на Torre Aurora");
    assert.ok(
      !matricole.includes("MB-2023-0044"),
      "импиантът на другия администратор НЕ се вижда",
    );
    const fatture = r.dati.fatture.map((f) => f.id);
    assert.ok(fatture.includes(mia));
    assert.ok(!fatture.includes(altrui), "чужда фактура");
    assert.ok(!fatture.includes(bozza), "черновата не е документ за клиента");

    // PDF: своята — да; чуждата и черновата — 404, без да казва коя е коя.
    const pdf = (id: string) =>
      fetch(`${BASE}/api/cliente/fatture/${id}/pdf`, {
        headers: { Cookie: sessione.cookieHeader() },
      });
    const own = await pdf(mia);
    assert.equal(own.status, 200);
    assert.equal(own.headers.get("content-type"), "application/pdf");
    assert.equal((await pdf(altrui)).status, 404);
    assert.equal((await pdf(bozza)).status, 404);
    assert.equal((await pdf(randomUUID())).status, 404);
  });

  test("несвързан клиент не вижда нищо", async () => {
    const { sessione } = await nuovoCliente(null);
    const r = await sessione.get<Record<string, unknown>>(
      "/api/cliente/riepilogo",
    );
    assert.equal(r.status, 200);
    assert.deepEqual(r.dati, { collegato: false });
  });

  test("вътрешните модули остават затворени за клиента", async () => {
    const { sessione } = await nuovoCliente(bianchiId);
    for (const url of [
      "/api/impianti",
      "/api/fatture",
      "/api/ordini",
      "/api/dashboard/stats",
    ])
      assert.equal((await sessione.get(url)).status, 403, url);
  });

  test("страницата е само за клиента: вътрешно ниво получава 403", async () => {
    assert.equal((await direzione.get("/api/cliente/riepilogo")).status, 403);
  });
});

describe("връзката клиент ↔ администратор", () => {
  test("непознат администратор → 422; смяна на нивото нулира връзката", async () => {
    const r = await master.post("/api/utenti", {
      email: `${unico("cli").toLowerCase()}@test.local`,
      password: PASSWORD,
      nome: "Cliente",
      cognome: "Errato",
      ruolo: "CLIENTE",
      amministratoreId: randomUUID(),
    });
    assert.equal(r.status, 422);

    const { id, collegato } = await nuovoCliente(bianchiId);
    assert.equal(collegato, bianchiId);
    const u = await master.put<{ amministratoreId: string | null }>(
      `/api/utenti/${id}`,
      { ruolo: "OPERATORE" },
    );
    assert.equal(u.status, 200, JSON.stringify(u.dati));
    assert.equal(u.dati.amministratoreId, null);
  });

  test("администратор на ДРУГА фирма не се свързва (422)", async () => {
    const t = await master.post<{ id: string }>("/api/tenants", {
      slug: unico("cli").toLowerCase(),
      ragioneSociale: "Altra Azienda S.r.l.",
      email: "info@altra.test",
    });
    assert.equal(t.status, 201, JSON.stringify(t.dati));
    const estraneo = await prisma.amministratore.create({
      data: { nome: "Estraneo", tipo: "PERSONA_FISICA", tenantId: t.dati.id },
    });
    const r = await master.post("/api/utenti", {
      email: `${unico("cli").toLowerCase()}@test.local`,
      password: PASSWORD,
      nome: "Cliente",
      cognome: "Altrove",
      ruolo: "CLIENTE",
      amministratoreId: estraneo.id,
      tenantId: null,
    });
    assert.equal(r.status, 422);
  });
});
