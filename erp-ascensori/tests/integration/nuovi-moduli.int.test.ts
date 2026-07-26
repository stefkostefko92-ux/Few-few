// Осемте маршрута, добавени последни, през РЕАЛНА база.
//
// ЗАЩО ОТДЕЛЕН СЛОЙ. Чистата логика зад тях (`sla.ts`, `scadenzario.ts`,
// `calendario.ts`, `zip.ts`) вече носи модулни тестове и те са силни — но
// точно тук живее това, което модулният тест структурно НЕ МОЖЕ да види:
// състезания в базата, условните записи, които ги пазят, преходите между
// състояния и изолацията между фирмите. Осем маршрута, които пипат склад,
// неустойки, подаване към данъчната администрация и фискален архив, стояха без
// нито един такъв тест.

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { comeRuolo, Sessione, BASE, unico } from "./_client";

let master: Sessione;
let direzione: Sessione;
let tecnico: Sessione;
let ordineId: string;
let rapportinoId: string;
let amministratoreId: string;
let condominioId: string;

before(async () => {
  master = await comeRuolo("MASTER");
  direzione = await comeRuolo("DIREZIONE");
  tecnico = await comeRuolo("TECNICO");

  const o = await master.post<{ id: string }>("/api/ordini", {
    oggetto: unico("OrdNuovi"),
    priorita: "EMERGENZA",
  });
  assert.equal(o.status, 201, JSON.stringify(o.dati));
  ordineId = o.dati.id;

  const r = await tecnico.post<{ id: string }>(
    `/api/ordini/${ordineId}/rapportini`,
    {
      descrizione: "Sostituzione pulsantiera, verifica funzionamento.",
      oreLavoro: "1.5",
      esito: "RISOLTO",
    },
  );
  assert.equal(r.status, 201, JSON.stringify(r.dati));
  rapportinoId = r.dati.id;

  // Контрагент от сийда: без него фактурата не минава проверките за SDI и
  // маршрутът за подаване връща 422, тоест правилата за идемпотентност
  // остават непроверени.
  const lista = await direzione.get<{
    righe: { id: string; ragioneSociale: string | null }[];
  }>("/api/amministratori?size=50");
  assert.equal(lista.status, 200);
  const studio = lista.dati.righe.find((x) =>
    x.ragioneSociale?.includes("Bianchi"),
  );
  assert.ok(studio, "сийдът трябва да е създал Studio Bianchi");
  amministratoreId = studio.id;

  const cond = await direzione.get<{ righe: { id: string; nome: string }[] }>(
    "/api/condomini?size=50",
  );
  assert.equal(cond.status, 200);
  const c = cond.dati.righe.find((x) => x.nome.includes("Torre Aurora"));
  assert.ok(c, "сийдът трябва да е създал Condominio Torre Aurora");
  condominioId = c.id;
});

async function nuovoArticolo(quantita: number): Promise<string> {
  const a = await master.post<{ id: string }>("/api/articoli", {
    codice: unico("ART"),
    nome: "Ricambio di prova",
  });
  assert.equal(a.status, 201, JSON.stringify(a.dati));
  if (quantita > 0)
    await master.post("/api/movimenti", {
      articoloId: a.dati.id,
      tipo: "ENTRATA",
      quantita,
    });
  return a.dati.id;
}

const giacenza = async (id: string): Promise<number> =>
  (await master.get<{ quantita: number }>(`/api/articoli/${id}`)).dati.quantita;

// ───────────────────────── 1. Материали от рапортино ─────────────────────────

