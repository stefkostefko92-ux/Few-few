// Опашката от известия срещу реална база и фалшиво SMTP реле.
//
// Чистите тестове покриват шаблоните и отстъпа между опитите; тук се проверява
// това, което живее в базата: кой ред какво състояние получава след всеки вид
// отговор, и че два едновременни пуска (cron + ръчен) НЕ пращат едно писмо два
// пъти. Първата версия на `inviaInAttesa` четеше пакета с `findMany` и точно
// това правеше — без нито една грешка.
//
// ИЗОЛАЦИЯ. Файловете на пакета вървят паралелно и опашката е ОБЩА: пускът тук
// може да вземе и чужди чакащи редове (например от теста за идемпотентност).
// Затова всяка проверка гледа САМО своите редове — по фирма със случаен UUID
// (tenantId няма FK) и по адрес на получател, уникален за теста.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../../src/lib/prisma";
import { inviaInAttesa, accoda } from "../../src/lib/notifiche/coda";
import { MAX_TENTATIVI } from "../../src/lib/notifiche/modelli";
import type { ConfigSmtp } from "../../src/lib/posta/messaggio";
import {
  avviaRelay,
  certificatoDiProva,
  entro,
  type Certificato,
  type Copione,
} from "./_relay";

let cert: Certificato;
const tenantId = randomUUID();

before(() => {
  cert = certificatoDiProva();
});
after(async () => {
  cert.elimina();
  await prisma.notifica.deleteMany({ where: { tenantId } });
  await prisma.$disconnect();
});

function config(porta: number): ConfigSmtp {
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
  };
}

/** Записва N чакащи известия с уникални получатели и връща адресите им. */
async function inCoda(n: number, extra: { tentativi?: number } = {}) {
  const sigla = randomUUID().slice(0, 8);
  const destinatari = Array.from(
    { length: n },
    (_, i) => `coda-${sigla}-${i}@example.it`,
  );
  await prisma.notifica.createMany({
    data: destinatari.map((a) => ({
      tipo: "SCADENZA_IMPIANTO" as const,
      chiave: `test-coda:${sigla}`,
      destinatario: a,
      oggetto: "Impianto MI-0001 — scadenza verifica",
      corpo: "Impianto MI-0001\nScadenza: 01/06/2026",
      tentativi: extra.tentativi ?? 0,
      tenantId,
    })),
  });
  return destinatari;
}

const righe = (destinatari: string[]) =>
  prisma.notifica.findMany({
    where: { tenantId, destinatario: { in: destinatari } },
    orderBy: { destinatario: "asc" },
  });

async function conRelay<T>(
  c: Copione,
  fn: (r: Awaited<ReturnType<typeof avviaRelay>>) => Promise<T>,
): Promise<T> {
  const r = await avviaRelay({ starttls: true, ...c }, cert);
  try {
    return await fn(r);
  } finally {
    r.chiudi();
  }
}

