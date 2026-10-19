// Документ от документ през реална база: оферта → ордин/фактура,
// ордин → фактура/DDT. Състояния, роли, копирани редове, тотали, материали.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { comeRuolo, Sessione, unico } from "./_client";
import { prisma } from "../../src/lib/prisma";

let direzione: Sessione;
let tecnico: Sessione;
let operatore: Sessione;
let studioId: string;

after(() => prisma.$disconnect());

before(async () => {
  direzione = await comeRuolo("DIREZIONE");
  tecnico = await comeRuolo("TECNICO");
  operatore = await comeRuolo("OPERATORE");
  const lista = await direzione.get<{
    righe: { id: string; ragioneSociale: string | null }[];
  }>("/api/amministratori?size=50");
  const studio = lista.dati.righe.find((r) =>
    r.ragioneSociale?.includes("Bianchi"),
  );
  assert.ok(studio, "сийдът създава Studio Bianchi");
  studioId = studio.id;
});

/** Оферта с два реда, доведена до дадено състояние. */
async function preventivo(stato: "BOZZA" | "APPROVATO") {
  const p = await direzione.post<{ id: string; numero: string }>(
    "/api/preventivi",
    { oggetto: unico("Prev"), amministratoreId: studioId },
  );
  assert.equal(p.status, 201, JSON.stringify(p.dati));
  for (const [descrizione, quantita, prezzoUnitario] of [
    ["Fune d'acciaio", "60", "7,90"],
    ["Manodopera specializzata", "12", "45"],
  ])
    assert.equal(
      (
        await direzione.post(`/api/preventivi/${p.dati.id}/voci`, {
          descrizione,
          quantita,
          prezzoUnitario,
          aliquotaIva: "22",
        })
      ).status,
      201,
    );
  if (stato === "APPROVATO")
    for (const s of ["INVIATO", "APPROVATO"])
      assert.equal(
        (
          await direzione.patch(`/api/preventivi/${p.dati.id}/stato`, {
            stato: s,
          })
        ).status,
        200,
      );
  return p.dati;
}

describe("оферта → ордин", () => {
  test("само приета оферта; един ордин на оферта", async () => {
    const bozza = await preventivo("BOZZA");
    assert.equal(
      (await operatore.post(`/api/preventivi/${bozza.id}/ordine`, {})).status,
      409,
    );
    const p = await preventivo("APPROVATO");
    const o = await operatore.post<{ id: string; numero: string }>(
      `/api/preventivi/${p.id}/ordine`,
      {},
    );
    assert.equal(o.status, 201, JSON.stringify(o.dati));
    const ordine = await prisma.ordineLavoro.findUnique({
      where: { id: o.dati.id },
      include: { storico: true },
    });
    assert.equal(ordine?.preventivoId, p.id);
    assert.equal(ordine?.stato, "BOZZA");
    assert.equal(ordine?.storico.length, 1, "първият ред в хронологията");
    const di = await operatore.post<{ error: string }>(
      `/api/preventivi/${p.id}/ordine`,
      {},
    );
    assert.equal(di.status, 409);
    assert.match(di.dati.error, new RegExp(o.dati.numero));
    // Детайлът на офертата показва ордина.
    const det = await direzione.get<{ ordiniLavoro: { id: string }[] }>(
      `/api/preventivi/${p.id}`,
    );
    assert.equal(det.dati.ordiniLavoro[0].id, o.dati.id);
  });
});

describe("оферта → фактура", () => {
  test("чернова с редовете и тоталите на офертата; само DIREZIONE+", async () => {
    const p = await preventivo("APPROVATO");
    assert.equal(
      (await tecnico.post(`/api/preventivi/${p.id}/fattura`, {})).status,
      403,
    );
    const f = await direzione.post<{ id: string }>(
      `/api/preventivi/${p.id}/fattura`,
      {},
    );
    assert.equal(f.status, 201, JSON.stringify(f.dati));
    const fattura = await prisma.fattura.findUnique({
      where: { id: f.dati.id },
      include: { voci: { orderBy: { ordine: "asc" } } },
    });
    const prev = await prisma.preventivo.findUnique({ where: { id: p.id } });
    assert.equal(fattura?.stato, "BOZZA");
    assert.equal(fattura?.preventivoId, p.id);
    assert.equal(fattura?.amministratoreId, studioId);
    assert.equal(fattura?.voci.length, 2);
    assert.equal(fattura?.voci[0].prezzoUnitario.toString(), "7.9");
    assert.equal(
      fattura?.totaleLordo.toString(),
      prev?.totaleLordo.toString(),
      "същият тотал като офертата",
    );
    // Втора (салдо след аванс) е позволена; детайлът на офертата ги изрежда.
    assert.equal(
      (await direzione.post(`/api/preventivi/${p.id}/fattura`, {})).status,
      201,
    );
    const det = await direzione.get<{ fatture: unknown[] }>(
      `/api/preventivi/${p.id}`,
    );
    assert.equal(det.dati.fatture.length, 2);
    // Фактурите са икономически данни: под DIREZIONE не се показват.
    const op = await operatore.get<Record<string, unknown>>(
      `/api/preventivi/${p.id}`,
    );
    assert.equal("fatture" in op.dati, false);
  });

  test("неприета оферта не се фактурира", async () => {
    const bozza = await preventivo("BOZZA");
    assert.equal(
      (await direzione.post(`/api/preventivi/${bozza.id}/fattura`, {})).status,
      409,
    );
  });
});

