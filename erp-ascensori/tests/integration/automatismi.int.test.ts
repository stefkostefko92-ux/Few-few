// Следата на автоматизмите — форматът, който метриките и dead-man проверката четат.
//
// Петте автоматизма (scadenze, contratti, retention, webhook, notifiche) вече
// минават през ЕДНА функция (`eseguiTracciato`). Тук се заковава договорът ѝ:
// какъв ред остава при успех, какъв при грешка и че грешката стига до
// извикващия непроменена. Смяна на формата би оставила алармите слепи, без
// нито един червен тест другаде.

import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../../src/lib/prisma";
import { eseguiTracciato } from "../../src/lib/automatismi";

// Име, което никоя метрика не чете — редовете на теста не бива да минат за
// истински пуск на `scadenze` и да скрият спрял cron в друг файл.
const nome = `test-tracciato-${randomUUID().slice(0, 8)}`;

after(async () => {
  await prisma.automatismoRun.deleteMany({ where: { nome } });
  await prisma.$disconnect();
});

const ultimo = () =>
  prisma.automatismoRun.findFirstOrThrow({
    where: { nome },
    orderBy: { iniziatoAt: "desc" },
  });

describe("следата на автоматизмите", () => {
  test("успех: OK, продължителност, броячите в dettagli", async () => {
    const esito = await eseguiTracciato(
      nome,
      async () => ({ inviate: 3, fallite: 0 }),
      {
        logSuccesso: "completo",
      },
    );
    assert.deepEqual(esito, { inviate: 3, fallite: 0 });
    const r = await ultimo();
    assert.equal(r.esito, "OK");
    assert.ok(r.terminatoAt);
    assert.equal(typeof r.durataMs, "number");
    assert.deepEqual(r.dettagli, { inviate: 3, fallite: 0 });
    assert.equal(r.errore, null);
  });

  test("грешка: ERRORE, само тип и код, и СЪЩАТА грешка нагоре", async () => {
    const boom = Object.assign(
      new Error("indirizzo mario.rossi@example.it rifiutato"),
      {
        code: "P2002",
      },
    );
    await assert.rejects(
      () => eseguiTracciato(nome, async () => Promise.reject(boom)),
      (e: unknown) => e === boom,
    );
    const r = await ultimo();
    assert.equal(r.esito, "ERRORE");
    assert.ok(r.terminatoAt);
    // Съобщението НЕ влиза: то може да носи адрес или стойност.
    assert.equal(r.errore, "Error:P2002");
    assert.equal(r.dettagli, null);
  });
});
