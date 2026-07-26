// Втората линия на защитата — тази, която трябва да важи и когато приложението
// сгреши.
//
//   • RLS: обхватът се налага от САМАТА база. Тестът заобикаля целия приложен
//     слой (сурова заявка без `filtroTenant`) и пак не вижда чужди редове.
//   • Верижен подпис на одита: изваденото звено се вижда. Дотогава подписът
//     ловеше ПРОМЯНА на ред, но не и ИЗТРИВАНЕ.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { comeRuolo, Sessione, PASSWORD, unico } from "./_client";
import { prisma } from "../../src/lib/prisma";
import { rlsAttiva, OBHVAT_TUTTI } from "../../src/lib/rls";

let master: Sessione;
let aziendaA: { sessione: Sessione; tenantId: string };
let aziendaB: { sessione: Sessione; tenantId: string };

async function creaAzienda(etichetta: string) {
  const slug = unico(etichetta)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-");
  const t = await master.post<{ id: string }>("/api/tenants", {
    slug,
    ragioneSociale: `Azienda ${etichetta}`,
    email: `${slug}@test.local`,
  });
  assert.equal(t.status, 201, JSON.stringify(t.dati));
  const email = `${slug}-admin@test.local`;
  assert.equal(
    (
      await master.post("/api/utenti", {
        email,
        password: PASSWORD,
        nome: "Admin",
        cognome: etichetta,
        ruolo: "ADMIN",
        tenantId: t.dati.id,
      })
    ).status,
    201,
  );
  const sessione = new Sessione();
  assert.equal(await sessione.entra(email), 200);
  return { sessione, tenantId: t.dati.id };
}

/** Брои редове в даден обхват, БЕЗ приложен филтър — само това, което базата пуска. */
async function conteggioNelloScope(
  scope: string,
  tenantIdCercato: string,
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${scope}, true)`;
    const r = await tx.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM condomini WHERE "tenantId" = ${tenantIdCercato}::uuid
    `;
    return Number(r[0].n);
  });
}

before(async () => {
  master = await comeRuolo("MASTER");
  aziendaA = await creaAzienda("rls-a");
  aziendaB = await creaAzienda("rls-b");
});

after(async () => {
  await prisma.$disconnect();
});

describe("Row-Level Security", () => {
  test("политиките са налице и ролята НЕ е суперпотребител", async () => {
    const r = await rlsAttiva();
    assert.equal(
      r.attiva,
      true,
      `RLS не е активна: ${r.motivo ?? "?"}.\n` +
        "Пакетът трябва да върви с ОБИКНОВЕНА роля, не с bootstrap потребителя на\n" +
        "Postgres: суперпотребителят заобикаля политиките безусловно, а Postgres\n" +
        "отказва да понижи именно bootstrap-а. Създай отделна роля:\n" +
        "  CREATE ROLE erp LOGIN PASSWORD '…' NOSUPERUSER CREATEDB;\n" +
        "Същото прави `deploy/postgres-init/` при клиента.",
    );
  });

  test("сурова заявка без приложен филтър не вижда чужди редове", async () => {
    const creato = await aziendaB.sessione.post<{ id: string }>(
      "/api/condomini",
      {
        nome: unico("CondRls"),
        indirizzo: "Via B 1",
        citta: "Roma",
      },
    );
    assert.equal(creato.status, 201, JSON.stringify(creato.dati));

    // Точно този SQL би изтекъл данни, ако изолацията беше само приложна:
    // няма `filtroTenant`, търси се ПРЯКО по чуждия tenantId.
    assert.equal(
      await conteggioNelloScope(aziendaA.tenantId, aziendaB.tenantId),
      0,
      "базата пусна редове на друга фирма",
    );
    // Контрола: в собствения обхват редът се вижда — политиката не скрива всичко.
    assert.ok(
      (await conteggioNelloScope(aziendaB.tenantId, aziendaB.tenantId)) >= 1,
      "политиката скри и собствените редове",
    );
    // Нивото на доставчика вижда всичко — съзнателната вратичка.
    assert.ok(
      (await conteggioNelloScope(OBHVAT_TUTTI, aziendaB.tenantId)) >= 1,
    );
  });

  test("непознат обхват не вижда нищо", async () => {
    assert.equal(
      await conteggioNelloScope(
        "00000000-0000-0000-0000-000000000000",
        aziendaB.tenantId,
      ),
      0,
    );
  });
});

describe("верижен подпис на одита", () => {
  test("непокътнатият одит се проверява като цял", async () => {
    // Три действия → три звена от веригата.
    for (let i = 0; i < 3; i++)
      assert.equal(
        (
          await aziendaA.sessione.post("/api/condomini", {
            nome: unico("CondCat"),
            indirizzo: `Via A ${i}`,
            citta: "Milano",
          })
        ).status,
        201,
      );

    const v = await aziendaA.sessione.post<{
      controllate: number;
      corrotte: string[];
      catenaRotta: string[];
      integro: boolean;
    }>("/api/audit/verifica", {});
    assert.equal(v.status, 200, JSON.stringify(v.dati));
    assert.ok(v.dati.controllate >= 3);
    assert.deepEqual(v.dati.corrotte, []);
    assert.deepEqual(v.dati.catenaRotta, []);
    assert.equal(v.dati.integro, true);
  });

  test("ИЗТРИТ ред къса веригата и се вижда", async () => {
    for (let i = 0; i < 3; i++)
      assert.equal(
        (
          await aziendaB.sessione.post("/api/condomini", {
            nome: unico("CondDel"),
            indirizzo: `Via B ${i}`,
            citta: "Torino",
          })
        ).status,
        201,
      );

    // Изтриваме СРЕДНОТО звено директно в базата — маршрут за това не съществува.
    const righe = await prisma.auditLog.findMany({
      where: { tenantId: aziendaB.tenantId },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { id: true },
    });
    assert.equal(righe.length, 3);
    await prisma.auditLog.delete({ where: { id: righe[1].id } });

    const v = await aziendaB.sessione.post<{
      catenaRotta: string[];
      corrotte: string[];
      integro: boolean;
    }>("/api/audit/verifica", {});
    assert.equal(v.status, 200);
    // Собственият подпис на всеки ОСТАНАЛ ред е още верен — точно затова
    // веригата е нужна: без нея липсата остава невидима.
    assert.deepEqual(v.dati.corrotte, []);
    assert.ok(v.dati.catenaRotta.length >= 1, "изтритият ред не се видя");
    assert.equal(v.dati.integro, false);
  });
});
