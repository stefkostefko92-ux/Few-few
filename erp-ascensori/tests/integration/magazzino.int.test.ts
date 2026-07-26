// Складът: giacenza-та се движи само през движения, никога под нула,
// дори при паралелни заявки (условният UPDATE е защитата).

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { comeRuolo, Sessione, unico } from "./_client";

let master: Sessione;
before(async () => {
  master = await comeRuolo("MASTER");
});

interface Articolo {
  id: string;
  quantita: number;
}

async function nuovoArticolo(quantitaIniziale = 0): Promise<Articolo> {
  const { status, dati } = await master.post<Articolo>("/api/articoli", {
    codice: unico("ART"),
    nome: "Articolo di prova",
  });
  assert.equal(status, 201);
  if (quantitaIniziale > 0) {
    await master.post("/api/movimenti", {
      articoloId: dati.id,
      tipo: "ENTRATA",
      quantita: quantitaIniziale,
    });
  }
  return dati;
}

const giacenza = async (id: string): Promise<number> =>
  (await master.get<Articolo>(`/api/articoli/${id}`)).dati.quantita;

describe("движения", () => {
  test("ENTRATA увеличава точно", async () => {
    const a = await nuovoArticolo();
    await master.post("/api/movimenti", {
      articoloId: a.id,
      tipo: "ENTRATA",
      quantita: 25,
    });
    assert.equal(await giacenza(a.id), 25);
  });

  test("USCITA намалява точно", async () => {
    const a = await nuovoArticolo(30);
    await master.post("/api/movimenti", {
      articoloId: a.id,
      tipo: "USCITA",
      quantita: 12,
    });
    assert.equal(await giacenza(a.id), 18);
  });

  test("USCITA над наличността се отказва и НЕ променя giacenza", async () => {
    const a = await nuovoArticolo(5);
    const { status, dati } = await master.post<{ error: string }>(
      "/api/movimenti",
      {
        articoloId: a.id,
        tipo: "USCITA",
        quantita: 6,
      },
    );
    assert.equal(status, 409);
    assert.match(dati.error, /Giacenza insufficiente/);
    assert.equal(
      await giacenza(a.id),
      5,
      "наличността трябва да е непокътната",
    );
  });

  test("RETTIFICA приема отрицателна стойност, но не нула", async () => {
    const a = await nuovoArticolo(10);
    await master.post("/api/movimenti", {
      articoloId: a.id,
      tipo: "RETTIFICA",
      quantita: -3,
    });
    assert.equal(await giacenza(a.id), 7);

    const zero = await master.post("/api/movimenti", {
      articoloId: a.id,
      tipo: "RETTIFICA",
      quantita: 0,
    });
    assert.equal(zero.status, 400);
  });

  test("RETTIFICA не може да свали под нула", async () => {
    const a = await nuovoArticolo(2);
    const { status } = await master.post("/api/movimenti", {
      articoloId: a.id,
      tipo: "RETTIFICA",
      quantita: -5,
    });
    assert.equal(status, 409);
    assert.equal(await giacenza(a.id), 2);
  });

  test("ENTRATA/USCITA отказват неположително количество", async () => {
    const a = await nuovoArticolo(10);
    for (const quantita of [0, -1]) {
      const { status } = await master.post("/api/movimenti", {
        articoloId: a.id,
        tipo: "USCITA",
        quantita,
      });
      assert.equal(
        status,
        400,
        `количество ${quantita} трябваше да бъде отказано`,
      );
    }
  });

  test("количеството не се променя през CRUD на артикула", async () => {
    const a = await nuovoArticolo(40);
    await master.put(`/api/articoli/${a.id}`, {
      quantita: 9999,
      nome: "Опит за подмяна",
    });
    assert.equal(
      await giacenza(a.id),
      40,
      "giacenza се движи САМО през движения",
    );
  });
});

describe("състезание — инвариантът е неотрицателна наличност", () => {
  test("две паралелни USCITA със сбор над наличността: минава само едната", async () => {
    const a = await nuovoArticolo(5);
    const [x, y] = await Promise.all([
      master.post("/api/movimenti", {
        articoloId: a.id,
        tipo: "USCITA",
        quantita: 5,
      }),
      master.post("/api/movimenti", {
        articoloId: a.id,
        tipo: "USCITA",
        quantita: 5,
      }),
    ]);
    const successi = [x, y].filter((r) => r.status === 201).length;
    assert.equal(successi, 1, "точно едно движение бива да мине");
    assert.equal(await giacenza(a.id), 0);
  });

  test("много паралелни USCITA никога не свалят под нула", async () => {
    const a = await nuovoArticolo(10);
    const esiti = await Promise.all(
      Array.from({ length: 8 }, () =>
        master.post("/api/movimenti", {
          articoloId: a.id,
          tipo: "USCITA",
          quantita: 3,
        }),
      ),
    );
    const passati = esiti.filter((r) => r.status === 201).length;
    const finale = await giacenza(a.id);
    assert.ok(finale >= 0, `наличността падна под нула: ${finale}`);
    assert.equal(
      finale,
      10 - passati * 3,
      "наличността трябва да отговаря на успелите движения",
    );
  });
});
