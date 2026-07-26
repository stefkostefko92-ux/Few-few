// Нормативният слой през реалните маршрути.
//
// Модулните тестове доказват правилата; тук се доказва, че те наистина мерят
// СЪСТОЯНИЕТО НА УРЕДБАТА — включително това, което един ERP не бива да
// позволява: административно спряна уредба да бъде пусната с падащо меню.

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { comeRuolo, Sessione, unico } from "./_client";

let responsabile: Sessione;
let tecnico: Sessione;
let condominioId: string;

before(async () => {
  responsabile = await comeRuolo("RESPONSABILE");
  tecnico = await comeRuolo("TECNICO");
  const c = await responsabile.get<{ righe: { id: string; nome: string }[] }>(
    "/api/condomini?size=50",
  );
  assert.equal(c.status, 200);
  condominioId = c.dati.righe[0].id;
});

async function nuovoImpianto(over: Record<string, unknown> = {}) {
  const r = await responsabile.post<{
    id: string;
    matricola: string;
    stato: string;
  }>("/api/impianti", {
    matricola: unico("IMP"),
    marca: "Schindler",
    modello: "3300",
    condominioId,
    ...over,
  });
  assert.equal(r.status, 201, JSON.stringify(r.dati));
  return r.dati;
}

describe("законова проверка на уредбата", () => {
  test("положителната проверка мести срока с две години", async () => {
    const i = await nuovoImpianto();
    const v = await responsabile.post<{ prossimaVerifica: string }>(
      `/api/impianti/${i.id}/verifiche`,
      {
        data: "2026-03-15",
        esito: "POSITIVO",
        organismo: "Organismo XY",
        numeroVerbale: "V-1",
      },
    );
    assert.equal(v.status, 201, JSON.stringify(v.dati));
    assert.equal(v.dati.prossimaVerifica.slice(0, 10), "2028-03-15");

    const d = await responsabile.get<{
      stato: string;
      ultimaRevisione: string;
      prossimaRevisione: string;
    }>(`/api/impianti/${i.id}`);
    assert.equal(d.dati.stato, "ATTIVO");
    assert.equal(d.dati.ultimaRevisione.slice(0, 10), "2026-03-15");
    assert.equal(d.dati.prossimaRevisione.slice(0, 10), "2028-03-15");
  });

  test("законовият срок се обновява и в списъка с датите, с вдигнати наново прагове", async () => {
    const i = await nuovoImpianto();
    assert.equal(
      (
        await responsabile.post(`/api/impianti/${i.id}/verifiche`, {
          data: "2026-05-10",
          esito: "POSITIVO",
        })
      ).status,
      201,
    );
    const sc = await responsabile.get<{
      righe: { tipo: string; dataScadenza: string; notificato90: boolean }[];
    }>(`/api/scadenze?impiantoId=${i.id}`);
    const rev = sc.dati.righe.find((r) => r.tipo === "revisione");
    assert.ok(rev, "проверката трябва да роди законов срок");
    assert.equal(rev.dataScadenza.slice(0, 10), "2028-05-10");
    assert.equal(rev.notificato90, false);
  });

  test("ОТРИЦАТЕЛНАТА спира уредбата по закон и не дава следваща дата", async () => {
    const i = await nuovoImpianto();
    const v = await responsabile.post<{ prossimaVerifica: string | null }>(
      `/api/impianti/${i.id}/verifiche`,
      {
        data: "2026-04-01",
        esito: "NEGATIVO",
        prescrizioni: "Paracadute non funzionante",
      },
    );
    assert.equal(v.status, 201, JSON.stringify(v.dati));
    assert.equal(v.dati.prossimaVerifica, null);

    const d = await responsabile.get<{ stato: string }>(
      `/api/impianti/${i.id}`,
    );
    assert.equal(d.dati.stato, "FERMO_AMMINISTRATIVO");
  });

  test("административното спиране НЕ се вдига с падащо меню", async () => {
    const i = await nuovoImpianto();
    assert.equal(
      (
        await responsabile.post(`/api/impianti/${i.id}/verifiche`, {
          data: "2026-04-01",
          esito: "NEGATIVO",
        })
      ).status,
      201,
    );

    // Точно това би направил операторът, който иска уредбата да заработи.
    const r = await responsabile.put(`/api/impianti/${i.id}`, {
      stato: "ATTIVO",
    });
    assert.equal(r.status, 409, JSON.stringify(r.dati));
    assert.match(
      String((r.dati as { error?: string }).error),
      /fermo amministrativo/i,
    );

    // Останалото по картона си остава променимо — забраната е точна, не тотална.
    assert.equal(
      (await responsabile.put(`/api/impianti/${i.id}`, { note: "x" })).status,
      200,
    );
    assert.equal(
      (await responsabile.get<{ stato: string }>(`/api/impianti/${i.id}`)).dati
        .stato,
      "FERMO_AMMINISTRATIVO",
    );
  });

  test("нова положителна проверка връща уредбата в служба", async () => {
    const i = await nuovoImpianto();
    await responsabile.post(`/api/impianti/${i.id}/verifiche`, {
      data: "2026-04-01",
      esito: "NEGATIVO",
    });
    assert.equal(
      (
        await responsabile.post(`/api/impianti/${i.id}/verifiche`, {
          data: "2026-06-01",
          esito: "POSITIVO",
        })
      ).status,
      201,
    );
    // Проверката САМА връща уредбата в служба: тя е правното събитие, което
    // вдига забраната. Оператор не е нужен — и не му се разрешава.
    const d = await responsabile.get<{ stato: string }>(
      `/api/impianti/${i.id}`,
    );
    assert.equal(d.dati.stato, "ATTIVO");
    // И оттук нататък обикновената промяна вече не е блокирана.
    assert.equal(
      (
        await responsabile.put(`/api/impianti/${i.id}`, {
          stato: "MANUTENZIONE",
        })
      ).status,
      200,
    );
  });

  test("извънредната проверка не смъква двугодишния часовник", async () => {
    const i = await nuovoImpianto();
    await responsabile.post(`/api/impianti/${i.id}/verifiche`, {
      data: "2026-01-10",
      esito: "POSITIVO",
    });
    await responsabile.post(`/api/impianti/${i.id}/verifiche`, {
      data: "2026-07-10",
      esito: "POSITIVO",
      tipo: "STRAORDINARIA",
    });
    const d = await responsabile.get<{ prossimaRevisione: string }>(
      `/api/impianti/${i.id}`,
    );
    assert.equal(d.dati.prossimaRevisione.slice(0, 10), "2028-01-10");
  });

  test("техникът не вписва законова проверка — тя мени правния статус", async () => {
    const i = await nuovoImpianto();
    const r = await tecnico.post(`/api/impianti/${i.id}/verifiche`, {
      data: "2026-04-01",
      esito: "POSITIVO",
    });
    assert.equal(r.status, 403);
    // Но я ВИЖДА: историята на уредбата му трябва на място.
    assert.equal(
      (await tecnico.get(`/api/impianti/${i.id}/verifiche`)).status,
      200,
    );
  });

  test("чужда уредба не приема проверка с познат идентификатор", async () => {
    const i = await nuovoImpianto();
    const master = await comeRuolo("MASTER");
    const slug = unico("norm-t")
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-");
    const t = await master.post<{ id: string }>("/api/tenants", {
      slug,
      ragioneSociale: "Altra Ascensori",
      email: `${slug}@test.local`,
    });
    assert.equal(t.status, 201);
    const email = `${slug}-resp@test.local`;
    assert.equal(
      (
        await master.post("/api/utenti", {
          email,
          password: "collina tranquilla 2026",
          nome: "Resp",
          cognome: "Altra",
          ruolo: "RESPONSABILE",
          tenantId: t.dati.id,
        })
      ).status,
      201,
    );
    const altra = new Sessione();
    assert.equal(await altra.entra(email, "collina tranquilla 2026"), 200);
    assert.equal(
      (
        await altra.post(`/api/impianti/${i.id}/verifiche`, {
          data: "2026-04-01",
          esito: "POSITIVO",
        })
      ).status,
      404,
    );
  });
});