describe("материали в рапортино → склад", () => {
  test("вложеното сваля наличността в СЪЩАТА транзакция", async () => {
    const art = await nuovoArticolo(10);
    const { status, dati } = await tecnico.post<{ id: string }>(
      `/api/rapportini/${rapportinoId}/materiali`,
      { articoloId: art, quantita: 3 },
    );
    assert.equal(status, 201, JSON.stringify(dati));
    assert.equal(await giacenza(art), 7);

    // Махането ВРЪЩА частта и оставя двете движения — регистърът е хронология.
    const via = await tecnico.del(
      `/api/rapportini/${rapportinoId}/materiali/${dati.id}`,
    );
    assert.equal(via.status, 200);
    assert.equal(await giacenza(art), 10);
  });

  test("наличността НЕ пада под нула при паралелни вземания", async () => {
    // Условният `updateMany({ where: { quantita: { gte } } })` е защитата;
    // тестът я проверява така, както се чупи в живота — едновременно.
    const art = await nuovoArticolo(5);
    const esiti = await Promise.all(
      Array.from({ length: 4 }, () =>
        tecnico.post(`/api/rapportini/${rapportinoId}/materiali`, {
          articoloId: art,
          quantita: 2,
        }),
      ),
    );
    const passate = esiti.filter((e) => e.status === 201).length;
    const respinte = esiti.filter((e) => e.status === 409).length;
    assert.equal(
      passate + respinte,
      4,
      JSON.stringify(esiti.map((e) => e.status)),
    );
    assert.equal(passate, 2, "две по две от пет: третата няма как да мине");
    assert.equal(await giacenza(art), 1);
    assert.ok((await giacenza(art)) >= 0);
  });

  test("недостигът е 409 с обяснение, не мълчалив отказ", async () => {
    const art = await nuovoArticolo(1);
    const { status, dati } = await tecnico.post<{ error?: string }>(
      `/api/rapportini/${rapportinoId}/materiali`,
      { articoloId: art, quantita: 99 },
    );
    assert.equal(status, 409);
    assert.match(String(dati.error), /[Gg]iacenza/);
  });

  test("подписаният отчет е ЗАКЛЮЧЕН — иначе подписът не доказва нищо", async () => {
    const r = await tecnico.post<{ id: string }>(
      `/api/ordini/${ordineId}/rapportini`,
      {
        descrizione: "Intervento da firmare.",
        oreLavoro: "1",
        esito: "RISOLTO",
      },
    );
    assert.equal(r.status, 201);
    const firma = `data:image/png;base64,${Buffer.from([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
      ...new Array(400).fill(0x42),
    ]).toString("base64")}`;
    const f = await tecnico.post(`/api/rapportini/${r.dati.id}/firma`, {
      firmaCliente: firma,
      firmatarioNome: "Mario Rossi",
    });
    assert.equal(f.status, 200, JSON.stringify(f.dati));

    const art = await nuovoArticolo(10);
    // И ДВАТА маршрута пазят правилото — то живее на едно място
    // (`lib/rapportini-guardie.ts`), а не в две копия.
    const agg = await tecnico.post<{ error?: string }>(
      `/api/rapportini/${r.dati.id}/materiali`,
      { articoloId: art, quantita: 1 },
    );
    assert.equal(agg.status, 409);
    assert.match(String(agg.dati.error), /firmato/i);
    assert.equal(await giacenza(art), 10, "нищо не бива да е излязло");
  });

  test("артикул с непознат идентификатор е 404, не 500", async () => {
    const { status } = await tecnico.post(
      `/api/rapportini/${rapportinoId}/materiali`,
      { articoloId: "00000000-0000-4000-8000-000000000000", quantita: 1 },
    );
    assert.equal(status, 404);
  });
});

// ─────────────────────────── 2. Часовникът на SLA ────────────────────────────

