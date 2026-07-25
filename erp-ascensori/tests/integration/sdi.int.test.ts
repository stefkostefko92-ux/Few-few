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

before(async () => {
  direzione = await comeRuolo("DIREZIONE");
  master = await comeRuolo("MASTER");
  const lista = await direzione.get<{ righe: { id: string; ragioneSociale: string | null }[] }>(
    "/api/amministratori?size=50",
  );
  assert.equal(lista.status, 200);
  const studio = lista.dati.righe.find((r) => r.ragioneSociale?.includes("Bianchi"));
  assert.ok(studio, "сийдът трябва да е създал Studio Bianchi");
  amministratoreId = studio.id;
});

/** Фактура с един ред. */
async function nuovaFattura(
  amministratore: string | null,
  voce: Record<string, unknown> = { descrizione: "Canone", quantita: "1", prezzoUnitario: "300.00", aliquotaIva: "22" },
) {
  const f = await direzione.post<{ id: string; numero: string }>("/api/fatture", {
    oggetto: unico("SDI"),
    amministratoreId: amministratore,
    tipo: "EMESSA",
  });
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

    const controllo = await direzione.get<{ pronta: boolean; problemi: string[] }>(
      `/api/fatture/${f.id}/xml?controlla=1`,
    );
    assert.equal(controllo.status, 200);
    assert.deepEqual(controllo.dati.problemi, [], "сийднатите данни трябва да стигат за SDI");
    assert.equal(controllo.dati.pronta, true);

    const xml = await scaricaXml(direzione, f.id);
    assert.equal(xml.status, 200);
    assert.match(xml.headers.get("content-type") ?? "", /application\/xml/);
    // Името на файла е по правилата на SDI — повторено име е дубликат за него.
    assert.match(xml.headers.get("content-disposition") ?? "", /filename="IT\d{11}_[A-Z0-9]{5}\.xml"/);

    assert.match(xml.testo, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    assert.match(xml.testo, /<TipoDocumento>TD01<\/TipoDocumento>/);
    assert.match(xml.testo, new RegExp(`<Numero>${f.numero}</Numero>`));
    // 300,00 × 22 % = 66,00 → 366,00; тоталът трябва да съвпада с обобщението.
    assert.match(xml.testo, /<ImponibileImporto>300\.00<\/ImponibileImporto>/);
    assert.match(xml.testo, /<Imposta>66\.00<\/Imposta>/);
    assert.match(xml.testo, /<ImportoTotaleDocumento>366\.00<\/ImportoTotaleDocumento>/);
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
    const slug = unico("sdi-t").toLowerCase().replace(/[^a-z0-9-]/g, "-");
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
    const reg = await admin.get<{ righe: { entitaId: string; dettagli: unknown }[] }>(
      "/api/audit?entita=fatture&azione=STATE_CHANGE&size=50",
    );
    assert.equal(reg.status, 200);
    const riga = reg.dati.righe.find((r) => r.entitaId === f.id);
    assert.ok(riga, "изнасянето трябва да е записано");
    assert.match(JSON.stringify(riga.dettagli), /SDI/);
  });
});
