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
    const slug = unico(etichetta)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-");
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

    const listaA = await aziendaA.get<{
      righe: { id: string; nome: string }[];
    }>("/api/condomini");
    assert.equal(listaA.status, 200);
    assert.ok(
      !listaA.dati.righe.some((r) => r.id === creato.dati.id),
      "фирма А вижда запис на фирма Б в списъка",
    );
  });

  test("прякото четене по id на чужд запис връща 404", async () => {
    const creato = await aziendaB.post<{ id: string }>("/api/condomini", {
      nome: unico("CondB2"),
      indirizzo: "Via B 2",
      citta: "Roma",
    });
    const letto = await aziendaA.get(`/api/condomini/${creato.dati.id}`);
    assert.equal(
      letto.status,
      404,
      "чуждият запис не бива дори да съществува за фирма А",
    );
  });

  test("промяна и изтриване на чужд запис се отказват", async () => {
    const creato = await aziendaB.post<{ id: string }>("/api/condomini", {
      nome: unico("CondB3"),
      indirizzo: "Via B 3",
      citta: "Roma",
    });
    const mod = await aziendaA.put(`/api/condomini/${creato.dati.id}`, {
      citta: "Milano",
    });
    assert.equal(mod.status, 404);
    const canc = await aziendaA.del(`/api/condomini/${creato.dati.id}`);
    assert.equal(canc.status, 404);

    // и наистина не е променен
    const verifica = await aziendaB.get<{ citta: string }>(
      `/api/condomini/${creato.dati.id}`,
    );
    assert.equal(verifica.dati.citta, "Roma");
  });

  test("импиантите също са разделени", async () => {
    const impB = await aziendaB.post<{ id: string }>("/api/impianti", {
      matricola: unico("MB"),
      marca: "Otis",
      modello: "X",
    });
    assert.equal(impB.status, 201);
    const listaA = await aziendaA.get<{ righe: { id: string }[] }>(
      "/api/impianti",
    );
    assert.ok(!listaA.dati.righe.some((r) => r.id === impB.dati.id));
  });

  test("документите от активния цикъл са разделени", async () => {
    const prevB = await aziendaB.post<{ id: string }>("/api/preventivi", {
      oggetto: unico("PrevB"),
    });
    assert.equal(prevB.status, 201);
    const listaA = await aziendaA.get<{ righe: { id: string }[] }>(
      "/api/preventivi",
    );
    assert.ok(!listaA.dati.righe.some((r) => r.id === prevB.dati.id));
    assert.equal(
      (await aziendaA.get(`/api/preventivi/${prevB.dati.id}`)).status,
      404,
    );
  });

  test("складът е разделен", async () => {
    const artB = await aziendaB.post<{ id: string }>("/api/articoli", {
      codice: unico("ARTB"),
      nome: "Articolo B",
    });
    const listaA = await aziendaA.get<{ righe: { id: string }[] }>(
      "/api/articoli",
    );
    assert.ok(!listaA.dati.righe.some((r) => r.id === artB.dati.id));
  });

  test("еднофирмените записи не изтичат към фирма с tenant", async () => {
    // MASTER е без tenant → неговите записи са в „нулевия" обхват
    const senzaTenant = await master.post<{ id: string }>("/api/condomini", {
      nome: unico("CondNoTenant"),
      indirizzo: "Via 0",
      citta: "Milano",
    });
    const listaA = await aziendaA.get<{ righe: { id: string }[] }>(
      "/api/condomini",
    );
    assert.ok(
      !listaA.dati.righe.some((r) => r.id === senzaTenant.dati.id),
      "фирма А не бива да вижда записите без фирма",
    );
  });
});