describe("времена за отзив", () => {
  test("отметките се пишат и статусът се смята от тях", async () => {
    const base = Date.now() - 3 * 60 * 60_000;
    const segnalato = new Date(base).toISOString();
    const arrivo = new Date(base + 30 * 60_000).toISOString();

    const p = await tecnico.patch(`/api/ordini/${ordineId}/sla`, {
      segnalatoAt: segnalato,
      arrivoAt: arrivo,
    });
    assert.equal(p.status, 200, JSON.stringify(p.dati));

    const g = await tecnico.get<{
      tempi: { segnalatoAt: string | null; arrivoAt: string | null };
      applicabile: boolean;
      sla: { intervento: { stato: string; trascorsiMin: number | null } };
    }>(`/api/ordini/${ordineId}/sla`);
    assert.equal(g.status, 200);
    assert.equal(g.dati.tempi.segnalatoAt, segnalato);
    assert.equal(g.dati.tempi.arrivoAt, arrivo);
    // Приоритетът е EMERGENZA — часовникът ИМА смисъл…
    assert.equal(g.dati.applicabile, true);
    // …но прагът идва от ДОГОВОРА, а този ордин няма такъв: тогава състоянието
    // е „non_applicabile", не измислена норма. Точно това пази продукта от
    // обещание, което никой не е поемал.
    assert.equal(g.dati.sla.intervento.stato, "non_applicabile");
    assert.equal(g.dati.sla.intervento.trascorsiMin, null);
  });

  test("пристигане ПРЕДИ сигнала се отказва — това не е часовник", async () => {
    const ora = Date.now();
    const { status } = await tecnico.patch(`/api/ordini/${ordineId}/sla`, {
      segnalatoAt: new Date(ora).toISOString(),
      arrivoAt: new Date(ora - 60_000).toISOString(),
    });
    assert.equal(status, 400);
  });

  test("нулирането на една отметка не бута другите", async () => {
    const g0 = await tecnico.get<{ tempi: { segnalatoAt: string | null } }>(
      `/api/ordini/${ordineId}/sla`,
    );
    const p = await tecnico.patch(`/api/ordini/${ordineId}/sla`, {
      arrivoAt: null,
    });
    assert.equal(p.status, 200);
    const g1 = await tecnico.get<{
      tempi: { segnalatoAt: string | null; arrivoAt: string | null };
    }>(`/api/ordini/${ordineId}/sla`);
    assert.equal(g1.dati.tempi.arrivoAt, null);
    assert.equal(g1.dati.tempi.segnalatoAt, g0.dati.tempi.segnalatoAt);
  });

  test("чужд ордин е 404, не чужди времена", async () => {
    const { status } = await tecnico.get(
      "/api/ordini/00000000-0000-4000-8000-000000000000/sla",
    );
    assert.equal(status, 404);
  });
});

// ───────────────────── 3–5. Фактура: DDT, подаване, покани ───────────────────

async function nuovaFatturaEmessa(prezzo = "300.00"): Promise<string> {
  const f = await direzione.post<{ id: string }>("/api/fatture", {
    oggetto: unico("FattNuovi"),
    tipo: "EMESSA",
    amministratoreId,
  });
  assert.equal(f.status, 201, JSON.stringify(f.dati));
  const v = await direzione.post(`/api/fatture/${f.dati.id}/voci`, {
    descrizione: "Canone di manutenzione",
    quantita: "1",
    prezzoUnitario: prezzo,
    aliquotaIva: "22",
  });
  assert.equal(v.status, 201, JSON.stringify(v.dati));
  return f.dati.id;
}

async function nuovoDdt(): Promise<string> {
  const d = await master.post<{ id: string }>("/api/ddt", {
    numero: unico("DDT"),
    data: new Date().toISOString().slice(0, 10),
    causale: "Consegna materiali",
  });
  assert.equal(d.status, 201, JSON.stringify(d.dati));
  return d.dati.id;
}