describe("ордин → фактура и DDT", () => {
  test("от оферта: фактурата носи договорените редове", async () => {
    const p = await preventivo("APPROVATO");
    const o = await operatore.post<{ id: string }>(
      `/api/preventivi/${p.id}/ordine`,
      {},
    );
    // Черновата не се фактурира.
    assert.equal(
      (await direzione.post(`/api/ordini/${o.dati.id}/fattura`, {})).status,
      409,
    );
    assert.equal(
      (
        await direzione.patch(`/api/ordini/${o.dati.id}/stato`, {
          stato: "EMESSO",
        })
      ).status,
      200,
    );
    const f = await direzione.post<{ id: string }>(
      `/api/ordini/${o.dati.id}/fattura`,
      {},
    );
    assert.equal(f.status, 201, JSON.stringify(f.dati));
    const fattura = await prisma.fattura.findUnique({
      where: { id: f.dati.id },
      include: { voci: true },
    });
    assert.equal(fattura?.ordineLavoroId, o.dati.id);
    assert.equal(fattura?.preventivoId, p.id);
    assert.equal(fattura?.voci.length, 2);
  });

  test("без оферта: материалите от рапортините — фактура и DDT", async () => {
    const o = await direzione.post<{ id: string }>("/api/ordini", {
      oggetto: unico("OrdMat"),
      priorita: "URGENTE",
    });
    assert.equal(o.status, 201);
    // Без материали DDT няма какво да носи.
    assert.equal(
      (await operatore.post(`/api/ordini/${o.dati.id}/ddt`, {})).status,
      409,
    );
    const con = await direzione.post<{ id: string }>("/api/articoli", {
      codice: unico("CP"),
      nome: "Pulsante con prezzo",
      prezzoVendita: "12,50",
    });
    const senza = await direzione.post<{ id: string }>("/api/articoli", {
      codice: unico("SP"),
      nome: "Ricambio senza prezzo",
    });
    for (const a of [con.dati.id, senza.dati.id])
      await direzione.post("/api/movimenti", {
        articoloId: a,
        tipo: "ENTRATA",
        quantita: 20,
      });
    for (let i = 0; i < 2; i++) {
      const r = await tecnico.post<{ id: string }>(
        `/api/ordini/${o.dati.id}/rapportini`,
        {
          descrizione: "Sostituzione pulsanti",
          oreLavoro: "1",
          esito: "RISOLTO",
        },
      );
      assert.equal(r.status, 201, JSON.stringify(r.dati));
      await tecnico.post(`/api/rapportini/${r.dati.id}/materiali`, {
        articoloId: con.dati.id,
        quantita: 2,
      });
    }
    const ultimo = await prisma.rapportino.findFirst({
      where: { ordineLavoroId: o.dati.id },
    });
    await tecnico.post(`/api/rapportini/${ultimo!.id}/materiali`, {
      articoloId: senza.dati.id,
      quantita: 1,
    });

    await direzione.patch(`/api/ordini/${o.dati.id}/stato`, {
      stato: "EMESSO",
    });
    const f = await direzione.post<{ id: string; senzaPrezzo: string[] }>(
      `/api/ordini/${o.dati.id}/fattura`,
      {},
    );
    assert.equal(f.status, 201, JSON.stringify(f.dati));
    assert.equal(f.dati.senzaPrezzo.length, 1, "артикулът без цена се казва");
    const voci = await prisma.voceFattura.findMany({
      where: { fatturaId: f.dati.id },
      orderBy: { ordine: "asc" },
    });
    assert.equal(voci.length, 2, "един ред на артикул");
    assert.equal(voci[0].quantita.toString(), "4", "2 + 2 от два рапортина");
    assert.equal(voci[0].totale.toString(), "50", "4 × 12,50");
    assert.equal(voci[1].prezzoUnitario.toString(), "0");

    const d = await operatore.post<{ id: string }>(
      `/api/ordini/${o.dati.id}/ddt`,
      {},
    );
    assert.equal(d.status, 201, JSON.stringify(d.dati));
    const righe = await prisma.rigaDdt.findMany({
      where: { ddtId: d.dati.id },
      orderBy: { ordine: "asc" },
    });
    assert.equal(righe.length, 2);
    assert.equal(righe[0].quantita.toString(), "4");
    // DDT-то не изписва повторно: наличността е тази след рапортините.
    const art = await prisma.articoloMagazzino.findUnique({
      where: { id: con.dati.id },
    });
    assert.equal(art?.quantita, 16);
  });
});
