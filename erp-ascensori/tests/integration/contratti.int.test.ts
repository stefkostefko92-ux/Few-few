// Договорите за поддръжка: жизнен цикъл + автоматизмът, който ражда
// периодичните посещения и фактурите за canone.

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { comeRuolo, Sessione, unico } from "./_client";

let master: Sessione;
let operatore: Sessione;
let impiantoId: string;

const oggi = new Date();
const iso = (d: Date) => d.toISOString().slice(0, 10);
const fraGiorni = (n: number) => iso(new Date(oggi.getTime() + n * 86_400_000));

before(async () => {
  master = await comeRuolo("MASTER");
  operatore = await comeRuolo("OPERATORE");
  const imp = await master.post<{ id: string }>("/api/impianti", {
    matricola: unico("CTR-IMP"),
    marca: "Otis",
    modello: "Gen2",
  });
  assert.equal(imp.status, 201);
  impiantoId = imp.dati.id;
});

async function creaContratto(extra: Record<string, unknown> = {}) {
  return master.post<{ id: string; numero: string; stato: string }>(
    "/api/contratti",
    {
      oggetto: unico("Manutenzione"),
      canone: "250.00",
      dataInizio: fraGiorni(-400),
      dataFine: fraGiorni(-10),
      periodicitaVisite: "SEMESTRALE",
      periodicitaFatturazione: "TRIMESTRALE",
      impiantiIds: [impiantoId],
      ...extra,
    },
  );
}

describe("договори за поддръжка", () => {
  test("създаването зарежда и двата графика", async () => {
    const c = await creaContratto();
    assert.equal(c.status, 201, JSON.stringify(c.dati));
    const d = await master.get<{
      prossimaVisita: string;
      prossimaFattura: string;
    }>(`/api/contratti/${c.dati.id}`);
    // Без заредени дати автоматизмът няма от какво да тръгне и договорът
    // стои „активен", без нищо да се случва.
    assert.ok(d.dati.prossimaVisita, "prossimaVisita не е заредена");
    assert.ok(d.dati.prossimaFattura, "prossimaFattura не е заредена");
  });

  test("край преди началото се отказва", async () => {
    const c = await creaContratto({
      dataInizio: fraGiorni(10),
      dataFine: fraGiorni(5),
    });
    assert.equal(c.status, 400);
  });

  test("OPERATORE не създава договор — обвързва фирмата за години", async () => {
    const c = await operatore.post("/api/contratti", {
      oggetto: unico("NonAutorizzato"),
      canone: "100.00",
      dataInizio: fraGiorni(0),
      dataFine: fraGiorni(365),
    });
    assert.equal(c.status, 403);
  });

  test("активният договор не се променя, спреният — да", async () => {
    const c = await creaContratto();
    assert.equal(
      (
        await master.patch(`/api/contratti/${c.dati.id}/stato`, {
          stato: "ATTIVO",
        })
      ).status,
      200,
    );

    const mod = await master.put(`/api/contratti/${c.dati.id}`, {
      canone: "999.00",
    });
    assert.equal(mod.status, 409, "активният договор прие промяна на canone");

    assert.equal(
      (
        await master.patch(`/api/contratti/${c.dati.id}/stato`, {
          stato: "SOSPESO",
        })
      ).status,
      200,
    );
    const mod2 = await master.put(`/api/contratti/${c.dati.id}`, {
      canone: "999.00",
    });
    assert.equal(mod2.status, 200);
  });

  test("прекратеният е финален", async () => {
    const c = await creaContratto();
    assert.equal(
      (
        await master.patch(`/api/contratti/${c.dati.id}/stato`, {
          stato: "DISDETTO",
        })
      ).status,
      200,
    );
    const r = await master.patch(`/api/contratti/${c.dati.id}/stato`, {
      stato: "ATTIVO",
    });
    assert.equal(r.status, 409);
  });

  test("автоматизмът ражда ордин и фактура за изтеклите периоди", async () => {
    const c = await creaContratto();
    await master.patch(`/api/contratti/${c.dati.id}/stato`, {
      stato: "ATTIVO",
    });

    const esito = await master.post<{
      ordiniCreati: number;
      fattureCreate: number;
    }>("/api/contratti/elabora");
    assert.equal(esito.status, 200, JSON.stringify(esito.dati));

    const d = await master.get<{
      ordini: { id: string }[];
      fatture: { id: string; totaleLordo: string }[];
    }>(`/api/contratti/${c.dati.id}`);
    // Договорът е започнал преди 400 дни: дължими са няколко полугодишни
    // посещения и няколко тримесечни фактури.
    assert.ok(d.dati.ordini.length > 0, "нито един ордин не е роден");
    assert.ok(d.dati.fatture.length > 0, "нито една фактура не е родена");

    // Тоталът на фактурата идва от canone + ДДС, сметнат сървърно.
    assert.equal(d.dati.fatture[0].totaleLordo, "305");
  });

  test("повторното пускане НЕ дублира документите", async () => {
    const c = await creaContratto();
    await master.patch(`/api/contratti/${c.dati.id}/stato`, {
      stato: "ATTIVO",
    });
    await master.post("/api/contratti/elabora");

    const primo = await master.get<{ ordini: unknown[]; fatture: unknown[] }>(
      `/api/contratti/${c.dati.id}`,
    );
    await master.post("/api/contratti/elabora");
    const secondo = await master.get<{ ordini: unknown[]; fatture: unknown[] }>(
      `/api/contratti/${c.dati.id}`,
    );

    assert.equal(secondo.dati.ordini.length, primo.dati.ordini.length);
    assert.equal(secondo.dati.fatture.length, primo.dati.fatture.length);
  });

  test("договор с документи не се трие — прекратява се", async () => {
    const c = await creaContratto();
    await master.patch(`/api/contratti/${c.dati.id}/stato`, {
      stato: "ATTIVO",
    });
    await master.post("/api/contratti/elabora");
    const canc = await master.del(`/api/contratti/${c.dati.id}`);
    assert.equal(canc.status, 409);
  });

  test("без автоматично подновяване изтеклият договор минава в SCADUTO", async () => {
    const c = await creaContratto({ rinnovoAutomatico: false });
    await master.patch(`/api/contratti/${c.dati.id}/stato`, {
      stato: "ATTIVO",
    });
    await master.post("/api/contratti/elabora");
    const d = await master.get<{ stato: string }>(
      `/api/contratti/${c.dati.id}`,
    );
    assert.equal(d.dati.stato, "SCADUTO");
  });

  test("с автоматично подновяване срокът се мести напред", async () => {
    const c = await creaContratto({ rinnovoAutomatico: true });
    await master.patch(`/api/contratti/${c.dati.id}/stato`, {
      stato: "ATTIVO",
    });
    const prima = await master.get<{ dataFine: string }>(
      `/api/contratti/${c.dati.id}`,
    );
    await master.post("/api/contratti/elabora");
    const dopo = await master.get<{ dataFine: string; stato: string }>(
      `/api/contratti/${c.dati.id}`,
    );
    assert.equal(dopo.dati.stato, "ATTIVO");
    assert.ok(
      new Date(dopo.dati.dataFine) > new Date(prima.dati.dataFine),
      "срокът не е преместен напред",
    );
  });
});