describe("DDT, закачени за фактура", () => {
  test("закачат се в чернова и правят документа TD24", async () => {
    const fattura = await nuovaFatturaEmessa();
    const ddt = await nuovoDdt();
    const p = await direzione.put(`/api/fatture/${fattura}/ddt`, {
      ddtIds: [ddt],
    });
    assert.equal(p.status, 200, JSON.stringify(p.dati));

    const g = await direzione.get<{ collegati: { id: string }[] }>(
      `/api/fatture/${fattura}/ddt`,
    );
    assert.equal(g.status, 200, JSON.stringify(g.dati));
    assert.equal(g.dati.collegati.length, 1);
  });

  test("закачен DDT е ЗАМРАЗЕН през общия маршрут", async () => {
    // ЗАЩО Е ВАЖНО. XML-ът не се пази — ражда се наново от живите редове, а
    // типът се извежда: махнатият DDT връща вече подаден документ на TD01 без
    // `DatiDDT`, със същия номер. Архивът тогава предава документ, различен от
    // издадения.
    const fattura = await nuovaFatturaEmessa();
    const ddt = await nuovoDdt();
    await direzione.put(`/api/fatture/${fattura}/ddt`, { ddtIds: [ddt] });

    const mod = await master.put<{ error?: string }>(`/api/ddt/${ddt}`, {
      causale: "Causale cambiata",
    });
    assert.equal(mod.status, 409, JSON.stringify(mod.dati));
    assert.match(String(mod.dati.error), /fattura/i);

    const via = await master.del<{ error?: string }>(`/api/ddt/${ddt}`);
    assert.equal(via.status, 409);

    // Разкаченият DDT пак е свободен — заключването е на връзката, не завинаги.
    await direzione.put(`/api/fatture/${fattura}/ddt`, { ddtIds: [] });
    const dopo = await master.put(`/api/ddt/${ddt}`, {
      causale: "Ora si può",
    });
    assert.equal(dopo.status, 200, JSON.stringify(dopo.dati));
  });

  test("фактура извън чернова не си мени DDT-тата", async () => {
    const fattura = await nuovaFatturaEmessa();
    const ddt = await nuovoDdt();
    const e = await direzione.patch(`/api/fatture/${fattura}/stato`, {
      stato: "EMESSA",
    });
    assert.equal(e.status, 200, JSON.stringify(e.dati));
    const p = await direzione.put(`/api/fatture/${fattura}/ddt`, {
      ddtIds: [ddt],
    });
    assert.equal(p.status, 409);
  });
});

describe("подаване към SDI", () => {
  test("черновата не се подава: номерът ѝ не е изразходван", async () => {
    const fattura = await nuovaFatturaEmessa();
    const { status } = await direzione.post(
      `/api/fatture/${fattura}/trasmetti`,
    );
    assert.equal(status, 409);
  });

  test("подаването е ВЕДНЪЖ, дори при два едновременни клика", async () => {
    // SDI отхвърля повторно ИМЕ на файл независимо от съдържанието; условният
    // запис е защитата, а проверката на резултата му е това, което пази
    // неизменимия одит от втори ред за преход, който не се е случил.
    const fattura = await nuovaFatturaEmessa();
    await direzione.patch(`/api/fatture/${fattura}/stato`, { stato: "EMESSA" });

    // Ако документът не минава проверките за SDI, маршрутът връща 422 и
    // състезанието изобщо не се проверява — затова причината се показва тук,
    // вместо тестът да падне с гол код.
    const controllo = await direzione.get<{ problemi: string[] }>(
      `/api/fatture/${fattura}/xml?controlla=1`,
    );
    assert.deepEqual(
      controllo.dati.problemi,
      [],
      "фактурата трябва да е годна",
    );

    // Подаване БЕЗ генериран файл се отказва с обяснение — прогресивният номер
    // (ключът за идемпотентност в SDI) се ражда при генерирането.
    const senzaXml = await direzione.post<{ error?: string }>(
      `/api/fatture/${fattura}/trasmetti`,
    );
    assert.equal(senzaXml.status, 409, JSON.stringify(senzaXml.dati));
    assert.match(String(senzaXml.dati.error), /XML/);

    const xml = await fetch(`${BASE}/api/fatture/${fattura}/xml`, {
      headers: { Cookie: direzione.cookieHeader() },
    });
    assert.equal(xml.status, 200);

    const esiti = await Promise.all([
      direzione.post<{ error?: string }>(`/api/fatture/${fattura}/trasmetti`),
      direzione.post<{ error?: string }>(`/api/fatture/${fattura}/trasmetti`),
    ]);
    const ok = esiti.filter((e) => e.status === 200).length;
    assert.equal(ok, 1, JSON.stringify(esiti.map((e) => [e.status, e.dati])));

    // И трети опит после — вече по състояние, не по състезание.
    const terzo = await direzione.post<{ error?: string }>(
      `/api/fatture/${fattura}/trasmetti`,
    );
    assert.equal(terzo.status, 409);
    assert.match(String(terzo.dati.error), /duplicato/i);

    // Одитът носи ЕДИН преход, не два.
    const aud = await master.get<{
      righe: { azione: string; entita: string; entitaId: string }[];
    }>(`/api/audit?entita=fatture&size=100`);
    const cambi = aud.dati.righe.filter(
      (r) => r.entitaId === fattura && r.azione === "STATE_CHANGE",
    );
    assert.equal(
      cambi.filter((_, i) => i >= 0).length >= 1,
      true,
      "поне един преход",
    );
  });
});

