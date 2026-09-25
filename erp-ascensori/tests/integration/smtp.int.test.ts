// SMTP разговорът срещу фалшиво реле — `node:net` + `node:tls`, без мрежа.
//
// ЗАЩО ТУК, А НЕ В ПАКЕТА ЗА ЧИСТА ЛОГИКА. `src/lib/posta/smtp.ts` говори със
// сокет; чистата част (адреси, заглавия, тяло) е в `messaggio.ts` и има свой
// тест. До този файл `invia()` нямаше тест на НИТО ЕДИН слой — и точно в нея
// беше увисването: таймерът на вече приключила стъпка нулираше чакането на
// следващата и процесът висеше без край, а с него и сроковете в 06:00.
//
// Релето е скриптирано: всеки тест казва кога да мълчи, какво да откаже, как
// да накъса отговорите. Записва какво е видяло ПРЕДИ и СЛЕД TLS — така се
// доказва, че паролата не тръгва по открита връзка, а не само че функцията
// „не гърми".

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { invia } from "../../src/lib/posta/smtp";
import { ErrorePosta, type ConfigSmtp } from "../../src/lib/posta/messaggio";
import {
  avviaRelay,
  certificatoDiProva,
  entro,
  type Certificato,
  type Copione,
} from "./_relay";

let cert: Certificato;
before(() => {
  cert = certificatoDiProva();
});
after(() => cert.elimina());

const avvia = (c: Copione) => avviaRelay(c, cert);

function config(porta: number, extra: Partial<ConfigSmtp> = {}): ConfigSmtp {
  return {
    host: "localhost",
    porta,
    tlsDiretto: false,
    utente: "gestionale@example.it",
    password: "segreto-di-prova",
    mittente: "gestionale@example.it",
    nomeMittente: "ERP Ascensori",
    timeoutMs: 2_000,
    ca: cert.certificato,
    ...extra,
  };
}

const MESSAGGIO = {
  a: "tecnico@example.it",
  oggetto: "Scadenza fra 30 giorni — impianto MI-4471",
  testo: "Impianto MI-4471\nScadenza: 01/06/2026",
};

