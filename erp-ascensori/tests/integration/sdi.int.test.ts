// Експортът за SDI през реалния маршрут.
//
// Смисълът на този слой (за разлика от модулните тестове на генератора): че
// данните, които СЕИДЪТ и потребителският поток произвеждат, наистина стигат до
// годен файл — и че негодната фактура се спира ПРЕДИ подаване, с обяснение.

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { comeRuolo, Sessione, BASE, unico } from "./_client";

let direzione: Sessione;
let master: Sessione;
let amministratoreId: string;
let condominioId: string;

before(async () => {
  direzione = await comeRuolo("DIREZIONE");
  master = await comeRuolo("MASTER");
  const lista = await direzione.get<{
    righe: { id: string; ragioneSociale: string | null }[];
  }>("/api/amministratori?size=50");
  assert.equal(lista.status, 200);
  const studio = lista.dati.righe.find((r) =>
    r.ragioneSociale?.includes("Bianchi"),
  );
  assert.ok(studio, "сийдът трябва да е създал Studio Bianchi");
  amministratoreId = studio.id;

  // Един-единствен `before` за целия файл: node:test изпълнява коренните хукове
  // по реда на РЕГИСТРАЦИЯ спрямо suite-овете, а втори хук след първия
  // `describe` вече не е гарантирано подреден спрямо него.
  const cond = await direzione.get<{ righe: { id: string; nome: string }[] }>(
    "/api/condomini?size=50",
  );
  assert.equal(cond.status, 200);
  const c = cond.dati.righe.find((r) => r.nome.includes("Torre Aurora"));
  assert.ok(c, "сийдът трябва да е създал Condominio Torre Aurora");
  condominioId = c.id;
});

/** Фактура с един ред. */
async function nuovaFattura(
  amministratore: string | null,
  voce: Record<string, unknown> = {
    descrizione: "Canone",
    quantita: "1",
    prezzoUnitario: "300.00",
    aliquotaIva: "22",
  },
) {
  const f = await direzione.post<{ id: string; numero: string }>(
    "/api/fatture",
    {
      oggetto: unico("SDI"),
      amministratoreId: amministratore,
      tipo: "EMESSA",
    },
  );
  assert.equal(f.status, 201, JSON.stringify(f.dati));
  const v = await direzione.post(`/api/fatture/${f.dati.id}/voci`, voce);
  assert.equal(v.status, 201, JSON.stringify(v.dati));
  return f.dati;
}

/** Тегли XML-а със сесийните бисквитки (не минава през JSON помощника). */
async function scaricaXml(s: Sessione, id: string) {
  const res = await fetch(`${BASE}/api/fatture/${id}/xml`, {
    headers: { Cookie: s.cookieHeader() },
  });
  return { status: res.status, testo: await res.text(), headers: res.headers };
}

