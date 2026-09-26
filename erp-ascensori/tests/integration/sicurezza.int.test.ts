// Находките от прегледа за сигурност, които не са вход и не са изолация:
// отрязана опашка на одита, заявки от чужд сайт, паралелни плащания.
//
// Всеки тест работи в СОБСТВЕНА фирма, когато пипа базата пряко: пакетът
// върви паралелно, а отрязаната опашка на обща верига би счупила чужди тестове.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { comeRuolo, Sessione, BASE, PASSWORD, unico } from "./_client";
import { prisma } from "../../src/lib/prisma";

let master: Sessione;

after(() => prisma.$disconnect());

before(async () => {
  master = await comeRuolo("MASTER");
});

async function nuovaAzienda(etichetta: string) {
  const slug = unico(etichetta)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-");
  const t = await master.post<{ id: string }>("/api/tenants", {
    slug,
    ragioneSociale: `Azienda ${etichetta}`,
    email: `${slug}@test.local`,
  });
  assert.equal(t.status, 201);
  const email = `${slug}-admin@test.local`;
  const u = await master.post("/api/utenti", {
    email,
    password: PASSWORD,
    nome: "Admin",
    cognome: etichetta,
    ruolo: "ADMIN",
    tenantId: t.dati.id,
  });
  assert.equal(u.status, 201);
  const sessione = new Sessione();
  assert.equal(await sessione.entra(email), 200);
  return { id: t.dati.id, sessione };
}

describe("котвата на одита", () => {
  test("изтритите ПОСЛЕДНИ редове се виждат — веригата сама не ги лови", async () => {
    const a = await nuovaAzienda("coda");
    for (let i = 0; i < 3; i++)
      assert.equal(
        (
          await a.sessione.post("/api/condomini", {
            nome: unico("CondCoda"),
            indirizzo: "Via Coda 1",
            citta: "Milano",
          })
        ).status,
        201,
      );

    const prima = await a.sessione.post<{
      integro: boolean;
      codaTroncata: string[];
    }>("/api/audit/verifica", {});
    assert.equal(prima.status, 200);
    assert.equal(prima.dati.integro, true, JSON.stringify(prima.dati));

    // Някой с достъп до базата трие СЛЕДАТА на последните си действия.
    const ultimi = await prisma.auditLog.findMany({
      where: { tenantId: a.id },
      orderBy: { seq: "desc" },
      take: 2,
      select: { id: true },
    });
    await prisma.auditLog.deleteMany({
      where: { id: { in: ultimi.map((u) => u.id) } },
    });

    const dopo = await a.sessione.post<{
      integro: boolean;
      catenaRotta: string[];
      codaTroncata: string[];
    }>("/api/audit/verifica", {});
    assert.equal(dopo.status, 200);
    // Звената на останалите редове са цели — точно това прави опашката невидима
    // без котва.
    assert.deepEqual(dopo.dati.catenaRotta, []);
    assert.deepEqual(dopo.dati.codaTroncata, [a.id]);
    assert.equal(dopo.dati.integro, false);
  });

  test("подменена котва без ключа се хваща", async () => {
    const a = await nuovaAzienda("ancora");
    await a.sessione.post("/api/condomini", {
      nome: unico("CondAnc"),
      indirizzo: "Via Ancora 1",
      citta: "Milano",
    });
    // Котвата се връща към по-ранен ред — без ключа подписът не може да се
    // смени заедно с нея.
    const primo = await prisma.auditLog.findFirst({
      where: { tenantId: a.id },
      orderBy: { seq: "asc" },
      select: { seq: true, hmac: true },
    });
    assert.ok(primo);
    await prisma.auditAncora.update({
      where: { chiave: a.id },
      data: { seq: primo.seq, hmac: primo.hmac },
    });
    const v = await a.sessione.post<{
      integro: boolean;
      ancoraAlterata: string[];
    }>("/api/audit/verifica", {});
    assert.deepEqual(v.dati.ancoraAlterata, [a.id]);
    assert.equal(v.dati.integro, false);
  });
});

describe("заявки от чужд сайт", () => {
  test("браузърна заявка от друг сайт не стига до API-то", async () => {
    const s = await comeRuolo("DIREZIONE");
    for (const sito of ["cross-site", "same-site"]) {
      const r = await fetch(`${BASE}/api/me`, {
        headers: { Cookie: s.cookieHeader(), "Sec-Fetch-Site": sito },
      });
      assert.equal(r.status, 403, sito);
    }
    // Собственият интерфейс и адрес, въведен от човека, минават.
    for (const sito of ["same-origin", "none"]) {
      const r = await fetch(`${BASE}/api/me`, {
        headers: { Cookie: s.cookieHeader(), "Sec-Fetch-Site": sito },
      });
      assert.equal(r.status, 200, sito);
    }
  });
});

describe("плащания по една фактура", () => {
  test("две едновременни плащания се сумират и двете", async () => {
    // Находка от прегледа: при READ COMMITTED второто плащане записваше сбор,
    // който не вижда първото — напълно платена фактура оставаше „частично".
    const a = await nuovaAzienda("pag");
    const f = await a.sessione.post<{ id: string }>("/api/fatture", {
      tipo: "EMESSA",
    });
    assert.equal(f.status, 201, JSON.stringify(f.dati));
    const voce = await a.sessione.post(`/api/fatture/${f.dati.id}/voci`, {
      descrizione: "Canone",
      quantita: "1",
      prezzoUnitario: "100",
      aliquotaIva: "22",
    });
    assert.equal(voce.status, 201, JSON.stringify(voce.dati));
    const emessa = await a.sessione.patch(`/api/fatture/${f.dati.id}/stato`, {
      stato: "EMESSA",
    });
    assert.equal(emessa.status, 200, JSON.stringify(emessa.dati));

    const pagamenti = await Promise.all(
      Array.from({ length: 4 }, () =>
        a.sessione.post(`/api/fatture/${f.dati.id}/pagamenti`, {
          importo: "10",
          modalita: "MP05",
        }),
      ),
    );
    for (const p of pagamenti)
      assert.equal(p.status, 201, JSON.stringify(p.dati));
    const letta = await prisma.fattura.findUniqueOrThrow({
      where: { id: f.dati.id },
      select: { totalePagato: true },
    });
    assert.equal(Number(letta.totalePagato), 40);
  });
});
