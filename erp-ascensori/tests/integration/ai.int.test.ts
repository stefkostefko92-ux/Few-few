// AI попълването през реалните маршрути.
//
// В тестовата среда доставчик НЕ е конфигуриран — и точно това е най-важното,
// което трябва да се провери: че изключената функция се държи прилично.
// Извикване към истински модел в CI би било бавно, платено и недетерминистично.

import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { comeRuolo, Sessione, BASE } from "./_client";

let operatore: Sessione;
let cliente: Sessione;

const PDF = new Uint8Array([
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a,
]);

before(async () => {
  operatore = await comeRuolo("OPERATORE");
  cliente = await comeRuolo("CLIENTE");
});

async function estrai(s: Sessione, dati: Uint8Array, modulo: string) {
  const form = new FormData();
  const buffer = new ArrayBuffer(dati.length);
  new Uint8Array(buffer).set(dati);
  form.set("file", new Blob([buffer]), "documento.pdf");
  form.set("modulo", modulo);
  const res = await fetch(`${BASE}/api/ai/estrai`, {
    method: "POST",
    headers: { Cookie: s.cookieHeader() },
    body: form,
  });
  return {
    status: res.status,
    dati: (await res.json().catch(() => ({}))) as Record<string, unknown>,
  };
}

describe("състояние на функцията", () => {
  test("казва дали е налична, без да издава ключа", async () => {
    const r = await operatore.get<{
      attiva: boolean;
      fornitore: string;
      moduli: Record<string, { titolo: string; documentoAtteso: string }>;
    }>("/api/ai/estrai");
    assert.equal(r.status, 200);
    assert.equal(typeof r.dati.attiva, "boolean");
    // Списъкът с модули е публичен за влезлите — от него интерфейсът решава
    // къде да покаже бутона.
    assert.ok(r.dati.moduli.condomini);
    assert.ok(r.dati.moduli.verifiche);
    // Ключът НЕ пътува навън при никакви обстоятелства.
    const corpo = JSON.stringify(r.dati);
    assert.equal(/AI_API_KEY|api[_-]?key|"chiave"/i.test(corpo), false);
  });

  test("непознат за системата модул не се обявява", async () => {
    const r = await operatore.get<{ moduli: Record<string, unknown> }>(
      "/api/ai/estrai",
    );
    assert.equal(r.dati.moduli.users, undefined);
    assert.equal(r.dati.moduli.audit_log, undefined);
  });

  test("без сесия няма нищо", async () => {
    const res = await fetch(`${BASE}/api/ai/estrai`);
    assert.equal(res.status, 401);
  });

  test("CLIENTE не чете документи — това е вътрешен инструмент", async () => {
    assert.equal((await cliente.get("/api/ai/estrai")).status, 403);
    assert.equal((await estrai(cliente, PDF, "condomini")).status, 403);
  });
});

describe("изключената функция се държи прилично", () => {
  test("отказва ЯСНО, вместо да гърми", async () => {
    const r = await estrai(operatore, PDF, "condomini");
    // 503, не 500: услугата липсва, заявката е разбрана.
    assert.equal(r.status, 503, JSON.stringify(r.dati));
    assert.match(String(r.dati.error), /AI_PROVIDER/);
  });

  test("проверките на входа СЕ ПРАВЯТ и когато е изключена", async () => {
    // Иначе включването на функцията утре би отворило дупки, които днес никой
    // не е тествал.
    assert.equal((await estrai(operatore, PDF, "users")).status, 503);
  });
});

describe("проверки на входа", () => {
  test("непознат модул се отказва", async () => {
    // Проверява се, че НЕ се приема свободно име: то би отишло в указанието.
    const r = await estrai(operatore, PDF, "../../etc/passwd");
    assert.ok(r.status === 400 || r.status === 503, `получено ${r.status}`);
  });

  test("липсващ файл се отказва", async () => {
    const form = new FormData();
    form.set("modulo", "condomini");
    const res = await fetch(`${BASE}/api/ai/estrai`, {
      method: "POST",
      headers: { Cookie: operatore.cookieHeader() },
      body: form,
    });
    assert.ok(res.status === 400 || res.status === 503);
  });
});
