// Неизменимост на регистъра + преходите на документните състояния.
// Двете находки на Качествения са закодирани тук като очаквано поведение.

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { comeRuolo, Sessione, unico } from "./_client";

let master: Sessione;
let admin: Sessione;
before(async () => {
  master = await comeRuolo("MASTER");
  admin = await comeRuolo("ADMIN");
});

describe("регистър на операциите", () => {
  test("операциите се записват и подписът се проверява като валиден", async () => {
    const nome = unico("Cond");
    const creato = await master.post<{ id: string }>("/api/condomini", {
      nome,
      indirizzo: "Via Prova 1",
      citta: "Milano",
    });
    assert.equal(creato.status, 201);

    const reg = await admin.get<{
      righe: { entita: string; entitaId: string; azione: string }[];
    }>("/api/audit?azione=CREATE&size=50");
    assert.equal(reg.status, 200);
    assert.ok(
      reg.dati.righe.some(
        (r) => r.entitaId === creato.dati.id && r.entita === "condomini",
      ),
      "създаването трябва да е в регистъра",
    );

    const ver = await admin.post<{ integro: boolean; corrotte: string[] }>(
      "/api/audit/verifica",
      {
        limite: 200,
      },
    );
    assert.equal(ver.status, 200);
    assert.equal(
      ver.dati.integro,
      true,
      `невалидни подписи: ${ver.dati.corrotte?.length}`,
    );
  });

  test("регистърът няма маршрут за промяна или изтриване", async () => {
    const reg = await admin.get<{ righe: { id: string }[] }>(
      "/api/audit?size=1",
    );
    const id = reg.dati.righe[0]?.id;
    assert.ok(id, "трябва да има поне един запис");

    for (const metodo of ["PUT", "PATCH", "DELETE"] as const) {
      const { status } = await admin.richiesta(metodo, `/api/audit/${id}`, {
        azione: "X",
      });
      assert.ok(
        status === 404 || status === 405,
        `${metodo} /api/audit/:id трябва да не съществува (получи ${status})`,
      );
    }
  });

  test("входът и изходът също се записват", async () => {
    const reg = await admin.get<{ righe: { azione: string }[] }>(
      "/api/audit?azione=LOGIN&size=5",
    );
    assert.ok(reg.dati.righe.length > 0, "LOGIN трябва да оставя следа");
  });
});

describe("преходи на състоянието при документите", () => {
  test("фактура: не се прескача от PAGATA обратно в BOZZA", async () => {
    const f = await master.post<{ id: string }>("/api/fatture", {
      tipo: "EMESSA",
    });
    const id = f.dati.id;
    for (const stato of ["EMESSA", "INVIATA", "PAGATA"]) {
      const r = await master.patch(`/api/fatture/${id}/stato`, { stato });
      assert.equal(r.status, 200, `${stato} трябваше да мине`);
    }
    const indietro = await master.patch(`/api/fatture/${id}/stato`, {
      stato: "BOZZA",
    });
    assert.equal(indietro.status, 409, "платена фактура не се връща в чернова");
  });

  test("фактура: сторнирането е финално", async () => {
    const f = await master.post<{ id: string }>("/api/fatture", {
      tipo: "EMESSA",
    });
    const id = f.dati.id;
    await master.patch(`/api/fatture/${id}/stato`, { stato: "EMESSA" });
    await master.patch(`/api/fatture/${id}/stato`, { stato: "STORNATA" });

    for (const stato of ["BOZZA", "EMESSA", "PAGATA"]) {
      const r = await master.patch(`/api/fatture/${id}/stato`, { stato });
      assert.equal(r.status, 409, `сторнирана фактура не приема ${stato}`);
    }
  });

  test("оферта: отхвърлената не се съживява в чернова", async () => {
    const p = await master.post<{ id: string }>("/api/preventivi", {
      oggetto: unico("Prev"),
    });
    const id = p.dati.id;
    await master.patch(`/api/preventivi/${id}/stato`, { stato: "INVIATO" });
    await master.patch(`/api/preventivi/${id}/stato`, { stato: "RIFIUTATO" });

    const indietro = await master.patch(`/api/preventivi/${id}/stato`, {
      stato: "BOZZA",
    });
    assert.equal(indietro.status, 409, "отхвърлената оферта е финална");
  });
});

describe("детайлът на импианта не филтрира на клиента", () => {
  test("свързаните записи се четат филтрирани от сървъра", async () => {
    const imp = await master.post<{ id: string }>("/api/impianti", {
      matricola: unico("MAT"),
      marca: "Prova",
      modello: "X",
    });
    const id = imp.dati.id;
    await master.post("/api/scadenze", {
      impiantoId: id,
      tipo: "revisione",
      dataScadenza: new Date(Date.now() + 86_400_000 * 40).toISOString(),
    });

    // сървърът трябва да умее да филтрира по импиант, не клиентът да дърпа всичко
    const filtrate = await master.get<{
      righe: { impiantoId: string }[];
      totale: number;
    }>(`/api/scadenze?impiantoId=${id}`);
    assert.equal(filtrate.status, 200);
    assert.ok(
      filtrate.dati.righe.length > 0,
      "трябва да върне срока на този импиант",
    );
    assert.ok(
      filtrate.dati.righe.every((r) => r.impiantoId === id),
      "всички върнати редове трябва да са на искания импиант",
    );
  });
});
