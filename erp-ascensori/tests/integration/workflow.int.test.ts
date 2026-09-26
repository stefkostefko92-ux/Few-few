// Workflow на ордините през HTTP: позволени/забранени преходи, storico,
// двойната ролева порта и оптимистичното заключване при състезание.

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { comeRuolo, Sessione, unico } from "./_client";

let master: Sessione;
let tecnico: Sessione;

before(async () => {
  master = await comeRuolo("MASTER");
  tecnico = await comeRuolo("TECNICO");
});

async function nuovoOrdine(s: Sessione): Promise<string> {
  const { status, dati } = await s.post<{ id: string; stato: string }>(
    "/api/ordini",
    {
      oggetto: unico("Ordine"),
    },
  );
  assert.equal(status, 201);
  assert.equal(dati.stato, "BOZZA");
  return dati.id;
}

describe("преходи на състоянието", () => {
  test("позволеният преход минава и пише в storico", async () => {
    const id = await nuovoOrdine(master);
    const { status } = await master.patch(`/api/ordini/${id}/stato`, {
      stato: "EMESSO",
      nota: "изпращам",
    });
    assert.equal(status, 200);

    const det = await master.get<{
      stato: string;
      storico: {
        statoPrecedente: string | null;
        statoNuovo: string;
        nota: string | null;
      }[];
    }>(`/api/ordini/${id}`);
    assert.equal(det.dati.stato, "EMESSO");
    // първата редица е при създаване (BOZZA), втората е преходът
    const ultimo = det.dati.storico[0];
    assert.equal(ultimo.statoNuovo, "EMESSO");
    assert.equal(ultimo.statoPrecedente, "BOZZA");
    assert.equal(ultimo.nota, "изпращам");
  });

  test("непозволеният преход се отказва с 409 и НЕ променя нищо", async () => {
    const id = await nuovoOrdine(master);
    const { status, dati } = await master.patch<{ error: string }>(
      `/api/ordini/${id}/stato`,
      {
        stato: "COMPLETATO",
      },
    );
    assert.equal(status, 409);
    assert.match(dati.error, /Transizione non ammessa/);

    const det = await master.get<{ stato: string }>(`/api/ordini/${id}`);
    assert.equal(
      det.dati.stato,
      "BOZZA",
      "състоянието не бива да се е променило",
    );
  });

  test("финалното състояние не приема повече преходи", async () => {
    const id = await nuovoOrdine(master);
    for (const stato of ["EMESSO", "ANNULLATO"]) {
      const r = await master.patch(`/api/ordini/${id}/stato`, { stato });
      assert.equal(r.status, 200, `преходът към ${stato} трябваше да мине`);
    }
    for (const stato of ["BOZZA", "EMESSO", "IN_LAVORO", "CHIUSO"]) {
      const r = await master.patch(`/api/ordini/${id}/stato`, { stato });
      assert.equal(r.status, 409, `ANNULLATO не бива да приема ${stato}`);
    }
  });

  test("IN_LAVORO попълва dataInizio само първия път", async () => {
    const id = await nuovoOrdine(master);
    await master.patch(`/api/ordini/${id}/stato`, { stato: "EMESSO" });
    await master.patch(`/api/ordini/${id}/stato`, { stato: "CONFERMATO" });
    await master.patch(`/api/ordini/${id}/stato`, { stato: "IN_LAVORO" });
    const primo = await master.get<{ dataInizio: string }>(`/api/ordini/${id}`);
    assert.ok(primo.dati.dataInizio, "dataInizio трябва да е попълнена");

    await master.patch(`/api/ordini/${id}/stato`, { stato: "SOSPESO" });
    await master.patch(`/api/ordini/${id}/stato`, { stato: "IN_LAVORO" });
    const secondo = await master.get<{ dataInizio: string }>(
      `/api/ordini/${id}`,
    );
    assert.equal(
      secondo.dati.dataInizio,
      primo.dati.dataInizio,
      "не бива да се презаписва",
    );
  });
});

describe("ролева порта върху преходите", () => {
  test("TECNICO може IN_LAVORO, но НЕ може ANNULLATO/CHIUSO", async () => {
    const id = await nuovoOrdine(master);
    await master.patch(`/api/ordini/${id}/stato`, { stato: "EMESSO" });
    await master.patch(`/api/ordini/${id}/stato`, { stato: "CONFERMATO" });

    const inLavoro = await tecnico.patch(`/api/ordini/${id}/stato`, {
      stato: "IN_LAVORO",
    });
    assert.equal(
      inLavoro.status,
      200,
      "TECNICO трябва да може да влезе в работа",
    );

    const completato = await tecnico.patch(`/api/ordini/${id}/stato`, {
      stato: "COMPLETATO",
    });
    assert.equal(completato.status, 200);

    const chiuso = await tecnico.patch(`/api/ordini/${id}/stato`, {
      stato: "CHIUSO",
    });
    assert.equal(
      chiuso.status,
      403,
      "CHIUSO е управленско решение — RESPONSABILE+",
    );
  });

  test("TECNICO не може да анулира", async () => {
    const id = await nuovoOrdine(master);
    const { status } = await tecnico.patch(`/api/ordini/${id}/stato`, {
      stato: "ANNULLATO",
    });
    assert.equal(status, 403);
  });
});

describe("състезание", () => {
  test("две паралелни заявки от едно и също състояние: точно една успява", async () => {
    const id = await nuovoOrdine(master);
    await master.patch(`/api/ordini/${id}/stato`, { stato: "EMESSO" });
    await master.patch(`/api/ordini/${id}/stato`, { stato: "CONFERMATO" });

    const [a, b] = await Promise.all([
      master.patch(`/api/ordini/${id}/stato`, { stato: "IN_LAVORO" }),
      master.patch(`/api/ordini/${id}/stato`, { stato: "SOSPESO" }),
    ]);
    const successi = [a, b].filter((r) => r.status === 200).length;
    assert.equal(
      successi,
      1,
      "точно един преход бива да мине (оптимистично заключване)",
    );

    // и историята трябва да е консистентна: последният запис = текущото състояние
    const det = await master.get<{
      stato: string;
      storico: { statoNuovo: string }[];
    }>(`/api/ordini/${id}`);
    assert.equal(det.dati.storico[0].statoNuovo, det.dati.stato);
  });
});