describe("експорт за SDI", () => {
  test("фактура с пълни реквизити дава годен XML", async () => {
    const f = await nuovaFattura(amministratoreId);

    const controllo = await direzione.get<{
      pronta: boolean;
      problemi: string[];
    }>(`/api/fatture/${f.id}/xml?controlla=1`);
    assert.equal(controllo.status, 200);
    assert.deepEqual(
      controllo.dati.problemi,
      [],
      "сийднатите данни трябва да стигат за SDI",
    );
    assert.equal(controllo.dati.pronta, true);

    const xml = await scaricaXml(direzione, f.id);
    assert.equal(xml.status, 200);
    assert.match(xml.headers.get("content-type") ?? "", /application\/xml/);
    // Името на файла е по правилата на SDI — повторено име е дубликат за него.
    assert.match(
      xml.headers.get("content-disposition") ?? "",
      /filename="IT\d{11}_[A-Z0-9]{5}\.xml"/,
    );

    assert.match(xml.testo, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    assert.match(xml.testo, /<TipoDocumento>TD01<\/TipoDocumento>/);
    assert.match(xml.testo, new RegExp(`<Numero>${f.numero}</Numero>`));
    // 300,00 × 22 % = 66,00 → 366,00; тоталът трябва да съвпада с обобщението.
    assert.match(xml.testo, /<ImponibileImporto>300\.00<\/ImponibileImporto>/);
    assert.match(xml.testo, /<Imposta>66\.00<\/Imposta>/);
    assert.match(
      xml.testo,
      /<ImportoTotaleDocumento>366\.00<\/ImportoTotaleDocumento>/,
    );
  });

  test("фактура без контрагент се спира ПРЕДИ подаване, с обяснение", async () => {
    const f = await nuovaFattura(null);
    const xml = await scaricaXml(direzione, f.id);
    // 422, не 500: заявката е разбрана, документът просто не е годен.
    assert.equal(xml.status, 422);
    const corpo = JSON.parse(xml.testo) as { problemi: string[] };
    assert.ok(corpo.problemi.length > 0);
    assert.ok(
      corpo.problemi.some((p) => /Cliente/.test(p)),
      `очаквах забележки за клиента: ${JSON.stringify(corpo.problemi)}`,
    );
  });

  test("ставка 0 без natura не тръгва", async () => {
    const f = await nuovaFattura(amministratoreId, {
      descrizione: "Prestazione esente",
      quantita: "1",
      prezzoUnitario: "100.00",
      aliquotaIva: "0",
    });
    const c = await direzione.get<{ pronta: boolean; problemi: string[] }>(
      `/api/fatture/${f.id}/xml?controlla=1`,
    );
    assert.equal(c.dati.pronta, false);
    assert.ok(c.dati.problemi.some((p) => /natura/i.test(p)));
  });

  test("под нивото на DIREZIONE експортът не съществува", async () => {
    const f = await nuovaFattura(amministratoreId);
    const operatore = await comeRuolo("OPERATORE");
    const r = await operatore.get(`/api/fatture/${f.id}/xml?controlla=1`);
    assert.equal(r.status, 403);
  });

  test("чужда фактура не се изнася с познат идентификатор", async () => {
    const f = await nuovaFattura(amministratoreId);
    // Нова фирма със свой DIREZIONE: нейният потребител не бива да види файла.
    const slug = unico("sdi-t")
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-");
    const t = await master.post<{ id: string }>("/api/tenants", {
      slug,
      ragioneSociale: "Altra Azienda",
      email: `${slug}@test.local`,
    });
    assert.equal(t.status, 201);
    const email = `${slug}-dir@test.local`;
    assert.equal(
      (
        await master.post("/api/utenti", {
          email,
          password: "collina tranquilla 2026",
          nome: "Dir",
          cognome: "Altra",
          ruolo: "DIREZIONE",
          tenantId: t.dati.id,
        })
      ).status,
      201,
    );
    const altra = new Sessione();
    assert.equal(await altra.entra(email, "collina tranquilla 2026"), 200);
    const r = await altra.get(`/api/fatture/${f.id}/xml?controlla=1`);
    assert.equal(r.status, 404);
  });

  test("изнасянето оставя следа в регистъра", async () => {
    const f = await nuovaFattura(amministratoreId);
    assert.equal((await scaricaXml(direzione, f.id)).status, 200);

    const admin = await comeRuolo("ADMIN");
    const reg = await admin.get<{
      righe: { entitaId: string; dettagli: unknown }[];
    }>("/api/audit?entita=fatture&azione=STATE_CHANGE&size=50");
    assert.equal(reg.status, 200);
    const riga = reg.dati.righe.find((r) => r.entitaId === f.id);
    assert.ok(riga, "изнасянето трябва да е записано");
    assert.match(JSON.stringify(riga.dettagli), /SDI/);
  });
});

// ── Кондоминиумът като получател, удържане и плащания ───────────────────────
//
// Този слой проверява това, което модулните тестове не могат: че данните ОТ
// БАЗАТА стигат до правилния получател, че удържането се смята от истински
// тотали и че статусите не се разминават с постъпленията.

async function fatturaCondominio(voce?: Record<string, unknown>) {
  const f = await direzione.post<{
    id: string;
    numero: string;
    ritenuta: boolean;
  }>("/api/fatture", {
    oggetto: unico("Cond"),
    condominioId,
    amministratoreId,
    tipo: "EMESSA",
  });
  assert.equal(f.status, 201, JSON.stringify(f.dati));
  const v = await direzione.post(
    `/api/fatture/${f.dati.id}/voci`,
    voce ?? {
      descrizione: "Manutenzione ordinaria",
      quantita: "1",
      prezzoUnitario: "1000.00",
      aliquotaIva: "22",
    },
  );
  assert.equal(v.status, 201, JSON.stringify(v.dati));
  return f.dati;
}

describe("кондоминиумът е получателят", () => {
  test("XML-ът носи кондоминиума, не студиото — и без номер по ДДС", async () => {
    const f = await fatturaCondominio();
    const xml = await scaricaXml(direzione, f.id);
    assert.equal(xml.status, 200, xml.testo.slice(0, 400));

    assert.match(
      xml.testo,
      /<Denominazione>Condominio Torre Aurora<\/Denominazione>/,
    );
    assert.equal(
      xml.testo.includes("Studio Bianchi"),
      false,
      "студиото не е страна",
    );
    // Единственият `IdFiscaleIVA` е този на ПОДАТЕЛЯ: кондоминиумът не е
    // данъчнозадължено лице по ДДС и кодът му е `CodiceFiscale`.
    assert.equal(xml.testo.match(/<IdFiscaleIVA>/g)?.length, 1);
    assert.match(xml.testo, /<CodiceFiscale>97123456789<\/CodiceFiscale>/);
  });

  test("удържането 4 % се включва само по себе си и намалява платимото", async () => {
    const f = await fatturaCondominio();
    assert.equal(
      f.ritenuta,
      true,
      "кондоминиумът е заместник по данъка по закон",
    );

    const c = await direzione.get<{
      pronta: boolean;
      problemi: string[];
      totali: { ritenuta: string; totaleDocumento: string; daPagare: string };
    }>(`/api/fatture/${f.id}/xml?controlla=1`);
    assert.deepEqual(c.dati.problemi, []);
    // 1 000,00 · 22 % = 220,00 → документ 1 220,00; удържане 40,00 → 1 180,00.
    assert.equal(c.dati.totali.ritenuta, "40.00");
    assert.equal(c.dati.totali.totaleDocumento, "1220.00");
    assert.equal(c.dati.totali.daPagare, "1180.00");

    const xml = await scaricaXml(direzione, f.id);
    assert.match(xml.testo, /<ImportoRitenuta>40\.00<\/ImportoRitenuta>/);
    assert.match(xml.testo, /<CausalePagamento>W<\/CausalePagamento>/);
    assert.match(xml.testo, /<ImportoPagamento>1180\.00<\/ImportoPagamento>/);
  });

  test("прогресивният код се ЗАМРАЗЯВА при първото теглене", async () => {
    const f = await fatturaCondominio();
    const uno = await scaricaXml(direzione, f.id);
    const due = await scaricaXml(direzione, f.id);
    const nome = (r: typeof uno) => r.headers.get("content-disposition");
    // Дотук кодът се извеждаше от БРОЯ фактури — тоест се менеше между две
    // тегления и преиздаването изглеждаше на SDI като нов документ.
    assert.equal(nome(uno), nome(due));
  });

  test("два различни документа не делят прогресивен код", async () => {
    const a = await fatturaCondominio();
    const b = await fatturaCondominio();
    assert.notEqual(
      (await scaricaXml(direzione, a.id)).headers.get("content-disposition"),
      (await scaricaXml(direzione, b.id)).headers.get("content-disposition"),
    );
  });
});

describe("плащания и статус в SDI", () => {
  test("частичното постъпление е PARZIALE, пълното — PAGATA", async () => {
    const f = await fatturaCondominio();
    assert.equal(
      (await direzione.patch(`/api/fatture/${f.id}/stato`, { stato: "EMESSA" }))
        .status,
      200,
    );

    const p1 = await direzione.post(`/api/fatture/${f.id}/pagamenti`, {
      importo: "500.00",
    });
    assert.equal(p1.status, 201, JSON.stringify(p1.dati));
    let d = await direzione.get<{
      statoPagamento: string;
      totalePagato: string;
    }>(`/api/fatture/${f.id}`);
    assert.equal(d.dati.statoPagamento, "PARZIALE");
    assert.equal(d.dati.totalePagato, "500");

    // Остатъкът е до 1 180,00 (нето от удържането), НЕ до 1 220,00.
    assert.equal(
      (
        await direzione.post(`/api/fatture/${f.id}/pagamenti`, {
          importo: "680.00",
        })
      ).status,
      201,
    );
    d = await direzione.get(`/api/fatture/${f.id}`);
    assert.equal(d.dati.statoPagamento, "PAGATA");
  });

  test("по чернова не се вписват постъпления", async () => {
    const f = await fatturaCondominio();
    const r = await direzione.post(`/api/fatture/${f.id}/pagamenti`, {
      importo: "10.00",
    });
    assert.equal(r.status, 409);
  });

  test("отказът от SDI не гори номера и пуска петдневния часовник", async () => {
    const f = await fatturaCondominio();
    assert.equal((await scaricaXml(direzione, f.id)).status, 200);
    assert.equal(
      (await direzione.patch(`/api/fatture/${f.id}/sdi`, { stato: "INVIATA" }))
        .status,
      200,
    );

    const n = await direzione.post(`/api/fatture/${f.id}/notifiche`, {
      tipo: "NS",
      errori: [{ codice: "00301", descrizione: "Partita IVA non valida" }],
    });
    assert.equal(n.status, 201, JSON.stringify(n.dati));

    const d = await direzione.get<{
      statoSdi: string;
      numero: string;
      scadenzaRinvioSdi: string | null;
      notificheSdi: { tipo: string }[];
    }>(`/api/fatture/${f.id}`);
    assert.equal(d.dati.statoSdi, "SCARTATA");
    assert.equal(d.dati.numero, f.numero, "номерът НЕ се изразходва при отказ");
    assert.ok(
      d.dati.scadenzaRinvioSdi,
      "часовникът за преиздаване трябва да тръгне",
    );
    assert.equal(d.dati.notificheSdi.length, 1);

    // От отказ се преиздава; към „изпратена" директно не се скача.
    assert.equal(
      (await direzione.patch(`/api/fatture/${f.id}/sdi`, { stato: "INVIATA" }))
        .status,
      409,
    );
    assert.equal(
      (await direzione.patch(`/api/fatture/${f.id}/sdi`, { stato: "GENERATA" }))
        .status,
      200,
    );
  });

  test("известие по нетръгнал документ се отказва", async () => {
    const f = await fatturaCondominio();
    const r = await direzione.post(`/api/fatture/${f.id}/notifiche`, {
      tipo: "RC",
    });
    assert.equal(r.status, 409);
  });

  test("чужда фактура не приема постъпление с познат идентификатор", async () => {
    const f = await fatturaCondominio();
    const operatore = await comeRuolo("OPERATORE");
    assert.equal(
      (
        await operatore.post(`/api/fatture/${f.id}/pagamenti`, {
          importo: "1.00",
        })
      ).status,
      403,
    );
  });
});

describe("значими блага", () => {
  test("разцепването ражда трите законови реда и вдига ставката на горницата", async () => {
    const f = await fatturaCondominio({
      descrizione: "Posa in opera",
      quantita: "1",
      prezzoUnitario: "3000.00",
      aliquotaIva: "10",
    });
    assert.equal(
      (
        await direzione.post(`/api/fatture/${f.id}/voci`, {
          descrizione: "Ascensore",
          quantita: "1",
          prezzoUnitario: "8000.00",
          aliquotaIva: "10",
          beneSignificativo: true,
        })
      ).status,
      201,
    );

    const anteprima = await direzione.get<{
      imponibileAgevolato: string;
      imponibileOrdinario: string;
    }>(`/api/fatture/${f.id}/beni-significativi`);
    assert.equal(anteprima.status, 200);
    assert.equal(anteprima.dati.imponibileAgevolato, "6000.00");
    assert.equal(anteprima.dati.imponibileOrdinario, "5000.00");

    const r = await direzione.post<{
      voci: { aliquotaIva: string }[];
      totaleLordo: string;
    }>(`/api/fatture/${f.id}/beni-significativi`, {});
    assert.equal(r.status, 200, JSON.stringify(r.dati));
    assert.equal(r.dati.voci.length, 3);
    // 6 000 · 10 % = 600 · 5 000 · 22 % = 1 100 → 11 000 + 1 700 = 12 700
    assert.equal(String(r.dati.totaleLordo), "12700");
    const aliquote = r.dati.voci.map((v) => String(v.aliquotaIva));
    assert.deepEqual(aliquote, ["10", "10", "22"]);
  });
});