// Маршрутите ИЗВЪН CRUD фабриката имат своя логика — значи и свой шанс да
// пропуснат филтъра. Всеки от тях се проверява поотделно: познат UUID не бива
// да отваря нищо на чужда фирма.
describe("изолация в маршрутите извън CRUD фабриката", () => {
  test("смяна на статус на чужда оферта връща 404", async () => {
    const prevB = await aziendaB.post<{ id: string }>("/api/preventivi", {
      oggetto: unico("PrevStatoB"),
    });
    assert.equal(prevB.status, 201);
    const cambio = await aziendaA.patch(
      `/api/preventivi/${prevB.dati.id}/stato`,
      {
        stato: "INVIATO",
      },
    );
    assert.equal(
      cambio.status,
      404,
      "фирма А не бива да мърда документ на фирма Б",
    );

    const verifica = await aziendaB.get<{ stato: string }>(
      `/api/preventivi/${prevB.dati.id}`,
    );
    assert.equal(
      verifica.dati.stato,
      "BOZZA",
      "статусът наистина не е променен",
    );
  });

  test("смяна на статус на чужд ордин връща 404", async () => {
    const ordB = await aziendaB.post<{ id: string }>("/api/ordini", {
      oggetto: unico("OrdB"),
    });
    assert.equal(ordB.status, 201);
    const cambio = await aziendaA.patch(`/api/ordini/${ordB.dati.id}/stato`, {
      stato: "EMESSO",
    });
    assert.equal(cambio.status, 404);
  });

  test("редове по чужд документ не се добавят", async () => {
    const prevB = await aziendaB.post<{ id: string }>("/api/preventivi", {
      oggetto: unico("PrevVociB"),
    });
    const voce = await aziendaA.post(`/api/preventivi/${prevB.dati.id}/voci`, {
      descrizione: "Riga intrusa",
      quantita: "1",
      prezzoUnitario: "100",
    });
    assert.equal(
      voce.status,
      404,
      "фирма А не бива да пише редове в документ на фирма Б",
    );
  });

  test("движение по чужд артикул се отказва", async () => {
    const artB = await aziendaB.post<{ id: string }>("/api/articoli", {
      codice: unico("ARTMOV"),
      nome: "Articolo movimento",
    });
    assert.equal(artB.status, 201);
    const mov = await aziendaA.post("/api/movimenti", {
      articoloId: artB.dati.id,
      tipo: "ENTRATA",
      quantita: 10,
    });
    assert.equal(mov.status, 404, "фирма А не бива да движи склада на фирма Б");
  });

  test("администраторът на фирма А не вижда потребителите на фирма Б", async () => {
    const lista = await aziendaA.get<{ righe: { email: string }[] }>(
      "/api/utenti",
    );
    assert.equal(lista.status, 200);
    assert.ok(
      !lista.dati.righe.some((r) => r.email.includes("beta")),
      "имейлите на чужда фирма не бива да излизат в списъка",
    );
    // MASTER, обратно, обслужва всички инсталации и вижда всичко
    const listaMaster = await master.get<{ righe: { email: string }[] }>(
      "/api/utenti",
    );
    assert.ok(listaMaster.dati.righe.length > lista.dati.righe.length);
  });

  test("администраторът на фирма А не сменя паролата на чужд потребител", async () => {
    const lista = await master.get<{ righe: { id: string; email: string }[] }>(
      "/api/utenti",
    );
    // имейлът е `<slug>-admin@test.local`, а slug-ът носи уникалната добавка
    const utenteB = lista.dati.righe.find(
      (r) => r.email.includes("beta") && r.email.includes("-admin@"),
    );
    assert.ok(utenteB, "потребителят на фирма Б съществува");
    const reset = await aziendaA.post(`/api/utenti/${utenteB.id}/password`, {
      password: "NuovaPassword!2026",
    });
    assert.equal(reset.status, 404);
  });

  test("администраторът не създава потребител в чужда фирма", async () => {
    const tenants = await master.get<{ righe: { id: string; slug: string }[] }>(
      "/api/tenants",
    );
    const beta = tenants.dati.righe.find((t) => t.slug.includes("beta"));
    assert.ok(beta, "фирма Б съществува");
    const creato = await aziendaA.post("/api/utenti", {
      email: `${unico("intruso")}@test.local`,
      password: PASSWORD,
      nome: "Intruso",
      cognome: "Test",
      ruolo: "OPERATORE",
      tenantId: beta.id,
    });
    assert.equal(creato.status, 403);
  });
});

