// Защита на достъпа през HTTP: блокада 5/15мин, ротация на refresh token-а,
// изход, който прави сесията невъзстановима, и незабавен ефект от деактивиране.

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { comeRuolo, Sessione, PASSWORD, unico } from "./_client";

let master: Sessione;
before(async () => {
  master = await comeRuolo("MASTER");
});

/** Създава нов потребител — всеки тест работи със свой, за да не влияе на другите. */
async function nuovoUtente(
  ruolo = "OPERATORE",
): Promise<{ id: string; email: string }> {
  const email = `${unico("utente").toLowerCase()}@test.local`;
  const { status, dati } = await master.post<{ id: string }>("/api/utenti", {
    email,
    password: PASSWORD,
    nome: "Prova",
    cognome: "Utente",
    ruolo,
  });
  assert.equal(status, 201);
  return { id: dati.id, email };
}

describe("блокада при поредни неуспехи", () => {
  test("петият грешен опит заключва акаунта", async () => {
    const u = await nuovoUtente();
    const s = new Sessione();
    for (let i = 1; i <= 4; i++) {
      const { status, dati } = await s.post<{ error: string }>(
        "/api/auth/login",
        {
          email: u.email,
          password: "grешна-парола",
        },
      );
      assert.equal(status, 401, `опит ${i}`);
      assert.match(
        dati.error,
        /Tentativi rimasti: \d/,
        "трябва да показва оставащите опити",
      );
    }
    const quinto = await s.post<{ error: string }>("/api/auth/login", {
      email: u.email,
      password: "grешна-парола",
    });
    assert.equal(quinto.status, 423, "петият опит заключва");
    assert.match(quinto.dati.error, /bloccato/i);

    // дори с ПРАВИЛНАТА парола вече не се влиза
    const conParola = await s.post("/api/auth/login", {
      email: u.email,
      password: PASSWORD,
    });
    assert.equal(conParola.status, 423, "блокадата важи и за верните данни");
  });

  test("успешен вход нулира брояча", async () => {
    const u = await nuovoUtente();
    const s = new Sessione();
    for (let i = 0; i < 3; i++) {
      await s.post("/api/auth/login", { email: u.email, password: "грешна" });
    }
    assert.equal(await s.entra(u.email), 200);

    // след нулиране пак имаме пълните 5 опита: четири грешни не бива да заключат
    const s2 = new Sessione();
    for (let i = 0; i < 4; i++) {
      const { status } = await s2.post("/api/auth/login", {
        email: u.email,
        password: "грешна",
      });
      assert.equal(
        status,
        401,
        "броячът е бил нулиран, значи още не заключваме",
      );
    }
  });

  test("непознат имейл дава СЪЩИЯ отговор като грешна парола — и при блокадата", async () => {
    // Преди непознатият имейл получаваше голото „Credenziali non valide", а
    // истинският — „…Tentativi rimasti: 4": тялото казваше кой акаунт
    // съществува. Сега и двата вървят по една и съща стълба до 423.
    const u = await nuovoUtente();
    const ignoto = `${unico("ignoto").toLowerCase()}@test.local`;
    const risposte = async (email: string) => {
      const out: string[] = [];
      for (let i = 0; i < 6; i++) {
        const r = await new Sessione().post<{ error: string }>(
          "/api/auth/login",
          { email, password: "sbagliata-di-proposito" },
        );
        out.push(`${r.status} ${r.dati.error}`);
      }
      return out;
    };
    const vero = await risposte(u.email);
    const finto = await risposte(ignoto);
    assert.deepEqual(finto, vero, "la risposta distingue gli account");
    assert.match(
      vero[0],
      /^401 Credenziali non valide\. Tentativi rimasti: 4$/,
    );
    assert.match(vero[4], /^423 /);
  });

  test("регистърът на имейла не дава отделен брояч", async () => {
    const u = await nuovoUtente();
    const r = await new Sessione().post<{ error: string }>("/api/auth/login", {
      email: `  ${u.email.toUpperCase()}  `,
      password: "sbagliata-di-proposito",
    });
    const r2 = await new Sessione().post<{ error: string }>("/api/auth/login", {
      email: u.email,
      password: "sbagliata-di-proposito",
    });
    // Същият акаунт: вторият опит вижда брояча от първия.
    assert.match(r.dati.error, /Tentativi rimasti: 4$/);
    assert.match(r2.dati.error, /Tentativi rimasti: 3$/);
  });
});

describe("сесия", () => {
  test("изходът прави refresh token-а неизползваем", async () => {
    const u = await nuovoUtente();
    const s = new Sessione();
    assert.equal(await s.entra(u.email), 200);
    assert.equal((await s.get("/api/me")).status, 200);

    assert.equal((await s.post("/api/auth/logout")).status, 200);
    assert.equal(
      (await s.get("/api/me")).status,
      401,
      "сесията трябва да е прекратена",
    );
    assert.equal(
      (await s.post("/api/auth/refresh")).status,
      401,
      "изтритият refresh token не бива да подновява",
    );
  });

  test("подновяването ротира token-а — старият вече не важи", async () => {
    const u = await nuovoUtente();
    const s = new Sessione();
    await s.entra(u.email);

    // копие на сесията със СТАРИЯ refresh cookie
    const vecchia = new Sessione();
    Object.assign(vecchia, {
      cookies: new Map(
        (s as unknown as { cookies: Map<string, string> }).cookies,
      ),
    });

    assert.equal(
      (await s.post("/api/auth/refresh")).status,
      200,
      "подновяването минава",
    );
    // В прозореца за паралелни табове старият токен НЕ дава нови бисквитки.
    const subito = await vecchia.post<{ giaRinnovata?: boolean }>(
      "/api/auth/refresh",
    );
    assert.equal(subito.status, 200);
    assert.equal(subito.dati.giaRinnovata, true);

    // След прозореца (в пакета е 1,5 s) повторната употреба е КРАЖБА: сесията
    // пада изцяло — и за законния клиент, който държи новия токен.
    await new Promise((r) => setTimeout(r, 1_700));
    assert.equal(
      (await vecchia.post("/api/auth/refresh")).status,
      401,
      "старият refresh token трябва да е обезсилен от ротацията",
    );
    assert.equal(
      (await s.post("/api/auth/refresh")).status,
      401,
      "riuso del token: la sessione doveva essere revocata",
    );
    assert.equal((await s.get("/api/me")).status, 401);
  });

  test("деактивиран потребител губи достъп веднага, без да чака изтичане", async () => {
    const u = await nuovoUtente();
    const s = new Sessione();
    await s.entra(u.email);
    assert.equal((await s.get("/api/impianti")).status, 200);

    await master.put(`/api/utenti/${u.id}`, { attivo: false });

    const dopo = await s.get("/api/impianti");
    assert.equal(
      dopo.status,
      401,
      "access token-ът не бива да преживява деактивирането",
    );
  });

  test("понижена роля важи веднага върху издадения token", async () => {
    const u = await nuovoUtente("DIREZIONE");
    const s = new Sessione();
    await s.entra(u.email);
    assert.equal(
      (await s.get("/api/fatture")).status,
      200,
      "DIREZIONE вижда фактурите",
    );

    await master.put(`/api/utenti/${u.id}`, { ruolo: "OPERATORE" });

    assert.equal(
      (await s.get("/api/fatture")).status,
      403,
      "след понижаването достъпът трябва да падне веднага",
    );
  });
});