describe("опашката от известия", { timeout: 30_000 }, () => {
  test("без SMTP: нищо не се пипа, флагът го казва", async () => {
    const dest = await inCoda(2);
    const esito = await inviaInAttesa(500, { config: null });
    assert.equal(esito.smtpAssente, true);
    assert.equal(esito.tentate, 0);
    for (const n of await righe(dest)) {
      assert.equal(n.stato, "IN_ATTESA");
      assert.equal(n.tentativi, 0);
    }
  });

  test("успех → INVIATA, с отбелязано време и изчистена грешка", async () => {
    const dest = await inCoda(2);
    await conRelay({}, (r) =>
      entro(inviaInAttesa(500, { config: config(r.porta) }), 20_000),
    );
    for (const n of await righe(dest)) {
      assert.equal(n.stato, "INVIATA");
      assert.equal(n.tentativi, 1);
      assert.ok(n.inviataAt);
      assert.equal(n.ultimoErrore, null);
    }
  });

  test("5xx → FALLITA веднага, без адреса на получателя в грешката", async () => {
    const dest = await inCoda(1);
    await conRelay(
      // Истинските релета връщат адреса в отговора — в базата не бива да влезе.
      { rcpt: `550 5.1.1 <${dest[0]}> utente sconosciuto` },
      (r) => entro(inviaInAttesa(500, { config: config(r.porta) }), 20_000),
    );
    const [n] = await righe(dest);
    assert.equal(n.stato, "FALLITA");
    assert.equal(n.tentativi, 1);
    assert.match(n.ultimoErrore ?? "", /^550:/);
    assert.ok(!(n.ultimoErrore ?? "").includes(dest[0]));
  });

  test("4xx → остава IN_ATTESA, опит +1, следващият — в бъдещето", async () => {
    const dest = await inCoda(1);
    const prima = Date.now();
    await conRelay({ rcpt: "450 casella occupata" }, (r) =>
      entro(inviaInAttesa(500, { config: config(r.porta) }), 20_000),
    );
    const [n] = await righe(dest);
    assert.equal(n.stato, "IN_ATTESA");
    assert.equal(n.tentativi, 1);
    assert.ok(n.prossimoTentativo.getTime() > prima + 60_000);
  });

  test("4xx на последния опит → FALLITA, не безкраен цикъл", async () => {
    const dest = await inCoda(1, { tentativi: MAX_TENTATIVI - 1 });
    await conRelay({ rcpt: "450 casella occupata" }, (r) =>
      entro(inviaInAttesa(500, { config: config(r.porta) }), 20_000),
    );
    const [n] = await righe(dest);
    assert.equal(n.stato, "FALLITA");
    assert.equal(n.tentativi, MAX_TENTATIVI);
  });

  // РЕГРЕСИОНЕН ТЕСТ ЗА ДВОЙНОТО ПРАЩАНЕ. Бавното реле държи всеки пуск по
  // средата на пращането достатъчно дълго, за да се застъпят. С `findMany`
  // двата пуска виждаха едни и същи редове и всеки получател получаваше писмото
  // ДВА пъти; с `FOR UPDATE SKIP LOCKED` + наем — точно веднъж.
  test("два едновременни пуска пращат всяко писмо ТОЧНО веднъж", async () => {
    const dest = await inCoda(6);
    await conRelay({ ritardi: { RCPT: 120 } }, async (r) => {
      const c = config(r.porta);
      const [a, b] = await entro(
        Promise.all([
          inviaInAttesa(500, { config: c }),
          inviaInAttesa(500, { config: c }),
        ]),
        25_000,
      );
      // И двата пуска реално са работили — иначе тестът не доказва нищо.
      assert.ok(a.tentate > 0 && b.tentate > 0, "un solo run ha lavorato");
      for (const d of dest) {
        const volte = r.visto.cifrati.filter(
          (x) => x === `RCPT TO:<${d}>`,
        ).length;
        assert.equal(volte, 1, `${d} ricevuto ${volte} volte`);
      }
    });
    for (const n of await righe(dest)) assert.equal(n.stato, "INVIATA");
  });

  test("accoda два пъти със същия ключ при tenantId NULL → един ред", async () => {
    // В еднофирмената инсталация tenantId е NULL на всеки ред. Преди
    // `NULLS NOT DISTINCT` уникалният индекс не отказваше нищо и `skipDuplicates`
    // нямаше какво да прескочи — вторият пуск записваше второ известие.
    const chiave = `test-coda-null:${randomUUID()}`;
    const destinatario = `null-${randomUUID().slice(0, 8)}@example.it`;
    const modello = {
      tipo: "SCADENZA_IMPIANTO" as const,
      chiave,
      oggetto: "Impianto MI-0002 — scadenza verifica",
      corpo: "Impianto MI-0002",
    };
    const imp = { attivi: true, destinatari: [destinatario] };
    try {
      assert.equal(await accoda([modello], null, imp), 1);
      assert.equal(await accoda([modello], null, imp), 0);
      assert.equal(
        await prisma.notifica.count({ where: { chiave, tenantId: null } }),
        1,
      );
    } finally {
      await prisma.notifica.deleteMany({ where: { chiave } });
    }
  });
});
