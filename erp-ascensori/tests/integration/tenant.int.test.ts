// Изолация между фирми: потребител на фирма А не вижда НИЩО на фирма Б.
// Документацията: „Gli utenti e i dati sono separati per azienda".

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { comeRuolo, Sessione, PASSWORD, unico } from "./_client";

let master: Sessione;
let aziendaA: Sessione;
let aziendaB: Sessione;

before(async () => {
  master = await comeRuolo("MASTER");

  // Две фирми, всяка със свой ADMIN
  const creaAzienda = async (etichetta: string) => {
    const slug = unico(etichetta).toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const t = await master.post<{ id: string }>("/api/tenants", {
      slug,
      ragioneSociale: `Azienda ${etichetta}`,
      email: `${slug}@test.local`,
    });
    assert.equal(t.status, 201, `фирма ${etichetta}`);
    const email = `${slug}-admin@test.local`;
    const u = await master.post("/api/utenti", {
      email,
      password: PASSWORD,
      nome: "Admin",
      cognome: etichetta,
      ruolo: "ADMIN",
      tenantId: t.dati.id,
    });
    assert.equal(u.status, 201);
    const s = new Sessione();
    assert.equal(await s.entra(email), 200);
    return s;
  };

  aziendaA = await creaAzienda("alfa");
  aziendaB = await creaAzienda("beta");
});

describe("изолация на данните между фирми", () => {
  test("списъкът на фирма А не съдържа записите на фирма Б", async () => {
    const nomeB = unico("CondB");
    const creato = await aziendaB.post<{ id: string }>("/api/condomini", {
      nome: nomeB,
      indirizzo: "Via B 1",
      citta: "Roma",
    });
    assert.equal(creato.status, 201);

    const listaA = await aziendaA.get<{ righe: { id: string; nome: string }[] }>("/api/condomini");
    assert.equal(listaA.status, 200);
    assert.ok(
      !listaA.dati.righe.some((r) => r.id === creato.dati.id),
      "фирма А вижда запис на фирма Б в списъка"
    );
  });

  test("прякото четене по id на чужд запис връща 404", async () => {
    const creato = await aziendaB.post<{ id: string }>("/api/condomini", {
      nome: unico("CondB2"),
      indirizzo: "Via B 2",
      citta: "Roma",
    });
    const letto = await aziendaA.get(`/api/condomini/${creato.dati.id}`);
    assert.equal(letto.status, 404, "чуждият запис не бива дори да съществува за фирма А");
  });

  test("промяна и изтриване на чужд запис се отказват", async () => {
    const creato = await aziendaB.post<{ id: string }>("/api/condomini", {
      nome: unico("CondB3"),
      indirizzo: "Via B 3",
      citta: "Roma",
    });
    const mod = await aziendaA.put(`/api/condomini/${creato.dati.id}`, { citta: "Milano" });
    assert.equal(mod.status, 404);
    const canc = await aziendaA.del(`/api/condomini/${creato.dati.id}`);
    assert.equal(canc.status, 404);

    // и наистина не е променен
    const verifica = await aziendaB.get<{ citta: string }>(`/api/condomini/${creato.dati.id}`);
    assert.equal(verifica.dati.citta, "Roma");
  });

  test("импиантите също са разделени", async () => {
    const impB = await aziendaB.post<{ id: string }>("/api/impianti", {
      matricola: unico("MB"),
      marca: "Otis",
      modello: "X",
    });
    assert.equal(impB.status, 201);
    const listaA = await aziendaA.get<{ righe: { id: string }[] }>("/api/impianti");
    assert.ok(!listaA.dati.righe.some((r) => r.id === impB.dati.id));
  });

  test("документите от активния цикъл са разделени", async () => {
    const prevB = await aziendaB.post<{ id: string }>("/api/preventivi", {
      oggetto: unico("PrevB"),
    });
    assert.equal(prevB.status, 201);
    const listaA = await aziendaA.get<{ righe: { id: string }[] }>("/api/preventivi");
    assert.ok(!listaA.dati.righe.some((r) => r.id === prevB.dati.id));
    assert.equal((await aziendaA.get(`/api/preventivi/${prevB.dati.id}`)).status, 404);
  });

  test("складът е разделен", async () => {
    const artB = await aziendaB.post<{ id: string }>("/api/articoli", {
      codice: unico("ARTB"),
      nome: "Articolo B",
    });
    const listaA = await aziendaA.get<{ righe: { id: string }[] }>("/api/articoli");
    assert.ok(!listaA.dati.righe.some((r) => r.id === artB.dati.id));
  });

  test("еднофирмените записи не изтичат към фирма с tenant", async () => {
    // MASTER е без tenant → неговите записи са в „нулевия" обхват
    const senzaTenant = await master.post<{ id: string }>("/api/condomini", {
      nome: unico("CondNoTenant"),
      indirizzo: "Via 0",
      citta: "Milano",
    });
    const listaA = await aziendaA.get<{ righe: { id: string }[] }>("/api/condomini");
    assert.ok(
      !listaA.dati.righe.some((r) => r.id === senzaTenant.dati.id),
      "фирма А не бива да вижда записите без фирма"
    );
  });
});