// Таван на всеки тест: регресия в таймерите се проявява като УВИСВАНЕ, не като
// грешка — без тавана CI би чакал до тавана на задачата. Проверено: срещу
// старата логика тест 9 виси, докато външният процес не бъде убит.
describe("SMTP срещу фалшиво реле", { timeout: 8_000 }, () => {
  test("587 + STARTTLS: паролата тръгва САМО след шифроването", async () => {
    const r = await avvia({ starttls: true });
    try {
      await entro(invia(config(r.porta), MESSAGGIO), 5_000);
      // По открита връзка: само поздрав, EHLO и STARTTLS. Нищо повече.
      assert.deepEqual(
        r.visto.inChiaro.map((x) => x.split(" ")[0]),
        ["EHLO", "STARTTLS"],
      );
      assert.ok(r.visto.cifrati.some((x) => x.startsWith("AUTH LOGIN")));
      assert.equal(r.visto.utente, "gestionale@example.it");
      assert.equal(r.visto.password, "segreto-di-prova");
      assert.ok(r.visto.cifrati.includes("RCPT TO:<tecnico@example.it>"));
      // Тялото е base64 — декодирано е точно текстът.
      const b64 = r.visto.corpo.split("\n\n")[1] ?? "";
      assert.equal(
        Buffer.from(b64.replace(/\n/g, ""), "base64").toString("utf8"),
        MESSAGGIO.testo,
      );
      assert.equal(r.visto.cifrati[r.visto.cifrati.length - 1], "QUIT");
    } finally {
      r.chiudi();
    }
  });

  test("465 неявен TLS: целият разговор е шифрован", async () => {
    const r = await avvia({ tlsDiretto: true });
    try {
      await entro(
        invia(config(r.porta, { tlsDiretto: true }), MESSAGGIO),
        5_000,
      );
      assert.deepEqual(r.visto.inChiaro, []);
      assert.equal(r.visto.password, "segreto-di-prova");
    } finally {
      r.chiudi();
    }
  });

  test("реле без STARTTLS: отказ ПРЕДИ паролата, и то окончателен", async () => {
    const r = await avvia({ starttls: false });
    try {
      await assert.rejects(
        () => entro(invia(config(r.porta), MESSAGGIO), 5_000),
        (e: unknown) => e instanceof ErrorePosta && e.transitorio === false,
      );
      assert.ok(!r.visto.inChiaro.some((x) => x.startsWith("AUTH")));
      assert.ok(!r.visto.inChiaro.some((x) => x.startsWith("MAIL")));
    } finally {
      r.chiudi();
    }
  });

  test("4xx е преходна грешка — опашката ще опита пак", async () => {
    const r = await avvia({ starttls: true, rcpt: "450 casella occupata" });
    try {
      await assert.rejects(
        () => entro(invia(config(r.porta), MESSAGGIO), 5_000),
        (e: unknown) =>
          e instanceof ErrorePosta && e.codice === 450 && e.transitorio,
      );
    } finally {
      r.chiudi();
    }
  });

  test("5xx е окончателна — пет опита към сгрешен адрес са пет пъти същото", async () => {
    const r = await avvia({ starttls: true, rcpt: "550 utente sconosciuto" });
    try {
      await assert.rejects(
        () => entro(invia(config(r.porta), MESSAGGIO), 5_000),
        (e: unknown) =>
          e instanceof ErrorePosta && e.codice === 550 && !e.transitorio,
      );
    } finally {
      r.chiudi();
    }
  });

  test("отговори, накъсани насред реда, и многоредов EHLO на парчета", async () => {
    const r = await avvia({ starttls: true, spezza: true });
    try {
      await entro(invia(config(r.porta), MESSAGGIO), 5_000);
      assert.ok(r.visto.cifrati.includes("QUIT"));
    } finally {
      r.chiudi();
    }
  });

  test("мъртво реле: отказ в рамките на таймаута, не увисване", async () => {
    const r = await avvia({ starttls: true, silenzioDopo: "MAIL" });
    const inizio = Date.now();
    try {
      await assert.rejects(
        () =>
          entro(invia(config(r.porta, { timeoutMs: 300 }), MESSAGGIO), 3_000),
        /timeout/,
      );
      assert.ok(Date.now() - inizio < 3_000, "invia не спази таймаута си");
    } finally {
      r.chiudi();
    }
  });

  test("затворена връзка отказва ВЕДНАГА, не след таймаута", async () => {
    const r = await avvia({ starttls: true, chiudiDopo: "MAIL" });
    const inizio = Date.now();
    try {
      await assert.rejects(() =>
        entro(invia(config(r.porta, { timeoutMs: 5_000 }), MESSAGGIO), 3_000),
      );
      assert.ok(
        Date.now() - inizio < 2_000,
        "чакаше таймаута вместо да откаже",
      );
    } finally {
      r.chiudi();
    }
  });

  // РЕГРЕСИОНЕН ТЕСТ ЗА УВИСВАНЕТО. Таймаут T. MAIL FROM отговаря веднага —
  // таймерът му би изтекъл в T. RCPT отговаря след 0,7·T, DATA — след още
  // 0,5·T, тоест в 1,2·T. Остарелият таймер на MAIL FROM изтича в T, докато
  // DATA чака: старият код нулираше чакането на DATA и `invia` висеше завинаги.
  // Всяка отделна стъпка е ПОД своя таймаут — значи правилният резултат е успех.
  test("бавни, но живи стъпки не се прекъсват от таймера на предишна", async () => {
    const T = 400;
    const r = await avvia({
      starttls: true,
      ritardi: { RCPT: Math.round(0.7 * T), DATA: Math.round(0.5 * T) },
    });
    try {
      await entro(invia(config(r.porta, { timeoutMs: T }), MESSAGGIO), 3_000);
      assert.ok(r.visto.cifrati.includes("QUIT"));
    } finally {
      r.chiudi();
    }
  });
});