// Дупките, които червеният екип възпроизведе на живо. Всяка е отделен тест, за
// да не може да се върне тихо при следваща промяна в тези маршрути.
describe("изолация: табло, импорт, одит, номерация", () => {
  test("таблото не брои и не показва данни на друга фирма", async () => {
    const matricola = unico("MB-DASH");
    await aziendaB.post("/api/impianti", {
      matricola,
      marca: "Otis",
      modello: "Gen2",
    });

    const statsA = await aziendaA.get<{
      kpi: { impiantiTotali: number };
      scadenzeProssime: { impianto: { matricola: string } }[];
    }>("/api/dashboard/stats");
    assert.equal(statsA.status, 200);
    assert.ok(
      !statsA.dati.scadenzeProssime.some(
        (s) => s.impianto?.matricola === matricola,
      ),
      "фирма А вижда импиант на фирма Б в сроковете на таблото",
    );

    // Фирма А няма импианти → броячът трябва да е 0, не да брои чуждите.
    const impiantiA = await aziendaA.get<{ totale: number }>("/api/impianti");
    assert.equal(
      statsA.dati.kpi.impiantiTotali,
      impiantiA.dati.totale,
      "KPI-то на таблото не съвпада със собствения списък — брои чужди редове",
    );
  });

  test("масовият импорт записва редовете НА фирмата на автора", async () => {
    const nome = unico("CondImport");
    const esito = await aziendaB.post<{ importate: number }>("/api/import", {
      entita: "condomini",
      righe: [{ nome, indirizzo: "Via Import 1", citta: "Roma" }],
    });
    assert.equal(esito.status, 200, JSON.stringify(esito.dati));

    // Вижда се от фирмата, която го е внесла…
    const listaB = await aziendaB.get<{ righe: { nome: string }[] }>(
      `/api/condomini?q=${encodeURIComponent(nome)}`,
    );
    assert.ok(
      listaB.dati.righe.some((r) => r.nome === nome),
      "внесеният ред изчезна от списъка на фирмата, която го внесе",
    );
    // …и НЕ се вижда от друга.
    const listaA = await aziendaA.get<{ righe: { nome: string }[] }>(
      `/api/condomini?q=${encodeURIComponent(nome)}`,
    );
    assert.ok(!listaA.dati.righe.some((r) => r.nome === nome));
  });

  test("регистърът на операциите е разделен между фирмите", async () => {
    const nome = unico("CondAudit");
    const creato = await aziendaB.post<{ id: string }>("/api/condomini", {
      nome,
      indirizzo: "Via Audit 1",
      citta: "Roma",
    });
    assert.equal(creato.status, 201);

    const auditA = await aziendaA.get<{ righe: { entitaId: string | null }[] }>(
      "/api/audit?size=200",
    );
    assert.equal(auditA.status, 200);
    assert.ok(
      !auditA.dati.righe.some((r) => r.entitaId === creato.dati.id),
      "фирма А чете одитната следа на фирма Б",
    );

    // MASTER е нивото на доставчика и вижда всичко.
    const auditM = await master.get<{ righe: { entitaId: string | null }[] }>(
      "/api/audit?size=200",
    );
    assert.ok(auditM.dati.righe.some((r) => r.entitaId === creato.dati.id));
  });

  test("номерацията на документите започва от 1 за всяка нова фирма", async () => {
    const anno = new Date().getFullYear();

    // Фирмите А и Б вече имат документи от предишните тестове — затова НОВА
    // фирма е единственият детерминистичен начин да се провери поредицата.
    const slug = unico("numerazione")
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-");
    const t = await master.post<{ id: string }>("/api/tenants", {
      slug,
      ragioneSociale: "Azienda numerazione",
      email: `${slug}@test.local`,
    });
    assert.equal(t.status, 201);
    const email = `${slug}-admin@test.local`;
    assert.equal(
      (
        await master.post("/api/utenti", {
          email,
          password: PASSWORD,
          nome: "Admin",
          cognome: "Num",
          ruolo: "ADMIN",
          tenantId: t.dati.id,
        })
      ).status,
      201,
    );
    const nuova = new Sessione();
    assert.equal(await nuova.entra(email), 200);

    // Фирма А издава документ ПРЕДИ новата фирма…
    const a = await aziendaA.post<{ numero: string }>("/api/preventivi", {
      oggetto: unico("PrevNumA"),
    });
    assert.equal(a.status, 201);

    // …и въпреки това новата започва от СВОЯТА единица. При глобална номерация
    // тя би получила номера след фирма А (≥ 0002): дупки в собствения ѝ
    // регистър и издаден обем на съседа (чл. 21, ал. 2, б. „б" D.P.R. 633/1972).
    const b = await nuova.post<{ numero: string }>("/api/preventivi", {
      oggetto: unico("PrevNumNuova"),
    });
    assert.equal(b.status, 201);
    assert.equal(b.dati.numero, `PRV-${anno}-0001`);
  });
});
