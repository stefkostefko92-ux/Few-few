// HMAC подпис на audit редовете: детерминизъм + откриване на манипулация.
import { test } from "node:test";
import assert from "node:assert/strict";
import { firmaAudit, verificaAudit, type RigaAudit, verificaConRotazione, VERSIONE_CORRENTE } from "../audit-hmac";

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

// ── Верига и ротация на ключа ───────────────────────────────────────────────

test("версия 3 включва подписа на предходния ред в канона", () => {
  const base = {
    azione: "CREATE",
    entita: "fatture",
    entitaId: "x",
    dettagli: null,
    ip: null,
    userAgent: null,
    utenteId: "u",
    createdAt: new Date("2026-07-25T10:00:00Z"),
  };
  const a = firmaAudit({ ...base, hmacPrecedente: "aaa" }, CHIAVE, 3);
  const b = firmaAudit({ ...base, hmacPrecedente: "bbb" }, CHIAVE, 3);
  // Един и същ ред с различен предходник дава РАЗЛИЧЕН подпис — това е
  // цялата идея на веригата.
  assert.notEqual(a, b);

  // Версия 2 не гледа предходника: подписът е един и същ.
  assert.equal(
    firmaAudit({ ...base, hmacPrecedente: "aaa" }, CHIAVE, 2),
    firmaAudit({ ...base, hmacPrecedente: "bbb" }, CHIAVE, 2),
  );
});

test("изтрит ред къса веригата", () => {
  const riga = (i: number, prec: string | null) => ({
    azione: "UPDATE",
    entita: "impianti",
    entitaId: `id-${i}`,
    dettagli: null,
    ip: null,
    userAgent: null,
    utenteId: "u",
    createdAt: new Date(Date.UTC(2026, 6, 25, 10, i)),
    hmacPrecedente: prec,
  });

  const r1 = riga(1, null);
  const h1 = firmaAudit(r1, CHIAVE, 3);
  const r2 = riga(2, h1);
  const h2 = firmaAudit(r2, CHIAVE, 3);
  const r3 = riga(3, h2);
  const h3 = firmaAudit(r3, CHIAVE, 3);

  // Всеки ред поотделно е валиден…
  assert.equal(verificaAudit(r3, h3, CHIAVE, 3), true);
  // …но ако r2 бъде изтрит, r3 сочи подпис, който вече го няма в поредицата.
  const poredicaBezR2 = [
    { r: r1, h: h1 },
    { r: r3, h: h3 },
  ];
  assert.notEqual(poredicaBezR2[1].r.hmacPrecedente, poredicaBezR2[0].h);
});

test("ротацията приема стария ключ при ПРОВЕРКА", () => {
  const VECCHIA = "chiave_precedente_di_almeno_32_caratteri!";
  const r = {
    azione: "LOGIN",
    entita: "users",
    entitaId: "u",
    dettagli: null,
    ip: "10.0.0.1",
    userAgent: "node",
    utenteId: "u",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    hmacPrecedente: null,
  };
  const firmatoConVecchia = firmaAudit(r, VECCHIA, 3);

  // С новия ключ сам по себе си — невалиден.
  assert.equal(verificaAudit(r, firmatoConVecchia, CHIAVE, 3), false);

  // С ротация — валиден, и се знае, че е със стария ключ.
  const esito = verificaConRotazione(r, firmatoConVecchia, {
    corrente: CHIAVE,
    precedente: VECCHIA,
  });
  assert.equal(esito.valida, true);
  assert.equal(esito.conChiavePrecedente, true);

  // Без конфигуриран стар ключ — пак невалиден (не се приема мълчаливо).
  assert.equal(verificaConRotazione(r, firmatoConVecchia, { corrente: CHIAVE }).valida, false);
});

test("текущата версия на канона е 3", () => {
  assert.equal(VERSIONE_CORRENTE, 3);
});
