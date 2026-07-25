// HMAC подпис на audit редовете: детерминизъм + откриване на манипулация.
import { test } from "node:test";
import assert from "node:assert/strict";
import { firmaAudit, verificaAudit, type RigaAudit } from "../audit-hmac";

const CHIAVE = "test-chiave-hmac-abbastanza-lunga-32+";
const riga: RigaAudit = {
  azione: "UPDATE",
  entita: "impianti",
  entitaId: "abc-123",
  dettagli: { prima: { stato: "ATTIVO" }, dopo: { stato: "FERMO" } },
  ip: "203.0.113.5",
  userAgent: "Mozilla/5.0",
  utenteId: "user-1",
  createdAt: new Date("2026-07-25T10:00:00.000Z"),
};

test("подписът е детерминистичен и се верифицира", () => {
  const h1 = firmaAudit(riga, CHIAVE);
  const h2 = firmaAudit(riga, CHIAVE);
  assert.equal(h1, h2);
  assert.equal(verificaAudit(riga, h1, CHIAVE), true);
});

test("промяна на което и да е поле чупи подписа", () => {
  const h = firmaAudit(riga, CHIAVE);
  assert.equal(verificaAudit({ ...riga, azione: "DELETE" }, h, CHIAVE), false);
  assert.equal(verificaAudit({ ...riga, entitaId: "xyz" }, h, CHIAVE), false);
  assert.equal(
    verificaAudit({ ...riga, dettagli: { prima: {}, dopo: {} } }, h, CHIAVE),
    false,
  );
  assert.equal(
    verificaAudit(
      { ...riga, createdAt: new Date("2026-07-25T10:00:01.000Z") },
      h,
      CHIAVE,
    ),
    false,
  );
  // ip/userAgent също са под подписа
  assert.equal(verificaAudit({ ...riga, ip: "10.0.0.1" }, h, CHIAVE), false);
  assert.equal(
    verificaAudit({ ...riga, userAgent: "curl/8" }, h, CHIAVE),
    false,
  );
});

test("грешен ключ не верифицира", () => {
  const h = firmaAudit(riga, CHIAVE);
  assert.equal(
    verificaAudit(riga, h, "chiave-sbagliata-ma-abbastanza-lunga"),
    false,
  );
});

test("невалиден hex не хвърля", () => {
  assert.equal(verificaAudit(riga, "не-hex", CHIAVE), false);
});

test("подписът е устойчив на пренареждане на ключовете (Postgres jsonb)", () => {
  // jsonb НЕ пази реда на вмъкване — прочетеният обект идва с друг ред.
  const scritto = {
    ...riga,
    dettagli: { campi: ["a", "b"], valori: { x: 1 } },
  };
  const letto = { ...riga, dettagli: { valori: { x: 1 }, campi: ["a", "b"] } };
  const h = firmaAudit(scritto, CHIAVE);
  assert.equal(
    verificaAudit(letto, h, CHIAVE),
    true,
    "същото съдържание с друг ред на ключовете трябва да се верифицира",
  );
});

test("вложените обекти също се канонизират", () => {
  const a = { ...riga, dettagli: { v: { z: 1, a: { m: 1, b: 2 } } } };
  const b = { ...riga, dettagli: { v: { a: { b: 2, m: 1 }, z: 1 } } };
  assert.equal(verificaAudit(b, firmaAudit(a, CHIAVE), CHIAVE), true);
});
