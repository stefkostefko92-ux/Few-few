// Прикачените файлове през реалните маршрути.
//
// Тестовете тук са писани като опити за пробиване: точно това е повърхността,
// през която се качва изпълним код и се сваля чужд документ.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { comeRuolo, Sessione, BASE, unico } from "./_client";

let responsabile: Sessione;
let tecnico: Sessione;
let master: Sessione;
let impiantoId: string;

const PDF = new Uint8Array([
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25,
]);

before(async () => {
  responsabile = await comeRuolo("RESPONSABILE");
  tecnico = await comeRuolo("TECNICO");
  master = await comeRuolo("MASTER");
  const c = await responsabile.get<{ righe: { id: string }[] }>(
    "/api/condomini?size=5",
  );
  const i = await responsabile.post<{ id: string }>("/api/impianti", {
    matricola: unico("ALL"),
    marca: "Otis",
    modello: "Gen2",
    condominioId: c.dati.righe[0].id,
  });
  assert.equal(i.status, 201, JSON.stringify(i.dati));
  impiantoId = i.dati.id;
});

after(async () => {
  // Тестовете пишат по диска — не оставяме боклук зад себе си.
  if (process.env.STORAGE_DIR)
    await rm(process.env.STORAGE_DIR, { recursive: true, force: true });
});

/** Качва файл със сесийните бисквитки (multipart не минава през JSON помощника). */
async function carica(
  s: Sessione,
  dati: Uint8Array,
  nome: string,
  entita = "impianti",
  entitaId = impiantoId,
) {
  const form = new FormData();
  // Изричен `ArrayBuffer`: `Blob` не приема `Uint8Array` върху споделен буфер,
  // а типът на `Uint8Array` не гарантира кой е под него.
  const buffer = new ArrayBuffer(dati.length);
  new Uint8Array(buffer).set(dati);
  form.set("file", new Blob([buffer]), nome);
  form.set("entita", entita);
  form.set("entitaId", entitaId);
  const res = await fetch(`${BASE}/api/allegati`, {
    method: "POST",
    headers: { Cookie: s.cookieHeader() },
    body: form,
  });
  return {
    status: res.status,
    dati: (await res.json().catch(() => ({}))) as Record<string, unknown>,
  };
}

async function scarica(s: Sessione, id: string) {
  const res = await fetch(`${BASE}/api/allegati/${id}`, {
    headers: { Cookie: s.cookieHeader() },
  });
  return {
    status: res.status,
    headers: res.headers,
    corpo: Buffer.from(await res.arrayBuffer()),
  };
}

describe("качване", () => {
  test("PDF минава и се връща непокътнат", async () => {
    const r = await carica(tecnico, PDF, "verbale.pdf");
    assert.equal(r.status, 201, JSON.stringify(r.dati));
    assert.equal(r.dati.mimeType, "application/pdf");
    assert.equal(r.dati.nome, "verbale.pdf");

    const d = await scarica(tecnico, String(r.dati.id));
    assert.equal(d.status, 200);
    assert.deepEqual(new Uint8Array(d.corpo), PDF);
  });

  test("свалянето НЕ може да изпълни нищо в нашия домейн", async () => {
    const r = await carica(tecnico, PDF, "x.pdf");
    const d = await scarica(tecnico, String(r.dati.id));
    // Четирите предпазителя срещу съхранен XSS.
    assert.match(d.headers.get("content-disposition") ?? "", /^attachment;/);
    assert.equal(d.headers.get("x-content-type-options"), "nosniff");
    assert.match(d.headers.get("content-security-policy") ?? "", /sandbox/);
    assert.equal(d.headers.get("content-type"), "application/pdf");
  });

  test("HTML и SVG не се приемат, дори с разширение .pdf", async () => {
    const html = new TextEncoder().encode(
      "<html><script>alert(document.cookie)</script></html>",
    );
    const r = await carica(tecnico, html, "innocuo.pdf");
    assert.equal(r.status, 422, JSON.stringify(r.dati));
    assert.match(String(r.dati.error), /Formato non ammesso/);

    const svg = new TextEncoder().encode('<svg onload="alert(1)"></svg>');
    assert.equal((await carica(tecnico, svg, "logo.svg")).status, 422);
  });

  test("името на файла не изнася път навън", async () => {
    const r = await carica(tecnico, PDF, "../../etc/passwd");
    assert.equal(r.status, 201, JSON.stringify(r.dati));
    // Оригиналното име се обезврежда, а на диска и без това не отива.
    assert.equal(String(r.dati.nome).includes("/"), false);
    assert.equal(String(r.dati.nome).includes(".."), false);
  });

  test("името в хедъра не инжектира чужди хедъри", async () => {
    const r = await carica(tecnico, PDF, "a\r\nX-Iniettato: si.pdf");
    assert.equal(r.status, 201);
    const d = await scarica(tecnico, String(r.dati.id));
    assert.equal(d.headers.get("x-iniettato"), null);
    assert.equal(
      (d.headers.get("content-disposition") ?? "").includes("\n"),
      false,
    );
  });

  test("празният файл се отказва", async () => {
    assert.equal(
      (await carica(tecnico, new Uint8Array(0), "vuoto.pdf")).status,
      422,
    );
  });

  test("непозната същност не приема файлове", async () => {
    const r = await carica(tecnico, PDF, "x.pdf", "users", impiantoId);
    assert.equal(r.status, 400);
  });

  test("несъществуващ запис не приема файлове", async () => {
    const r = await carica(
      tecnico,
      PDF,
      "x.pdf",
      "impianti",
      "00000000-0000-0000-0000-000000000000",
    );
    assert.equal(r.status, 404);
  });
});

describe("достъп", () => {
  test("чужда фирма не сваля файла с познат идентификатор", async () => {
    const r = await carica(tecnico, PDF, "riservato.pdf");
    assert.equal(r.status, 201);

    const slug = unico("all-t")
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-");
    const t = await master.post<{ id: string }>("/api/tenants", {
      slug,
      ragioneSociale: "Altra Ditta",
      email: `${slug}@test.local`,
    });
    assert.equal(t.status, 201);
    const email = `${slug}-tec@test.local`;
    assert.equal(
      (
        await master.post("/api/utenti", {
          email,
          password: "collina tranquilla 2026",
          nome: "Tec",
          cognome: "Altra",
          ruolo: "RESPONSABILE",
          tenantId: t.dati.id,
        })
      ).status,
      201,
    );
    const altra = new Sessione();
    assert.equal(await altra.entra(email, "collina tranquilla 2026"), 200);
    assert.equal((await scarica(altra, String(r.dati.id))).status, 404);
  });

  test("изтриването на доказателство не е работа на техника", async () => {
    const r = await carica(tecnico, PDF, "prova.pdf");
    assert.equal(
      (await tecnico.richiesta("DELETE", `/api/allegati/${r.dati.id}`)).status,
      403,
    );
    assert.equal(
      (await responsabile.richiesta("DELETE", `/api/allegati/${r.dati.id}`))
        .status,
      200,
    );
    assert.equal((await scarica(responsabile, String(r.dati.id))).status, 404);
  });

  test("списъкът не издава пътя на диска", async () => {
    await carica(tecnico, PDF, "elenco.pdf");
    const l = await tecnico.get<{ righe: Record<string, unknown>[] }>(
      `/api/allegati?entita=impianti&entitaId=${impiantoId}`,
    );
    assert.equal(l.status, 200);
    assert.ok(l.dati.righe.length > 0);
    for (const r of l.dati.righe) assert.equal("percorso" in r, false);
  });
});
