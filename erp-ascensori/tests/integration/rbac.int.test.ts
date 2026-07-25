// RBAC матрица през РЕАЛНИЯ HTTP слой: 7 роли × защитените маршрути.
// Чистата йерархия се тества в roles.test.ts — тук проверяваме, че всеки
// маршрут реално прилага прага си (copy-paste грешка минава невидима иначе).

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { comeRuolo, Sessione, UTENTI, unico, type Ruolo } from "./_client";

const LIVELLO: Record<Ruolo, number> = {
  MASTER: 1,
  ADMIN: 2,
  DIREZIONE: 3,
  RESPONSABILE: 4,
  TECNICO: 5,
  OPERATORE: 6,
  CLIENTE: 7,
};
const RUOLI = Object.keys(LIVELLO) as Ruolo[];

const sessioni = new Map<Ruolo, Sessione>();
before(async () => {
  for (const r of RUOLI) sessioni.set(r, await comeRuolo(r));
});

/** Маршрут + минималното ниво, което трябва да го пуска. */
interface Caso {
  nome: string;
  metodo: "GET" | "POST" | "PATCH" | "DELETE";
  percorso: string;
  minimo: Ruolo;
  corpo?: unknown;
}

const CASI: Caso[] = [
  { nome: "четене на импианти", metodo: "GET", percorso: "/api/impianti", minimo: "OPERATORE" },
  { nome: "четене на ордини", metodo: "GET", percorso: "/api/ordini", minimo: "TECNICO" },
  { nome: "четене на фактури", metodo: "GET", percorso: "/api/fatture", minimo: "DIREZIONE" },
  { nome: "табло", metodo: "GET", percorso: "/api/dashboard/stats", minimo: "OPERATORE" },
  { nome: "четене на потребители", metodo: "GET", percorso: "/api/utenti", minimo: "ADMIN" },
  { nome: "регистър на операциите", metodo: "GET", percorso: "/api/audit", minimo: "ADMIN" },
  // САМО MASTER: `tenants` е служебна таблица без филтър по фирма, затова с
  // ниво ADMIN администраторът на един клиент четеше списъка с всички фирми,
  // удължаваше собствения си абонамент и деактивираше конкурент.
  { nome: "фирми (multi-tenant)", metodo: "GET", percorso: "/api/tenants", minimo: "MASTER" },
  { nome: "четене на движения", metodo: "GET", percorso: "/api/movimenti", minimo: "OPERATORE" },
  {
    nome: "създаване на кондоминио",
    metodo: "POST",
    percorso: "/api/condomini",
    minimo: "OPERATORE",
    corpo: { nome: "X", indirizzo: "Y", citta: "Z" },
  },
  {
    nome: "създаване на фактура",
    metodo: "POST",
    percorso: "/api/fatture",
    minimo: "DIREZIONE",
    corpo: { tipo: "EMESSA" },
  },
  {
    nome: "масов импорт",
    metodo: "POST",
    percorso: "/api/import",
    minimo: "ADMIN",
    corpo: { entita: "condomini", righe: [{ nome: "A", indirizzo: "B", citta: "C" }] },
  },
  {
    nome: "проверка на целостта на audit",
    metodo: "POST",
    percorso: "/api/audit/verifica",
    minimo: "ADMIN",
    corpo: { limite: 5 },
  },
  {
    nome: "ръчна проверка на сроковете",
    metodo: "POST",
    percorso: "/api/scadenze/check",
    minimo: "RESPONSABILE",
  },
];

describe("RBAC матрица през HTTP", () => {
  for (const caso of CASI) {
    for (const ruolo of RUOLI) {
      const trebvaDaMine = LIVELLO[ruolo] <= LIVELLO[caso.minimo];
      test(`${caso.nome}: ${ruolo} ${trebvaDaMine ? "минава" : "е отказан"}`, async () => {
        const s = sessioni.get(ruolo)!;
        const corpo =
          caso.metodo === "POST" && caso.percorso === "/api/condomini"
            ? { ...(caso.corpo as object), nome: unico("Cond") }
            : caso.corpo;
        const { status } = await s.richiesta(caso.metodo, caso.percorso, corpo);

        if (trebvaDaMine) {
          assert.notEqual(status, 403, `${ruolo} трябваше да мине ${caso.percorso}, но получи 403`);
          assert.notEqual(status, 401, `${ruolo} трябваше да е автентикиран за ${caso.percorso}`);
        } else {
          assert.equal(
            status,
            403,
            `${ruolo} НЕ трябваше да стигне ${caso.metodo} ${caso.percorso} (получи ${status})`
          );
        }
      });
    }
  }
});

describe("без сесия", () => {
  test("всеки защитен маршрут връща 401, не пренасочване", async () => {
    const anonimo = new Sessione();
    for (const caso of CASI) {
      const { status } = await anonimo.richiesta(caso.metodo, caso.percorso, caso.corpo);
      assert.equal(status, 401, `${caso.metodo} ${caso.percorso} върна ${status} вместо 401`);
    }
  });
});

describe("операции, запазени за най-високите нива", () => {
  test("изтриване на потребител: ADMIN получава 403, само MASTER може", async () => {
    const master = sessioni.get("MASTER")!;
    const admin = sessioni.get("ADMIN")!;
    const email = `${unico("u").toLowerCase()}@test.local`;
    const creato = await master.post<{ id: string }>("/api/utenti", {
      email,
      password: "ParolaTemporanea123",
      nome: "Test",
      cognome: "Utente",
    });
    assert.equal(creato.status, 201);

    const daAdmin = await admin.del(`/api/utenti/${creato.dati.id}`);
    assert.equal(daAdmin.status, 403, "ADMIN не бива да може да трие потребители");

    const daMaster = await master.del(`/api/utenti/${creato.dati.id}`);
    assert.equal(daMaster.status, 200, "MASTER трябва да може да трие потребители");
  });

  test("MASTER не може да изтрие собствения си акаунт", async () => {
    const master = sessioni.get("MASTER")!;
    const me = await master.get<{ id: string }>("/api/me");
    const { status } = await master.del(`/api/utenti/${me.dati.id}`);
    assert.equal(status, 409);
  });

  test("ADMIN не може да вдигне някого до MASTER", async () => {
    const admin = sessioni.get("ADMIN")!;
    const lista = await admin.get<{ righe: { id: string; email: string }[] }>("/api/utenti");
    const operatore = lista.dati.righe.find((u) => u.email === UTENTI.OPERATORE)!;
    const { status } = await admin.put(`/api/utenti/${operatore.id}`, { ruolo: "MASTER" });
    assert.equal(status, 403, "само MASTER раздава ролята MASTER");
  });
});
