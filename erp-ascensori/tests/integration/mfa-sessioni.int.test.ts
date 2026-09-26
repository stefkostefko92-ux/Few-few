// Втори фактор, активни сесии и политика за паролите.

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { comeRuolo, Sessione, PASSWORD, unico } from "./_client";
import { codice as codiceTotp } from "../../src/lib/totp";

let master: Sessione;

before(async () => {
  master = await comeRuolo("MASTER");
});

/** Създава потребител с известна парола и връща влязла сесия. */
async function nuovoUtente(ruolo = "OPERATORE") {
  const email = `${unico("mfa").toLowerCase()}@test.local`;
  const r = await master.post<{ id: string }>("/api/utenti", {
    email,
    password: PASSWORD,
    nome: "Utente",
    cognome: "Prova",
    ruolo,
  });
  assert.equal(r.status, 201, JSON.stringify(r.dati));
  const s = new Sessione();
  assert.equal(await s.entra(email), 200);
  return { id: r.dati.id, email, sessione: s };
}

describe("политика за паролите", () => {
  test("къса парола се отказва", async () => {
    const r = await master.post("/api/utenti", {
      email: `${unico("corta").toLowerCase()}@test.local`,
      password: "Corta1!",
      nome: "A",
      cognome: "B",
    });
    assert.equal(r.status, 400);
  });

  test("паролата не може да съдържа собственото име", async () => {
    const r = await master.post("/api/utenti", {
      email: `${unico("nome").toLowerCase()}@test.local`,
      password: "Bianchialessandro1",
      nome: "Alessandro",
      cognome: "Bianchi",
    });
    assert.equal(r.status, 400);
  });

  test("привилегированата роля иска по-дълга парола", async () => {
    const corta = "abcdefghijklm"; // 13 — стига за OPERATORE, не за ADMIN
    const email = `${unico("priv").toLowerCase()}@test.local`;
    const admin = await master.post("/api/utenti", {
      email,
      password: corta,
      nome: "Priv",
      cognome: "Test",
      ruolo: "ADMIN",
    });
    assert.equal(admin.status, 400);

    const oper = await master.post("/api/utenti", {
      email: `${unico("oper").toLowerCase()}@test.local`,
      password: corta,
      nome: "Oper",
      cognome: "Test",
      ruolo: "OPERATORE",
    });
    assert.equal(oper.status, 201);
  });
});

