// Отчет за намесата и подписът на клиента.

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { comeRuolo, Sessione, unico } from "./_client";

let master: Sessione;
let tecnico: Sessione;
let cliente: Sessione;
let ordineId: string;

/** Валиден PNG, достатъчно голям да мине проверката за „нарисувано". */
const firmaValida = `data:image/png;base64,${Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ...new Array(400).fill(0x42),
]).toString("base64")}`;

before(async () => {
  master = await comeRuolo("MASTER");
  tecnico = await comeRuolo("TECNICO");
  cliente = await comeRuolo("CLIENTE");
  const o = await master.post<{ id: string }>("/api/ordini", { oggetto: unico("OrdRap") });
  assert.equal(o.status, 201);
  ordineId = o.dati.id;
});

async function creaRapportino(s: Sessione = tecnico, extra: Record<string, unknown> = {}) {
  return s.post<{ id: string; numero: string; firmatoAt: string | null }>(
    `/api/ordini/${ordineId}/rapportini`,
    {
      descrizione: "Sostituzione pulsantiera di piano, verifica funzionamento.",
      oreLavoro: "1.5",
      esito: "RISOLTO",
      materiali: "PULS-LED x2",
      ...extra,
    },
  );
}

describe("rapportino di intervento", () => {
  test("техникът създава отчет; CLIENTE — не", async () => {
    const r = await creaRapportino();
    assert.equal(r.status, 201, JSON.stringify(r.dati));
    assert.match(r.dati.numero, /^RAP-\d{4}-\d{4}$/);
    assert.equal(r.dati.firmatoAt, null);

    const c = await creaRapportino(cliente);
    assert.equal(c.status, 403);
  });

  test("часове над 24 се отказват", async () => {
    const r = await creaRapportino(tecnico, { oreLavoro: "25" });
    assert.equal(r.status, 400);
  });

  test("подписът заключва отчета", async () => {
    const r = await creaRapportino();
    const f = await tecnico.post(`/api/rapportini/${r.dati.id}/firma`, {
      firmaCliente: firmaValida,
      firmatarioNome: "Mario Rossi",
      firmatarioRuolo: "Amministratore",
    });
    assert.equal(f.status, 200, JSON.stringify(f.dati));

    // Подписаното не се променя — иначе подписът не доказва нищо.
    const mod = await tecnico.put(`/api/rapportini/${r.dati.id}`, {
      descrizione: "Testo cambiato dopo la firma",
    });
    assert.equal(mod.status, 409);
  });

  test("вторият подпис се отказва", async () => {
    const r = await creaRapportino();
    const corpo = {
      firmaCliente: firmaValida,
      firmatarioNome: "Mario Rossi",
    };
    assert.equal((await tecnico.post(`/api/rapportini/${r.dati.id}/firma`, corpo)).status, 200);
    const secondo = await tecnico.post(`/api/rapportini/${r.dati.id}/firma`, corpo);
    assert.equal(secondo.status, 409);
  });

  test("подпис, който не е PNG, се отказва", async () => {
    const r = await creaRapportino();
    const f = await tecnico.post(`/api/rapportini/${r.dati.id}/firma`, {
      firmaCliente: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
      firmatarioNome: "Mario Rossi",
    });
    assert.equal(f.status, 400);
  });

  test("PNG по обявление, но не по съдържание, се отказва", async () => {
    const r = await creaRapportino();
    const finto = `data:image/png;base64,${Buffer.from("x".repeat(400)).toString("base64")}`;
    const f = await tecnico.post(`/api/rapportini/${r.dati.id}/firma`, {
      firmaCliente: finto,
      firmatarioNome: "Mario Rossi",
    });
    assert.equal(f.status, 400);
  });

  test("PDF-ът се генерира и е валиден файл", async () => {
    const r = await creaRapportino();
    const res = await fetch(
      `${process.env.TEST_BASE_URL ?? "http://127.0.0.1:3021"}/api/rapportini/${r.dati.id}/pdf`,
      { headers: { Cookie: tecnico.cookieHeader() } },
    );
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "application/pdf");
    const buf = Buffer.from(await res.arrayBuffer());
    assert.equal(buf.subarray(0, 5).toString(), "%PDF-");
    assert.ok(buf.length > 1000, "PDF-ът е подозрително малък");
  });

  test("отчет на чужд ордин не се създава", async () => {
    const r = await tecnico.post(`/api/ordini/${"00000000-0000-4000-8000-000000000000"}/rapportini`, {
      descrizione: "Intervento su ordine inesistente",
    });
    assert.equal(r.status, 404);
  });
});