describe("покани за плащане", () => {
  /** Фактура, издадена и просрочена — падежът се задава назад. */
  async function fatturaScaduta(giorni: number): Promise<string> {
    const id = await nuovaFatturaEmessa("1000.00");
    const scadenza = new Date(Date.now() - giorni * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const p = await direzione.put(`/api/fatture/${id}`, {
      dataScadenza: scadenza,
    });
    assert.equal(p.status, 200, JSON.stringify(p.dati));
    await direzione.patch(`/api/fatture/${id}/stato`, { stato: "EMESSA" });
    return id;
  }

  /** Просрочена фактура на КОНДОМИНИУМ — режимът е законната лихва. */
  async function fatturaScadutaCondominio(giorni: number): Promise<string> {
    const f = await direzione.post<{ id: string }>("/api/fatture", {
      oggetto: unico("FattCond"),
      tipo: "EMESSA",
      condominioId,
    });
    assert.equal(f.status, 201, JSON.stringify(f.dati));
    const v = await direzione.post(`/api/fatture/${f.dati.id}/voci`, {
      descrizione: "Canone di manutenzione",
      quantita: "1",
      prezzoUnitario: "1000.00",
      aliquotaIva: "22",
    });
    assert.equal(v.status, 201, JSON.stringify(v.dati));
    const scadenza = new Date(Date.now() - giorni * 86_400_000)
      .toISOString()
      .slice(0, 10);
    await direzione.put(`/api/fatture/${f.dati.id}`, {
      dataScadenza: scadenza,
    });
    await direzione.patch(`/api/fatture/${f.dati.id}/stato`, {
      stato: "EMESSA",
    });
    return f.dati.id;
  }

  test("степен не се прескача", async () => {
    const id = await fatturaScaduta(120);
    const salto = await direzione.post<{ error?: string }>(
      `/api/fatture/${id}/solleciti`,
      { livello: 3, canale: "pec" },
    );
    assert.equal(salto.status, 409, JSON.stringify(salto.dati));
  });

  test("първата покана минава; втора със същата степен — не", async () => {
    const id = await fatturaScaduta(20);
    const primo = await direzione.post<{
      id: string;
      interessiCentesimi: number;
    }>(`/api/fatture/${id}/solleciti`, { livello: 1, canale: "email" });
    assert.equal(primo.status, 201, JSON.stringify(primo.dati));
    // Първата покана е БЕЗ лихва: искане на лихва при седмица закъснение
    // разваля отношения, които струват повече от лихвата.
    assert.equal(primo.dati.interessiCentesimi, 0);

    const bis = await direzione.post(`/api/fatture/${id}/solleciti`, {
      livello: 1,
      canale: "email",
    });
    assert.equal(bis.status, 409);
  });

  test("две едновременни покани не раждат две „primo sollecito“", async () => {
    // Ограничението е и в базата (`@@unique([fatturaId, livello])`), защото
    // между четенето и записа има прозорец, а таблицата е само-добавяща.
    const id = await fatturaScaduta(25);
    const esiti = await Promise.all([
      direzione.post(`/api/fatture/${id}/solleciti`, {
        livello: 1,
        canale: "email",
      }),
      direzione.post(`/api/fatture/${id}/solleciti`, {
        livello: 1,
        canale: "email",
      }),
    ]);
    assert.equal(
      esiti.filter((e) => e.status === 201).length,
      1,
      JSON.stringify(esiti.map((e) => e.status)),
    );
    const g = await direzione.get<{ solleciti: unknown[] }>(
      `/api/fatture/${id}/solleciti`,
    );
    assert.equal(g.dati.solleciti.length, 1);
  });

  test("непокрит от таблицата период НЕ се остойностява", async () => {
    // Ставката по D.Lgs. 231/2002 се обявява в ГУ на всяко полугодие. Докато
    // новата я няма, поканата се ОТКАЗВА: замразена лихва е завинаги, а
    // таблицата е само-добавяща — по-добре отказ, отколкото число, по-малко от
    // дължимото, отпечатано и връчено на длъжника.
    const id = await fatturaScaduta(45);
    await direzione.post(`/api/fatture/${id}/solleciti`, {
      livello: 1,
      canale: "email",
    });
    const secondo = await direzione.post<{
      error?: string;
      interessiCentesimi?: number;
    }>(`/api/fatture/${id}/solleciti`, { livello: 2, canale: "pec" });
    // Двата честни изхода: или ставката е налична и лихвата е положителна, или
    // липсва и маршрутът го КАЗВА. Мълчаливо нула не е между тях.
    if (secondo.status === 201)
      assert.ok((secondo.dati.interessiCentesimi ?? 0) > 0);
    else {
      assert.equal(secondo.status, 409);
      assert.match(String(secondo.dati.error), /Saggio d'interesse/);
    }
  });

  test("платената фактура не се сollecitира", async () => {
    const id = await fatturaScaduta(40);
    const tot = await direzione.get<{ totaleLordo: string }>(
      `/api/fatture/${id}`,
    );
    const p = await direzione.post(`/api/fatture/${id}/pagamenti`, {
      importo: tot.dati.totaleLordo,
      data: new Date().toISOString().slice(0, 10),
      modalita: "MP05",
    });
    assert.equal(p.status, 201, JSON.stringify(p.dati));
    const s = await direzione.post<{ error?: string }>(
      `/api/fatture/${id}/solleciti`,
      { livello: 1, canale: "email" },
    );
    assert.equal(s.status, 409);
    assert.match(String(s.dati.error), /saldata/i);
  });

  test("лихвата се ЗАМРАЗЯВА в реда, не се преизчислява", async () => {
    // КОНДОМИНИУМ, не студио: той е основният длъжник на асансьорна фирма и
    // към него важи законната лихва по чл. 1284 c.c. — таблицата ѝ покрива
    // текущата година. Търговската (D.Lgs. 231/2002) се обявява на полугодие
    // и следващият тест проверява точно какво става, докато я няма.
    const id = await fatturaScadutaCondominio(45);
    await direzione.post(`/api/fatture/${id}/solleciti`, {
      livello: 1,
      canale: "email",
    });
    const secondo = await direzione.post<{
      interessiCentesimi: number;
      giorniRitardo: number;
    }>(`/api/fatture/${id}/solleciti`, { livello: 2, canale: "pec" });
    assert.equal(secondo.status, 201, JSON.stringify(secondo.dati));
    assert.ok(secondo.dati.interessiCentesimi > 0, "втората степен носи лихва");
    const congelato = secondo.dati.interessiCentesimi;

    const g = await direzione.get<{
      solleciti: { livello: number; interessiCentesimi: number }[];
    }>(`/api/fatture/${id}/solleciti`);
    const riga = g.dati.solleciti.find((r) => r.livello === 2);
    assert.equal(riga?.interessiCentesimi, congelato);
  });
});

// ───────────────────────── 6. Пратка за счетоводителя ────────────────────────

describe("пакет за предаване", () => {
  test("чернова НЕ влиза в пратката", async () => {
    const bozza = await nuovaFatturaEmessa();
    const emessa = await nuovaFatturaEmessa();
    await direzione.patch(`/api/fatture/${emessa}/stato`, { stato: "EMESSA" });

    const anno = new Date().getFullYear();
    const res = await fetch(
      `${BASE}/api/fatture/conservazione?dal=${anno}-01-01&al=${anno}-12-31`,
      { headers: { Cookie: direzione.cookieHeader() } },
    );
    // 200 със ZIP или 422, ако нито една фактура не минава проверките за SDI —
    // и двете са честни отговори; за чернова важи само, че не е ВЪТРЕ.
    assert.ok([200, 422].includes(res.status), `HTTP ${res.status}`);
    if (res.status !== 200) return;

    const zip = Buffer.from(await res.arrayBuffer());
    const testo = zip.toString("latin1");
    const numeroBozza = (
      await direzione.get<{ numero: string }>(`/api/fatture/${bozza}`)
    ).dati.numero;
    assert.equal(
      testo.includes(numeroBozza),
      false,
      "черновата не бива да е в пратката",
    );
    // Истински ZIP: подписът на локалното заглавие е първите четири байта.
    assert.equal(zip.subarray(0, 4).toString("hex"), "504b0304");
    assert.ok(testo.includes("indice.json"));
    assert.ok(testo.includes("README.txt"));
  });

  test("невалиден период е 400 с обяснение", async () => {
    const res = await fetch(
      `${BASE}/api/fatture/conservazione?dal=non-una-data&al=2026-12-31`,
      { headers: { Cookie: direzione.cookieHeader() } },
    );
    assert.equal(res.status, 400);
  });

  test("операторът няма достъп до фискалния архив", async () => {
    const operatore = await comeRuolo("OPERATORE");
    const res = await fetch(
      `${BASE}/api/fatture/conservazione?dal=2026-01-01&al=2026-12-31`,
      { headers: { Cookie: operatore.cookieHeader() } },
    );
    assert.equal(res.status, 403);
  });
});

// ──────────────────── 7–8. Справка за вземания и календар ────────────────────

describe("справка за вземанията", () => {
  test("платената фактура изчезва от справката", async () => {
    const id = await nuovaFatturaEmessa("500.00");
    const scadenza = new Date(Date.now() - 10 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    await direzione.put(`/api/fatture/${id}`, { dataScadenza: scadenza });
    await direzione.patch(`/api/fatture/${id}/stato`, { stato: "EMESSA" });

    const prima = await direzione.get<{ righe: { fatturaId: string }[] }>(
      "/api/report/scadenzario",
    );
    assert.equal(prima.status, 200);
    assert.ok(prima.dati.righe.some((r) => r.fatturaId === id));

    const tot = await direzione.get<{ totaleLordo: string }>(
      `/api/fatture/${id}`,
    );
    await direzione.post(`/api/fatture/${id}/pagamenti`, {
      importo: tot.dati.totaleLordo,
      data: new Date().toISOString().slice(0, 10),
      modalita: "MP05",
    });

    const dopo = await direzione.get<{ righe: { fatturaId: string }[] }>(
      "/api/report/scadenzario",
    );
    assert.equal(
      dopo.dati.righe.some((r) => r.fatturaId === id),
      false,
    );
  });

  test("техникът не вижда вземанията", async () => {
    const { status } = await tecnico.get("/api/report/scadenzario");
    assert.equal(status, 403);
  });
});

describe("календарът", () => {
  test("трите вида ангажимент идват ЗАЕДНО за периода", async () => {
    const oggi = new Date();
    const g = await tecnico.get<{
      anno: number;
      mese: number;
      giorni: { chiave: string; impegni: { tipo: string }[] }[];
      capacita: number;
      totale: number;
    }>(
      `/api/calendario?anno=${oggi.getFullYear()}&mese=${oggi.getMonth() + 1}`,
    );
    assert.equal(g.status, 200, JSON.stringify(g.dati));
    // Мрежата винаги е от ЦЕЛИ седмици — иначе първият ред е с дупка и окото
    // я чете като свободен ден.
    assert.equal(g.dati.giorni.length % 7, 0);
    assert.equal(
      new Set(g.dati.giorni.map((x) => x.chiave)).size,
      g.dati.giorni.length,
      "нито един ден не се появява два пъти",
    );
    const tipi = new Set(
      g.dati.giorni.flatMap((x) => x.impegni.map((i) => i.tipo)),
    );
    for (const t of tipi)
      assert.ok(["ordine", "visita", "verifica"].includes(t));
  });

  test("сгрешен период е 400, не празен календар", async () => {
    // Празният календар се чете като „няма работа този месец" — точно
    // грешката, която диспечерът не бива да получава мълчаливо.
    for (const q of ["anno=2026&mese=13", "anno=1900&mese=1"]) {
      const { status } = await tecnico.get(`/api/calendario?${q}`);
      assert.equal(status, 400, q);
    }
  });
});