describe("втори фактор", () => {
  test("подготовка, включване и вход с код", async () => {
    const u = await nuovoUtente();

    const setup = await u.sessione.get<{
      segreto: string;
      uri: string;
      attivo: boolean;
    }>("/api/auth/mfa");
    assert.equal(setup.status, 200);
    assert.equal(setup.dati.attivo, false);
    assert.match(setup.dati.uri, /^otpauth:\/\/totp\//);

    // Грешен код не включва втория фактор.
    const male = await u.sessione.post("/api/auth/mfa", { codice: "000000" });
    assert.equal(male.status === 400 || male.status === 200, true);
    if (male.status === 200) return; // 000000 случайно е верният код

    // Точно този код, не преизчислен: на границата на стъпката новото
    // изчисление би дало кода на СЛЕДВАЩАТА стъпка — тоест не повторение.
    const codiceAttivazione = codiceTotp(setup.dati.segreto);
    const attiva = await u.sessione.post<{ codiciRecupero: string[] }>(
      "/api/auth/mfa",
      {
        codice: codiceAttivazione,
      },
    );
    assert.equal(attiva.status, 200, JSON.stringify(attiva.dati));
    assert.equal(attiva.dati.codiciRecupero.length, 8);

    // Вход без код вече дава 428 — интерфейсът показва полето.
    const senza = new Sessione();
    assert.equal(await senza.entra(u.email), 428);

    // Кодът за включване е ИЗРАЗХОДВАН: същият код не отваря и вход.
    const stesso = new Sessione();
    const ripetuto = await stesso.richiesta("POST", "/api/auth/login", {
      email: u.email,
      password: PASSWORD,
      codice: codiceAttivazione,
    });
    assert.equal(ripetuto.status, 401, "codice riutilizzato accettato");

    // Кодът на СЛЕДВАЩАТА стъпка (в прозореца ±1) минава — веднъж.
    const successivo = codiceTotp(setup.dati.segreto, Date.now() + 30_000);
    const con = new Sessione();
    const r = await con.richiesta("POST", "/api/auth/login", {
      email: u.email,
      password: PASSWORD,
      codice: successivo,
    });
    assert.equal(r.status, 200);
    const ancora = await new Sessione().richiesta("POST", "/api/auth/login", {
      email: u.email,
      password: PASSWORD,
      codice: successivo,
    });
    assert.equal(ancora.status, 401, "stesso codice accettato due volte");
  });

  test("грешни кодове на втория фактор ЗАКЛЮЧВАТ акаунта като грешна парола", async () => {
    // Находка на червения екип: грешният код само увеличаваше брояча и НИКОГА
    // не записваше блокада — щом паролата е известна, 6-цифреният код се
    // налучкваше без край.
    const u = await nuovoUtente();
    const setup = await u.sessione.get<{ segreto: string }>("/api/auth/mfa");
    const attiva = await u.sessione.post("/api/auth/mfa", {
      codice: codiceTotp(setup.dati.segreto),
    });
    assert.equal(attiva.status, 200);
    const giusto = codiceTotp(setup.dati.segreto, Date.now() + 30_000);
    const sbagliato = giusto === "123456" ? "654321" : "123456";

    const stati: number[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await new Sessione().richiesta("POST", "/api/auth/login", {
        email: u.email,
        password: PASSWORD,
        codice: sbagliato,
      });
      stati.push(r.status);
    }
    assert.deepEqual(stati, [401, 401, 401, 401, 423]);
    // Блокиран: и верният код вече не отваря.
    const dopo = await new Sessione().richiesta("POST", "/api/auth/login", {
      email: u.email,
      password: PASSWORD,
      codice: giusto,
    });
    assert.equal(dopo.status, 423);
  });

  test("резервният код работи ВЕДНЪЖ", async () => {
    const u = await nuovoUtente();
    const setup = await u.sessione.get<{ segreto: string }>("/api/auth/mfa");
    const attiva = await u.sessione.post<{ codiciRecupero: string[] }>(
      "/api/auth/mfa",
      {
        codice: codiceTotp(setup.dati.segreto),
      },
    );
    assert.equal(attiva.status, 200);
    const recupero = attiva.dati.codiciRecupero[0];

    const primo = new Sessione();
    assert.equal(
      (
        await primo.richiesta("POST", "/api/auth/login", {
          email: u.email,
          password: PASSWORD,
          codice: recupero,
        })
      ).status,
      200,
    );

    // Същият код втори път е безполезен — това е разликата спрямо втора парола.
    const secondo = new Sessione();
    assert.equal(
      (
        await secondo.richiesta("POST", "/api/auth/login", {
          email: u.email,
          password: PASSWORD,
          codice: recupero,
        })
      ).status,
      401,
    );
  });

  test("ADMIN не може да си изключи задължителния втори фактор", async () => {
    const u = await nuovoUtente("ADMIN");
    const setup = await u.sessione.get<{ segreto: string }>("/api/auth/mfa");
    await u.sessione.post("/api/auth/mfa", {
      codice: codiceTotp(setup.dati.segreto),
    });

    const off = await u.sessione.richiesta("DELETE", "/api/auth/mfa", {
      password: PASSWORD,
    });
    assert.equal(off.status, 403);
  });

  test("незадължителният се изключва с парола; тази сесия остава, другите падат", async () => {
    const u = await nuovoUtente("OPERATORE");
    const altra = new Sessione();
    assert.equal(await altra.entra(u.email), 200);
    const setup = await u.sessione.get<{ segreto: string }>("/api/auth/mfa");
    await u.sessione.post("/api/auth/mfa", {
      codice: codiceTotp(setup.dati.segreto),
    });
    // Грешна парола — 403, НЕ 401 (401 би изхвърлил човека към входа).
    const male = await u.sessione.richiesta("DELETE", "/api/auth/mfa", {
      password: "Sbagliata!2026x",
    });
    assert.equal(male.status, 403);
    const off = await u.sessione.richiesta("DELETE", "/api/auth/mfa", {
      password: PASSWORD,
    });
    assert.equal(off.status, 200, JSON.stringify(off.dati));
    assert.equal((await u.sessione.get("/api/me")).status, 200, "тази остава");
    assert.equal((await altra.get("/api/me")).status, 401, "другите падат");
  });
});

describe("активни сесии", () => {
  test("всеки вход отваря СВОЯ сесия и не сваля другите", async () => {
    const u = await nuovoUtente();
    const secondo = new Sessione();
    assert.equal(await secondo.entra(u.email), 200);

    // Първата сесия трябва да е още жива — досега вторият вход я изхвърляше.
    const me = await u.sessione.get("/api/me");
    assert.equal(me.status, 200);

    const lista = await u.sessione.get<{ righe: { id: string }[] }>(
      "/api/sessioni",
    );
    assert.equal(lista.status, 200);
    assert.ok(lista.dati.righe.length >= 2, "втората сесия не е записана");
  });

  test("списъкът НЕ издава отпечатъка на токена", async () => {
    const u = await nuovoUtente();
    const lista = await u.sessione.get<{ righe: Record<string, unknown>[] }>(
      "/api/sessioni",
    );
    for (const r of lista.dati.righe)
      assert.equal("tokenHash" in r, false, "хешът на токена излиза навън");
  });

  test("прекратяване на всички сесии", async () => {
    const u = await nuovoUtente();
    const secondo = new Sessione();
    await secondo.entra(u.email);

    const r = await u.sessione.richiesta("DELETE", "/api/sessioni");
    assert.equal(r.status, 200);

    // Подновяването на другото устройство вече не минава.
    const rinnovo = await secondo.richiesta("POST", "/api/auth/refresh");
    assert.equal(rinnovo.status, 401);
  });

  test("чужда сесия не се прекратява с познат идентификатор", async () => {
    const a = await nuovoUtente();
    const b = await nuovoUtente();
    const listaB = await b.sessione.get<{ righe: { id: string }[] }>(
      "/api/sessioni",
    );
    const idB = listaB.dati.righe[0].id;

    const r = await a.sessione.richiesta("DELETE", `/api/sessioni/${idB}`);
    assert.equal(r.status, 404);
  });

  test("смяната на парола сваля всички устройства", async () => {
    const u = await nuovoUtente();
    const nuovaPwd = "TrentaTreTrentini!2026";
    assert.equal(
      (
        await master.post(`/api/utenti/${u.id}/password`, {
          password: nuovaPwd,
        })
      ).status,
      200,
    );
    const rinnovo = await u.sessione.richiesta("POST", "/api/auth/refresh");
    assert.equal(rinnovo.status, 401);
  });

  test("всеки сменя СОБСТВЕНАТА си парола; тази сесия остава, другите падат", async () => {
    const u = await nuovoUtente("TECNICO");
    const altra = new Sessione();
    assert.equal(await altra.entra(u.email), 200);
    const nuova = "scala mobile al terzo piano";
    // Грешна текуща — 403 (не 401, който би изхвърлил към входа).
    const male = await u.sessione.post("/api/me/password", {
      attuale: "Sbagliata!2026x",
      nuova,
    });
    assert.equal(male.status, 403);
    // Същата като текущата — отказ.
    assert.equal(
      (
        await u.sessione.post("/api/me/password", {
          attuale: PASSWORD,
          nuova: PASSWORD,
        })
      ).status,
      400,
    );
    // Политиката важи и тук.
    assert.equal(
      (
        await u.sessione.post("/api/me/password", {
          attuale: PASSWORD,
          nuova: "Corta1!",
        })
      ).status,
      400,
    );
    const r = await u.sessione.post("/api/me/password", {
      attuale: PASSWORD,
      nuova,
    });
    assert.equal(r.status, 200, JSON.stringify(r.dati));
    assert.equal((await u.sessione.get("/api/me")).status, 200, "тази остава");
    assert.equal((await altra.get("/api/me")).status, 401, "другите падат");
    const nuovoAccesso = new Sessione();
    assert.equal(await nuovoAccesso.entra(u.email, nuova), 200);
    const me = await nuovoAccesso.get<{ passwordScaduta: boolean }>("/api/me");
    assert.equal(me.dati.passwordScaduta, false);
  });
});

test("политиката важи и при нулиране на парола от администратор", async () => {
  const u = await nuovoUtente();
  // Къса — отказва се.
  assert.equal(
    (await master.post(`/api/utenti/${u.id}/password`, { password: "Corta1!" }))
      .status,
    400,
  );
  // Съдържаща собственото име — също.
  assert.equal(
    (
      await master.post(`/api/utenti/${u.id}/password`, {
        password: "utenteprova2026",
      })
    ).status,
    400,
  );
  // Валидна — минава.
  assert.equal(
    (
      await master.post(`/api/utenti/${u.id}/password`, {
        password: "collina tranquilla 26",
      })
    ).status,
    200,
  );
});
