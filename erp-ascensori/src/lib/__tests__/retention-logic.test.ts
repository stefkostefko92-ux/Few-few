import test from "node:test";
import assert from "node:assert/strict";
import {
  soglie,
  daEliminare,
  MESI_ACCESSO,
  ANNI_CONTABILE,
  GIORNI_TELEMETRIA,
} from "../retention-logic";

const OGGI = new Date("2026-07-25T00:00:00.000Z");

test("праговете следват законовите срокове", () => {
  const s = soglie(OGGI);
  assert.equal(s.accesso.toISOString(), "2026-01-25T00:00:00.000Z"); // -6 месеца
  assert.equal(s.contabile.toISOString(), "2016-07-25T00:00:00.000Z"); // -10 години
  assert.equal(s.telemetria.toISOString(), "2026-04-26T00:00:00.000Z"); // -90 дни
  assert.equal(MESI_ACCESSO, 6);
  assert.equal(ANNI_CONTABILE, 10);
  assert.equal(GIORNI_TELEMETRIA, 90);
});

test("вход отпреди 7 месеца се трие, отпреди 5 — не", () => {
  assert.equal(daEliminare({ azione: "LOGIN", createdAt: new Date("2025-12-25T00:00:00Z") }, OGGI), true);
  assert.equal(daEliminare({ azione: "LOGIN", createdAt: new Date("2026-02-25T00:00:00Z") }, OGGI), false);
});

test("счетоводната следа надживява 7 месеца и пада чак след 10 години", () => {
  const preteVecchia = new Date("2025-12-25T00:00:00Z");
  assert.equal(daEliminare({ azione: "CREATE", createdAt: preteVecchia }, OGGI), false);
  assert.equal(
    daEliminare({ azione: "CREATE", createdAt: new Date("2015-01-01T00:00:00Z") }, OGGI),
    true
  );
});

test("непознато действие получава ДЪЛГИЯ срок (безопасната посока)", () => {
  // Ново действие, добавено утре, не бива да изчезне тихо след 6 месеца.
  const riga = { azione: "FIRMA_DIGITALE", createdAt: new Date("2025-12-25T00:00:00Z") };
  assert.equal(daEliminare(riga, OGGI), false);
});

test("точно на прага редът остава (строго по-малко)", () => {
  const s = soglie(OGGI);
  assert.equal(daEliminare({ azione: "LOGIN", createdAt: s.accesso }, OGGI), false);
  assert.equal(
    daEliminare({ azione: "LOGIN", createdAt: new Date(s.accesso.getTime() - 1) }, OGGI),
    true
  );
});
