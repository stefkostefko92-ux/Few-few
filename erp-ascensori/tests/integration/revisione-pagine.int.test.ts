// Находките от прегледа на страниците, всяка с тест, който пада без поправката.
//
// Прегледът четеше страница срещу маршрут: формата праща `null`, схемата не го
// приема; сторното сменяше вида на издадения файл; краят на периода губеше
// последния ден. HTTP тестовете по-долу пазят сървърната половина.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { comeRuolo, Sessione, BASE, unico } from "./_client";
import { prisma } from "../../src/lib/prisma";

let master: Sessione;
let direzione: Sessione;
let studioId: string;

after(() => prisma.$disconnect());

before(async () => {
  master = await comeRuolo("MASTER");
  direzione = await comeRuolo("DIREZIONE");
  // Получател с пълни реквизити за SdI (от сийда) — иначе XML-ът е 422.
  const lista = await direzione.get<{
    righe: { id: string; ragioneSociale: string | null }[];
  }>("/api/amministratori?size=50");
  const studio = lista.dati.righe.find((r) =>
    r.ragioneSociale?.includes("Bianchi"),
  );
  assert.ok(studio, "сийдът създава Studio Bianchi");
  studioId = studio.id;
});

const giorno = (delta: number) =>
  new Date(Date.now() + delta * 86_400_000).toISOString().slice(0, 10);

describe("анагрифики: празно поле от формата = null", () => {
  test("артикул без описание се редактира (преди: 400)", async () => {
    const a = await master.post<{ id: string }>("/api/articoli", {
      codice: unico("ART"),
      nome: "Senza descrizione",
    });
    assert.equal(a.status, 201);
    const r = await master.put(`/api/articoli/${a.dati.id}`, {
      nome: "Senza descrizione (v2)",
      descrizione: null,
    });
    assert.equal(r.status, 200, JSON.stringify(r.dati));
  });

  test("импиант в „fermo amministrativo“ се редактира, но не се налага от менюто", async () => {
    const i = await master.post<{ id: string }>("/api/impianti", {
      matricola: unico("FA"),
      marca: "Otis",
      modello: "Gen2",
      matricolaComune: "MI-000123",
      comune: "Milano",
      tipo: "ASCENSORE",
    });
    assert.equal(i.status, 201, JSON.stringify(i.dati));
    // Ръчно налагане — отказ.
    const manuale = await master.put(`/api/impianti/${i.dati.id}`, {
      stato: "FERMO_AMMINISTRATIVO",
    });
    assert.equal(manuale.status, 409, JSON.stringify(manuale.dati));
    // Спряна от проверка (тук — пряко в базата) → формата праща състоянието
    // обратно заедно с бележката и записът минава.
    await prisma.impianto.update({
      where: { id: i.dati.id },
      data: { stato: "FERMO_AMMINISTRATIVO" },
    });
    const nota = await master.put(`/api/impianti/${i.dati.id}`, {
      stato: "FERMO_AMMINISTRATIVO",
      note: "In attesa di nuova verifica",
      matricolaComune: "MI-000124",
    });
    assert.equal(nota.status, 200, JSON.stringify(nota.dati));
    const riga = await prisma.impianto.findUnique({ where: { id: i.dati.id } });
    assert.equal(
      riga?.matricolaComune,
      "MI-000124",
      "нормативното поле се пише",
    );
  });
});

describe("договор в чернова", () => {
  test("нова начална дата мести и графиците", async () => {
    const c = await master.post<{ id: string }>("/api/contratti", {
      oggetto: unico("Contratto"),
      canone: "250.00",
      dataInizio: giorno(-400),
      dataFine: giorno(365),
      periodicitaVisite: "SEMESTRALE",
      periodicitaFatturazione: "TRIMESTRALE",
    });
    assert.equal(c.status, 201, JSON.stringify(c.dati));
    const nuova = giorno(30);
    const r = await master.put(`/api/contratti/${c.dati.id}`, {
      dataInizio: nuova,
    });
    assert.equal(r.status, 200, JSON.stringify(r.dati));
    const d = await prisma.contratto.findUnique({ where: { id: c.dati.id } });
    assert.equal(d?.prossimaVisita?.toISOString().slice(0, 10), nuova);
    assert.equal(d?.prossimaFattura?.toISOString().slice(0, 10), nuova);
  });
});

describe("фактури: сторно и пратката за conservazione", () => {
  async function emessa(dataFattura?: Date) {
    const f = await direzione.post<{ id: string; numero: string }>(
      "/api/fatture",
      { oggetto: unico("Rev"), tipo: "EMESSA", amministratoreId: studioId },
    );
    assert.equal(f.status, 201);
    await direzione.post(`/api/fatture/${f.dati.id}/voci`, {
      descrizione: "Canone",
      quantita: "1",
      prezzoUnitario: "100.00",
      aliquotaIva: "22",
    });
    if (dataFattura)
      await prisma.fattura.update({
        where: { id: f.dati.id },
        data: { data: dataFattura },
      });
    const e = await direzione.patch(`/api/fatture/${f.dati.id}/stato`, {
      stato: "EMESSA",
    });
    assert.equal(e.status, 200, JSON.stringify(e.dati));
    return f.dati;
  }

  test("сторнирана и неподавана: XML 409 (кредитното известие е друг документ)", async () => {
    const f = await emessa();
    assert.equal(
      (
        await direzione.patch(`/api/fatture/${f.id}/stato`, {
          stato: "STORNATA",
        })
      ).status,
      200,
    );
    const res = await fetch(`${BASE}/api/fatture/${f.id}/xml`, {
      headers: { Cookie: direzione.cookieHeader() },
    });
    assert.equal(res.status, 409);
    assert.match((await res.json()).error, /nota di credito/);
  });

  test("подадена, после сторнирана: файлът остава TD01 „както е издаден“", async () => {
    const f = await emessa();
    const prima = await fetch(`${BASE}/api/fatture/${f.id}/xml`, {
      headers: { Cookie: direzione.cookieHeader() },
    });
    assert.equal(prima.status, 200);
    await direzione.patch(`/api/fatture/${f.id}/stato`, { stato: "STORNATA" });
    const dopo = await fetch(`${BASE}/api/fatture/${f.id}/xml`, {
      headers: { Cookie: direzione.cookieHeader() },
    });
    assert.equal(dopo.status, 200);
    const xml = await dopo.text();
    assert.match(xml, /<TipoDocumento>TD01<\/TipoDocumento>/);
    assert.equal(
      dopo.headers.get("content-disposition"),
      prima.headers.get("content-disposition"),
      "същото име на файла",
    );
  });

  test("последният ден на периода влиза в пратката (и с час в деня)", async () => {
    // Година далеч от другите тестове, за да е пратката само наша.
    const anno = 2031;
    const f = await emessa(new Date(anno, 2, 31, 15, 30));
    const res = await fetch(
      `${BASE}/api/fatture/conservazione?dal=${anno}-03-31&al=${anno}-03-31`,
      { headers: { Cookie: direzione.cookieHeader() } },
    );
    assert.equal(res.status, 200, await res.clone().text());
    const zip = Buffer.from(await res.arrayBuffer());
    assert.ok(
      zip.includes(Buffer.from(f.numero)),
      "фактурата от 15:30 е вътре",
    );
  });
});