describe("проверките по чл. 15, ал. 4 в рапортичката", () => {
  async function ordinePerImpianto(impiantoId: string) {
    const o = await responsabile.post<{ id: string }>("/api/ordini", {
      oggetto: unico("ODL"),
      impiantoId,
      condominioId,
    });
    assert.equal(o.status, 201, JSON.stringify(o.dati));
    return o.dati.id;
  }

  test("критична неизправност СПИРА уредбата, не остава в текста", async () => {
    const i = await nuovoImpianto();
    const ordineId = await ordinePerImpianto(i.id);
    const r = await tecnico.post<{
      impiantoFermato: boolean;
      impiantoId: string;
    }>(`/api/ordini/${ordineId}/rapportini`, {
      descrizione: "Controllo semestrale",
      tipoIntervento: "VERIFICA_SEMESTRALE",
      esito: "DA_COMPLETARE",
      vParacadute: false,
      vFuni: true,
    });
    assert.equal(r.status, 201, JSON.stringify(r.dati));
    assert.equal(r.dati.impiantoFermato, true);
    // Рапортичката сочи уредбата ПРЯКО, не само през ордина.
    assert.equal(r.dati.impiantoId, i.id);

    const d = await responsabile.get<{ stato: string }>(
      `/api/impianti/${i.id}`,
    );
    assert.equal(d.dati.stato, "FERMO");
  });

  test("непълната шестмесечна проверка се ВИЖДА, но не блокира техника", async () => {
    const i = await nuovoImpianto();
    const ordineId = await ordinePerImpianto(i.id);
    const r = await tecnico.post<{
      avvisi: string[];
      impiantoFermato: boolean;
    }>(`/api/ordini/${ordineId}/rapportini`, {
      descrizione: "Semestrale",
      tipoIntervento: "VERIFICA_SEMESTRALE",
      vFuni: true,
    });
    assert.equal(r.status, 201);
    assert.equal(r.dati.impiantoFermato, false);
    assert.ok(r.dati.avvisi.some((a) => /art\. 15 c\.4/.test(a)));
  });

  test("пълната и изрядна проверка минава без забележки", async () => {
    const i = await nuovoImpianto();
    const ordineId = await ordinePerImpianto(i.id);
    const r = await tecnico.post<{
      avvisi: string[];
      impiantoFermato: boolean;
    }>(`/api/ordini/${ordineId}/rapportini`, {
      descrizione: "Semestrale",
      tipoIntervento: "VERIFICA_SEMESTRALE",
      esito: "RISOLTO",
      vFuni: true,
      vParacadute: true,
      vLimitatoreVelocita: true,
      vIsolamentoElettrico: true,
      vMessaTerra: true,
      vPorteSerrature: true,
      vIlluminazioneEmergenza: true,
      vCitofonoAllarme: true,
    });
    assert.equal(r.status, 201, JSON.stringify(r.dati));
    assert.deepEqual(r.dati.avvisi, []);
    assert.equal(r.dati.impiantoFermato, false);
  });

  test("административно спряна уредба не се „сваля“ до обикновено спиране", async () => {
    const i = await nuovoImpianto();
    await responsabile.post(`/api/impianti/${i.id}/verifiche`, {
      data: "2026-04-01",
      esito: "NEGATIVO",
    });
    const ordineId = await ordinePerImpianto(i.id);
    await tecnico.post(`/api/ordini/${ordineId}/rapportini`, {
      descrizione: "Intervento",
      vCitofonoAllarme: false,
    });
    const d = await responsabile.get<{ stato: string }>(
      `/api/impianti/${i.id}`,
    );
    assert.equal(
      d.dati.stato,
      "FERMO_AMMINISTRATIVO",
      "по-силното състояние не се презаписва",
    );
  });
});
