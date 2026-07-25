// Тоталите се преизчисляват от редовете при всяка операция — през HTTP.
// Плюс фискалната защита: издаден документ не приема промени по редовете.

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { comeRuolo, Sessione, unico } from "./_client";

let master: Sessione;
let operatore: Sessione;

before(async () => {
  master = await comeRuolo("MASTER");
  operatore = await comeRuolo("OPERATORE");
});

interface Doc {
  id: string;
  totaleNetto: string;
  totaleIva: string;
  totaleLordo: string;
  voci?: { id: string; totale: string }[];
}

async function nuovoPreventivo(): Promise<string> {
  const { status, dati } = await master.post<Doc>("/api/preventivi", { oggetto: unico("Prev") });
  assert.equal(status, 201);
  return dati.id;
}

const leggi = (id: string) => master.get<Doc>(`/api/preventivi/${id}`);

describe("преизчисляване на тоталите", () => {
  test("нов документ е на нула", async () => {
    const d = await leggi(await nuovoPreventivo());
    assert.equal(d.dati.totaleNetto, "0");
    assert.equal(d.dati.totaleLordo, "0");
  });

  test("добавяне на редица обновява трите тотала", async () => {
    const id = await nuovoPreventivo();
    const r = await master.post(`/api/preventivi/${id}/voci`, {
      descrizione: "Fune",
      quantita: "60.00",
      prezzoUnitario: "7.90",
      aliquotaIva: "22.00",
    });
    assert.equal(r.status, 201);

    const d = await leggi(id);
    assert.equal(d.dati.totaleNetto, "474");
    assert.equal(d.dati.totaleIva, "104.28");
    assert.equal(d.dati.totaleLordo, "578.28");
  });

  test("промяна на количеството преизчислява (без остатъчен кеш)", async () => {
    const id = await nuovoPreventivo();
    const creata = await master.post<{ id: string }>(`/api/preventivi/${id}/voci`, {
      descrizione: "Manodopera",
      quantita: "10.00",
      prezzoUnitario: "48.00",
      aliquotaIva: "22.00",
    });
    let d = await leggi(id);
    assert.equal(d.dati.totaleNetto, "480");

    const agg = await master.put(`/api/preventivi/${id}/voci/${creata.dati.id}`, {
      quantita: "12.00",
    });
    assert.equal(agg.status, 200);
    d = await leggi(id);
    assert.equal(d.dati.totaleNetto, "576", "тоталът трябва да следва новото количество");
  });

  test("изтриването на редица намалява тотала точно", async () => {
    const id = await nuovoPreventivo();
    const a = await master.post<{ id: string }>(`/api/preventivi/${id}/voci`, {
      descrizione: "A",
      quantita: "1",
      prezzoUnitario: "100.00",
      aliquotaIva: "22.00",
    });
    await master.post(`/api/preventivi/${id}/voci`, {
      descrizione: "B",
      quantita: "1",
      prezzoUnitario: "50.00",
      aliquotaIva: "22.00",
    });
    let d = await leggi(id);
    assert.equal(d.dati.totaleNetto, "150");

    await master.del(`/api/preventivi/${id}/voci/${a.dati.id}`);
    d = await leggi(id);
    assert.equal(d.dati.totaleNetto, "50");
    assert.equal(d.dati.totaleLordo, "61");
  });

  test("различни ставки ДДС по редове се сумират правилно", async () => {
    const id = await nuovoPreventivo();
    for (const [prezzo, iva] of [
      ["100.00", "22"],
      ["100.00", "10"],
      ["100.00", "4"],
    ]) {
      await master.post(`/api/preventivi/${id}/voci`, {
        descrizione: unico("V"),
        quantita: "1",
        prezzoUnitario: prezzo,
        aliquotaIva: iva,
      });
    }
    const d = await leggi(id);
    assert.equal(d.dati.totaleNetto, "300");
    assert.equal(d.dati.totaleIva, "36");
    assert.equal(d.dati.totaleLordo, "336");
  });

  test("клиентът НЕ може да наложи тотал — стойността идва от редовете", async () => {
    const id = await nuovoPreventivo();
    await master.post(`/api/preventivi/${id}/voci`, {
      descrizione: "Реален",
      quantita: "1",
      prezzoUnitario: "10.00",
      aliquotaIva: "22",
    });
    // опит да се препише тоталът директно
    await master.put(`/api/preventivi/${id}`, {
      totaleNetto: "999999.00",
      totaleLordo: "999999.00",
    });
    const d = await leggi(id);
    assert.equal(d.dati.totaleNetto, "10", "сървърът остойностява, не клиентът");
  });
});

describe("фискална защита на редовете", () => {
  test("одобрена оферта не приема нови редове", async () => {
    const id = await nuovoPreventivo();
    // легалният път е BOZZA → INVIATO → APPROVATO (прескачането се отказва)
    const salto = await master.patch(`/api/preventivi/${id}/stato`, { stato: "APPROVATO" });
    assert.equal(salto.status, 409, "не се прескача направо от чернова в одобрена");

    await master.patch(`/api/preventivi/${id}/stato`, { stato: "INVIATO" });
    const approvato = await master.patch(`/api/preventivi/${id}/stato`, { stato: "APPROVATO" });
    assert.equal(approvato.status, 200);

    const { status } = await master.post(`/api/preventivi/${id}/voci`, {
      descrizione: "късна добавка",
      quantita: "1",
      prezzoUnitario: "1.00",
      aliquotaIva: "22",
    });
    assert.equal(status, 409, "APPROVATO е извън statiModificabili");
  });

  test("издадена фактура не приема промени по редовете и не се трие", async () => {
    const f = await master.post<{ id: string }>("/api/fatture", { tipo: "EMESSA" });
    const id = f.dati.id;
    const voce = await master.post<{ id: string }>(`/api/fatture/${id}/voci`, {
      descrizione: "Acconto",
      quantita: "1",
      prezzoUnitario: "500.00",
      aliquotaIva: "22",
    });
    assert.equal(voce.status, 201, "в BOZZA редовете се променят свободно");

    await master.patch(`/api/fatture/${id}/stato`, { stato: "EMESSA" });

    const nuova = await master.post(`/api/fatture/${id}/voci`, {
      descrizione: "след издаване",
      quantita: "1",
      prezzoUnitario: "1.00",
      aliquotaIva: "22",
    });
    assert.equal(nuova.status, 409);

    const modifica = await master.put(`/api/fatture/${id}/voci/${voce.dati.id}`, {
      prezzoUnitario: "1.00",
    });
    assert.equal(modifica.status, 409);

    const cancella = await master.del(`/api/fatture/${id}`);
    assert.equal(cancella.status, 409, "издадена фактура се сторнира, не се трие");
  });

  test("OPERATORE не може да пипа редовете на фактура (икономически данни)", async () => {
    const f = await master.post<{ id: string }>("/api/fatture", { tipo: "EMESSA" });
    const { status } = await operatore.post(`/api/fatture/${f.dati.id}/voci`, {
      descrizione: "опит",
      quantita: "1",
      prezzoUnitario: "1.00",
      aliquotaIva: "22",
    });
    assert.equal(status, 403);
  });
});
